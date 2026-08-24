"use client";

import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  archiveCategoryAction,
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import type { Category, CategoryType } from "@/lib/domain/types";
import { CATEGORY_ICON_KEYS } from "@/lib/domain/validation";
import { CategoryIcon } from "./category-icon";
import styles from "./finance.module.css";

const TYPE_LABELS: Record<CategoryType, string> = {
  available: "Disponível",
  reserved: "Reservado",
  investment: "Investimento",
  asset: "Ativo",
  savings: "Poupança",
  other: "Outro",
};

const COLORS = ["#28A889", "#D69A3A", "#4C8DDA", "#8D72E1", "#C87558", "#597E52", "#DB6B78", "#6F7C8B"];

type FormState = {
  name: string;
  type: CategoryType;
  color: string;
  icon: (typeof CATEGORY_ICON_KEYS)[number];
};

const EMPTY_FORM: FormState = { name: "", type: "other", color: COLORS[0], icon: "wallet" };

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const categories = useMemo(() => {
    const active = initialCategories.filter((category) => !category.archivedAt);
    if (!orderOverride) return active;
    const positions = new Map(orderOverride.map((id, index) => [id, index]));
    return [...active].sort(
      (a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [initialCategories, orderOverride]);
  const archived = initialCategories.filter((category) => category.archivedAt);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryNameRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const mutationInFlightRef = useRef(false);
  const reorderInFlightRef = useRef(false);
  const controlsBusy = busy || reordering;

  const openNew = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
    setError(null);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setForm({
      name: category.name,
      type: category.type,
      color: category.color,
      icon: CATEGORY_ICON_KEYS.includes(category.icon as (typeof CATEGORY_ICON_KEYS)[number])
        ? (category.icon as (typeof CATEGORY_ICON_KEYS)[number])
        : "wallet",
    });
    setError(null);
  };

  const save = async () => {
    if (mutationInFlightRef.current || reorderInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = editing === "new"
        ? await createCategoryAction(form)
        : editing
          ? await updateCategoryAction(editing.id, { ...form, revision: editing.revision })
          : null;
      if (!result) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar se a categoria ficou guardada. Atualiza a página antes de repetir para evitar alterações duplicadas.",
      );
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const reorder = async (index: number, direction: -1 | 1) => {
    if (reorderInFlightRef.current || mutationInFlightRef.current) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    const previousOrder = categories.map((category) => category.id);
    reorderInFlightRef.current = true;
    setReordering(true);
    setError(null);
    setOrderOverride(next.map((category) => category.id));
    try {
      const result = await reorderCategoriesAction(next.map((category) => category.id));
      if (!result.ok) {
        setOrderOverride(previousOrder);
        setError(result.error.message);
      } else {
        router.refresh();
      }
    } catch {
      setOrderOverride(null);
      setError("Não foi possível confirmar a nova ordem. A lista foi reconciliada com os dados locais; confirma-a antes de repetir.");
      router.refresh();
    } finally {
      reorderInFlightRef.current = false;
      setReordering(false);
    }
  };

  const archive = async (category: Category, value: boolean) => {
    if (mutationInFlightRef.current || reorderInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await archiveCategoryAction(category.id, value);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setError(
        `Não foi possível confirmar se a categoria foi ${value ? "arquivada" : "restaurada"}. Atualiza a página antes de repetir.`,
      );
      router.refresh();
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const remove = async (category: Category) => {
    if (mutationInFlightRef.current || reorderInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteCategoryAction(category.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a eliminação. Atualiza a página antes de repetir; a categoria pode já ter sido removida.",
      );
      router.refresh();
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Estrutura do património</p>
          <h1 className={styles.pageTitle}>Categorias</h1>
          <p className={styles.pageIntro}>Define onde está o dinheiro. Arquivar preserva o histórico; apagar só é possível quando nunca houve valores.</p>
        </div>
        <button className={styles.primaryButton} disabled={controlsBusy} onClick={openNew} type="button"><Plus aria-hidden="true" size={16} /> Nova categoria</button>
      </header>

      {error && !editing && !deleting && <p className={styles.formError} role="alert">{error}</p>}
      <section className={styles.categoryManager} aria-busy={reordering} aria-label="Categorias ativas">
        {categories.map((category, index) => (
          <div className={styles.managerRow} key={category.id}>
            <div className={styles.categoryIdentity}>
              <span className={styles.categoryIcon} style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 14%, transparent)` }}>
                <CategoryIcon icon={category.icon} />
              </span>
              <span className={styles.categoryName}>{category.name}</span>
            </div>
            <span className={styles.typeLabel}>{TYPE_LABELS[category.type]}</span>
            <div className={styles.managerActions}>
              <button aria-label={`Mover ${category.name} para cima`} className={styles.iconButton} disabled={controlsBusy || index === 0} onClick={() => void reorder(index, -1)} type="button"><ArrowUp aria-hidden="true" size={15} /></button>
              <button aria-label={`Mover ${category.name} para baixo`} className={styles.iconButton} disabled={controlsBusy || index === categories.length - 1} onClick={() => void reorder(index, 1)} type="button"><ArrowDown aria-hidden="true" size={15} /></button>
              <button aria-label={`Editar ${category.name}`} className={styles.iconButton} disabled={controlsBusy} onClick={() => openEdit(category)} type="button"><Pencil aria-hidden="true" size={15} /></button>
              <button aria-label={`Arquivar ${category.name}`} className={styles.iconButton} disabled={controlsBusy} onClick={() => void archive(category, true)} type="button"><Archive aria-hidden="true" size={15} /></button>
            </div>
          </div>
        ))}
      </section>

      {archived.length > 0 && (
        <section className={styles.archivedSection}>
          <h2>Arquivadas</h2>
          <div className={styles.categoryManager}>
            {archived.map((category) => (
              <div className={styles.managerRow} key={category.id}>
                <div className={styles.categoryIdentity}>
                  <span className={styles.categoryIcon} style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 14%, transparent)` }}><CategoryIcon icon={category.icon} /></span>
                  <span className={styles.categoryName}>{category.name}</span>
                </div>
                <span className={styles.typeLabel}>{TYPE_LABELS[category.type]}</span>
                <div className={styles.managerActions}>
                  <button aria-label={`Restaurar ${category.name}`} className={styles.iconButton} disabled={controlsBusy} onClick={() => void archive(category, false)} type="button"><RotateCcw aria-hidden="true" size={15} /></button>
                  <button aria-label={`Apagar ${category.name}`} className={styles.iconButton} disabled={controlsBusy} onClick={() => { setDeleting(category); setError(null); }} type="button"><Trash2 aria-hidden="true" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        className={styles.dialog}
        describedBy="category-dialog-description"
        dismissDisabled={busy}
        initialFocusRef={categoryNameRef}
        labelledBy="category-dialog-heading"
        onDismiss={() => setEditing(null)}
        open={editing !== null}
      >
        {editing ? (
          <form
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && form.name.trim()) void save();
            }}
          >
            <h2 id="category-dialog-heading">{editing === "new" ? "Nova categoria" : `Editar ${editing.name}`}</h2>
            <p id="category-dialog-description">Define como esta categoria aparece e contribui para as leituras do património.</p>
            <div className={styles.dialogFields}>
              <label className={styles.fieldLabel}>
                Nome
                <input className={styles.textInput} disabled={busy} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} ref={categoryNameRef} required value={form.name} />
              </label>
              <label className={styles.fieldLabel}>
                Tipo
                <select className={styles.selectInput} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as CategoryType }))} value={form.type}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <fieldset className={styles.fieldLabel}>
                <legend>Cor</legend>
                <span className={styles.colorChoices}>
                  {COLORS.map((color) => (
                    <button aria-label={`Cor ${color}`} aria-pressed={form.color === color} className={styles.colorChoice} data-active={form.color === color} disabled={busy} key={color} onClick={() => setForm((current) => ({ ...current, color }))} type="button">
                      <span className={styles.colorSwatch} style={{ background: color }} />
                    </button>
                  ))}
                </span>
              </fieldset>
              <fieldset className={styles.fieldLabel}>
                <legend>Ícone</legend>
                <span className={styles.iconChoices}>
                  {CATEGORY_ICON_KEYS.map((icon) => (
                    <button aria-label={`Ícone ${icon}`} aria-pressed={form.icon === icon} className={styles.iconChoice} data-active={form.icon === icon} disabled={busy} key={icon} onClick={() => setForm((current) => ({ ...current, icon }))} type="button">
                      <CategoryIcon icon={icon} />
                    </button>
                  ))}
                </span>
              </fieldset>
            </div>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => setEditing(null)} type="button">Cancelar</button>
              <button className={styles.primaryButton} disabled={busy || !form.name.trim()} type="submit">{busy ? "A guardar…" : "Guardar"}</button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        className={styles.dialog}
        describedBy="delete-category-description"
        dismissDisabled={busy}
        initialFocusRef={deleteCancelRef}
        labelledBy="delete-category-heading"
        onDismiss={() => setDeleting(null)}
        open={deleting !== null}
        role="alertdialog"
      >
        {deleting ? (
          <>
            <h2 id="delete-category-heading">Apagar {deleting.name}?</h2>
            <p id="delete-category-description">Só é possível apagar uma categoria sem histórico. A aplicação cria um backup verificado antes de tentar.</p>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => setDeleting(null)} ref={deleteCancelRef} type="button">Cancelar</button>
              <button className={styles.dangerButton} disabled={busy} onClick={() => void remove(deleting)} type="button">
                {busy ? "A criar backup…" : "Apagar categoria"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </main>
  );
}
