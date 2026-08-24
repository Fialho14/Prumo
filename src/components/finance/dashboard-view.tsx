"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PencilLine, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { quickEditSnapshotAction } from "@/app/actions";
import { usePrivacy } from "@/components/shell/privacy-provider";
import { PrivateAmount } from "@/components/ui/private-amount";
import { Modal } from "@/components/ui/modal";
import { centsToInput, formatCurrency, formatPercent, parseMoneyToCents } from "@/lib/domain/money";
import { daysAgoLabel, formatDate } from "@/lib/domain/dates";
import type { CategoryBalance, DashboardData } from "@/lib/domain/types";
import { CategoryIcon } from "./category-icon";
import { WorthChart } from "./worth-chart";
import styles from "./finance.module.css";

export function DashboardView({ data, today }: { data: DashboardData; today: string }) {
  const router = useRouter();
  const { togglePrivacyMode, isPrivacyMode } = usePrivacy();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryBalance | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sameDateConflict, setSameDateConflict] = useState(false);
  const quickEditInputRef = useRef<HTMLInputElement>(null);
  const submitInFlightRef = useRef(false);
  const heroAmountSize =
    data.stats.totalCents >= 10_000_000_000
      ? "long"
      : data.stats.totalCents >= 100_000_000
        ? "medium"
        : "short";

  const editedCents = useMemo(() => {
    try {
      return parseMoneyToCents(input);
    } catch {
      return null;
    }
  }, [input]);

  const openQuickEdit = (category: CategoryBalance) => {
    if (category.archivedAt) {
      router.push("/registos/novo");
      return;
    }
    setEditing(category);
    setInput(centsToInput(category.amountCents));
    setError(null);
    setSameDateConflict(false);
  };

  const saveQuickEdit = async (allowSameDate = false) => {
    if (submitInFlightRef.current) return;
    if (!editing || editedCents === null) {
      setError("Introduz um montante válido.");
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await quickEditSnapshotAction({
        categoryId: editing.id,
        amountCents: editedCents,
        date: today,
        allowSameDate,
      });
      if (!result.ok) {
        if (result.error.code === "same_date_conflict") {
          setSameDateConflict(true);
        } else {
          setError(result.error.message);
        }
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar se o snapshot ficou guardado. Consulta o histórico antes de repetir, para evitar um registo duplicado.",
      );
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (!data.latest) {
    return (
      <main className={styles.emptyState}>
        <h1>O teu património começa aqui.</h1>
        <p>Cria um snapshot com os valores atuais. Depois, cada atualização torna a evolução mais clara.</p>
        <div className={styles.stateActions}>
          <Link className={styles.primaryButton} href="/registos/novo"><Plus size={16} /> Novo snapshot</Link>
          <Link className={styles.secondaryButton} href="/categorias">Gerir categorias</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroGrid} aria-labelledby="patrimonio-heading">
        <div className={styles.worthHero}>
          <h1 className={styles.eyebrow} id="patrimonio-heading">
            Património <span className={styles.heroDate}>· {formatDate(data.latest.date)}</span>
          </h1>
          <button
            className={styles.heroAmountButton}
            data-value-size={isPrivacyMode ? "short" : heroAmountSize}
            onClick={togglePrivacyMode}
            type="button"
            aria-label={isPrivacyMode ? "Mostrar valores" : "Ocultar valores"}
          >
            <PrivateAmount className={styles.heroAmount} amountCents={data.stats.totalCents} />
          </button>
          <p className={styles.heroChange}>
            <strong className={data.stats.deltaCents >= 0 ? styles.positive : styles.negative}>
              <PrivateAmount amountCents={data.stats.deltaCents} showSign />
            </strong>
            <span>desde o último registo</span>
          </p>
          <p className={styles.heroChange}>
            <strong><PrivateAmount amountCents={data.stats.growthCents} showSign /></strong>
            <span>desde {formatDate(data.first!.date)}</span>
          </p>
          <Link className={styles.heroAction} href="/registos/novo">
            <Plus size={16} /> Atualizar património
          </Link>
        </div>

        <div className={styles.allocationPanel}>
          <div className={styles.allocationHeader}>
            <h2>Onde está</h2>
            <span className={styles.allocationHint}>Clica para editar</span>
          </div>
          <div className={styles.allocationStrip} role="group" aria-label="Distribuição do património">
            {data.categories.filter((category) => category.amountCents > 0).map((category) => (
              <button
                className={styles.allocationSegment}
                key={category.id}
                onClick={() => openQuickEdit(category)}
                onFocus={() => setActiveCategory(category.id)}
                onBlur={() => setActiveCategory(null)}
                onMouseEnter={() => setActiveCategory(category.id)}
                onMouseLeave={() => setActiveCategory(null)}
                style={{ background: category.color, width: `${category.percentage * 100}%` }}
                type="button"
                aria-label={
                  isPrivacyMode
                    ? category.name
                    : `${category.name}, ${formatCurrency(category.amountCents)}, ${formatPercent(category.percentage)}, ${category.archivedAt ? "ajustar num snapshot completo" : "editar valor"}`
                }
              />
            ))}
          </div>
          <ul className={styles.categoryList}>
            {data.categories.map((category) => (
              <li
                className={styles.categoryRow}
                data-muted={activeCategory !== null && activeCategory !== category.id}
                key={category.id}
                onFocus={() => setActiveCategory(category.id)}
                onBlur={() => setActiveCategory(null)}
                onMouseEnter={() => setActiveCategory(category.id)}
                onMouseLeave={() => setActiveCategory(null)}
              >
                <div className={styles.categoryIdentity}>
                  <span
                    className={styles.categoryIcon}
                    style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 14%, transparent)` }}
                  >
                    <CategoryIcon icon={category.icon} />
                  </span>
                  <span className={styles.categoryName}>
                    {category.name}
                    <span className={styles.categoryMeta}>
                      {category.archivedAt ? "Arquivada · " : ""}{formatPercent(category.percentage)}
                      {category.deltaCents !== 0 && (
                        <> · <PrivateAmount amountCents={category.deltaCents} showSign /> desde o último</>
                      )}
                    </span>
                  </span>
                </div>
                <button
                  aria-label={category.archivedAt ? `Ajustar ${category.name} num snapshot completo` : `Editar ${category.name}`}
                  className={styles.categoryValueButton}
                  onClick={() => openQuickEdit(category)}
                  type="button"
                >
                  <PrivateAmount amountCents={category.amountCents} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <WorthChart categories={data.chartCategories} points={data.chart} />

      <section className={styles.insightsSection} aria-labelledby="insights-heading">
        <h2 className={styles.sectionHeading} id="insights-heading">Leituras</h2>
        <div className={styles.insightsGrid}>
          {data.record && (
            <div className={styles.insight}>
              <span className={styles.insightLabel}>Maior património</span>
              <strong className={styles.insightValue}>
                <PrivateAmount amountCents={data.record.totalCents} /> · {formatDate(data.record.date)}
              </strong>
            </div>
          )}
          <div className={styles.insight}>
            <span className={styles.insightLabel}>Crescimento desde o início</span>
            <strong className={styles.insightValue}><PrivateAmount amountCents={data.stats.growthCents} showSign /></strong>
          </div>
          <div className={styles.insight}>
            <span className={styles.insightLabel}>Capital investido</span>
            <strong className={styles.insightValue}><PrivateAmount amountCents={data.stats.investedCents} /></strong>
          </div>
          <div className={styles.insight}>
            <span className={styles.insightLabel}>Liquidez</span>
            <strong className={styles.insightValue}><PrivateAmount amountCents={data.stats.liquidCents} /></strong>
          </div>
          <div className={styles.insight}>
            <span className={styles.insightLabel}>Poupado</span>
            <strong className={styles.insightValue}><PrivateAmount amountCents={data.stats.savingsCents} /></strong>
          </div>
          <div className={styles.insight}>
            <span className={styles.insightLabel}>Última atualização</span>
            <strong className={styles.insightValue}>{daysAgoLabel(data.latest.date)}</strong>
          </div>
        </div>
      </section>

      <Modal
        className={styles.dialog}
        describedBy="quick-edit-description"
        dismissDisabled={submitting}
        initialFocusRef={quickEditInputRef}
        labelledBy="quick-edit-heading"
        onDismiss={() => setEditing(null)}
        open={editing !== null}
      >
        {editing ? (
          <>
            <h2 id="quick-edit-heading">Atualizar {editing.name}</h2>
            <p id="quick-edit-description">Será criado um snapshot completo sem alterar o registo anterior.</p>
            <div className={styles.quickEditComparison}>
              <PrivateAmount amountCents={editing.amountCents} />
              <ArrowRight aria-hidden="true" size={17} />
              <span>{editedCents === null ? "—" : <PrivateAmount amountCents={editedCents} />}</span>
            </div>
            <label className={styles.fieldLabel}>
              Novo valor
              <span className={styles.moneyInputWrap}>
                <input
                  autoComplete="off"
                  className={styles.moneyInput}
                  inputMode="decimal"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !submitting) void saveQuickEdit();
                  }}
                  ref={quickEditInputRef}
                  type={isPrivacyMode ? "password" : "text"}
                  value={input}
                />
                <span className={styles.moneySuffix}>€</span>
              </span>
            </label>
            {editedCents !== null && (
              <p>
                Novo património: <PrivateAmount amountCents={data.stats.totalCents - editing.amountCents + editedCents} />
                {" · "}<PrivateAmount amountCents={editedCents - editing.amountCents} showSign />
              </p>
            )}
            {sameDateConflict && (
              <p className={styles.formError} role="alert">
                Já existe um snapshot hoje. Podes guardar outro ou continuar a editar.
              </p>
            )}
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={submitting} onClick={() => setEditing(null)} type="button">Cancelar</button>
              {sameDateConflict ? (
                <button className={styles.primaryButton} disabled={submitting} onClick={() => void saveQuickEdit(true)} type="button">
                  Guardar outro snapshot
                </button>
              ) : (
                <button className={styles.primaryButton} disabled={submitting || editedCents === null} onClick={() => void saveQuickEdit()} type="button">
                  <PencilLine size={15} /> {submitting ? "A guardar…" : "Guardar snapshot de hoje"}
                </button>
              )}
            </div>
          </>
        ) : null}
      </Modal>
    </main>
  );
}
