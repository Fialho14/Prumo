"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Save } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createSnapshotAction, updateSnapshotAction } from "@/app/actions";
import { usePrivacy } from "@/components/shell/privacy-provider";
import { PrivateAmount } from "@/components/ui/private-amount";
import { centsToInput, parseMoneyToCents } from "@/lib/domain/money";
import type { Category, Snapshot } from "@/lib/domain/types";
import { CategoryIcon } from "./category-icon";
import styles from "./finance.module.css";

export function SnapshotEditor({
  categories,
  latest,
  editing,
  defaultDate,
}: {
  categories: Category[];
  latest: Snapshot | null;
  editing?: Snapshot;
  defaultDate: string;
}) {
  const router = useRouter();
  const { isPrivacyMode } = usePrivacy();
  const source = editing ?? latest;
  const sourceValues = useMemo(
    () => new Map(source?.values.map((value) => [value.categoryId, value.amountCents])),
    [source],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((category) => [category.id, centsToInput(sourceValues.get(category.id) ?? 0)])),
  );
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sameDateConflict, setSameDateConflict] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(editing?.note));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const submitInFlightRef = useRef(false);

  const parsed = useMemo(() => {
    const result = new Map<string, number>();
    try {
      for (const category of categories) result.set(category.id, parseMoneyToCents(values[category.id] ?? ""));
      return result;
    } catch {
      return null;
    }
  }, [categories, values]);

  const totalCents = parsed ? [...parsed.values()].reduce((sum, value) => sum + value, 0) : null;
  const comparisonTotal = editing?.totalCents ?? latest?.totalCents ?? 0;
  const deltaCents = totalCents === null ? null : totalCents - comparisonTotal;

  const submit = async (allowSameDate = false) => {
    if (submitInFlightRef.current) return;
    if (!parsed) {
      setError("Revê os montantes. Não são permitidos valores negativos.");
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const snapshotValues = categories.map((category) => ({
        categoryId: category.id,
        amountCents: parsed.get(category.id)!,
      }));
      const result = editing
        ? await updateSnapshotAction(editing.id, {
            date,
            note: note.trim() || null,
            values: snapshotValues,
            revision: editing.revision,
            allowSameDate,
          })
        : await createSnapshotAction({
            date,
            note: note.trim() || null,
            values: snapshotValues,
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
      router.push(editing ? "/historico" : "/");
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar se o snapshot ficou guardado. Recarrega o histórico antes de repetir, para evitar um registo duplicado.",
      );
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleFieldKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !submitting) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form className={styles.editorShell} onSubmit={handleSubmit}>
      <Link className={styles.backLink} href={editing ? "/historico" : "/"}>
        <ArrowLeft aria-hidden="true" size={15} /> {editing ? "Voltar ao histórico" : "Voltar à visão geral"}
      </Link>
      <header className={styles.editorHeader}>
        <p className={styles.eyebrow}>{editing ? "Editar snapshot" : "Novo snapshot"}</p>
        <h1>{editing ? "Corrigir este momento" : "Quanto tens agora?"}</h1>
        <p>{editing ? "A alteração fica aplicada a este registo histórico." : "Os valores anteriores já estão preenchidos. Altera apenas o que mudou."}</p>
      </header>

      <div className={styles.amountFields}>
        {categories.map((category, index) => {
          const current = parsed?.get(category.id) ?? null;
          const previous = sourceValues.get(category.id) ?? 0;
          const changed = current !== null && current !== previous;
          return (
            <label className={styles.amountField} data-changed={changed} key={category.id}>
              <span className={styles.fieldIdentity}>
                <span
                  className={styles.categoryIcon}
                  style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 14%, transparent)` }}
                >
                  <CategoryIcon icon={category.icon} />
                </span>
                <span>
                  <span className={styles.fieldName}>{category.name}</span>
                  <span className={styles.fieldDelta}>
                    {category.archivedAt ? "arquivada · define 0 € para a retirar" : changed && current !== null ? <><PrivateAmount amountCents={current - previous} showSign /> de diferença</> : "sem alteração"}
                  </span>
                </span>
              </span>
              <span className={styles.moneyInputWrap}>
                <input
                  ref={(element) => { inputRefs.current[index] = element; }}
                  aria-label={`Valor de ${category.name}`}
                  className={styles.moneyInput}
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(event) => setValues((currentValues) => ({ ...currentValues, [category.id]: event.target.value }))}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => handleFieldKey(event, index)}
                  required
                  type={isPrivacyMode ? "password" : "text"}
                  value={values[category.id]}
                />
                <span className={styles.moneySuffix}>€</span>
              </span>
            </label>
          );
        })}
      </div>

      <details
        className={styles.detailsPanel}
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>Data e nota</summary>
        <div className={styles.detailsGrid}>
          <label className={styles.fieldLabel}>
            Data
            <input className={styles.textInput} max="9999-12-31" onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
          </label>
          <label className={styles.fieldLabel}>
            Nota opcional
            <textarea
              className={styles.textArea}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex.: Transferi dinheiro para o fundo de emergência"
              value={note}
            />
          </label>
        </div>
      </details>

      {sameDateConflict && (
        <div className={styles.formError} role="alert">
          Já existe um snapshot em {date}. Guardar outro mantém ambos e usa o mais recente no gráfico.
          <div className={styles.rowActions} style={{ marginTop: "0.75rem" }}>
            <button className={styles.primaryButton} disabled={submitting} onClick={() => void submit(true)} type="button">
              Guardar ambos
            </button>
            <button className={styles.secondaryButton} onClick={() => setSameDateConflict(false)} type="button">Escolher outra data</button>
          </div>
        </div>
      )}
      {error && <p className={styles.formError} role="alert">{error}</p>}

      <footer className={styles.editorSummary}>
        <div className={styles.editorSummaryInner}>
          <div>
            <span className={styles.liveTotal}>
              {editing ? "Novo total" : "Novo património"}: {totalCents === null ? "—" : <PrivateAmount amountCents={totalCents} />}
            </span>
            <span className={styles.liveDelta}>
              {deltaCents === null ? "Revê os valores" : <><PrivateAmount amountCents={deltaCents} showSign /> {editing ? "neste registo" : "desde o último registo"}</>}
            </span>
          </div>
          <button className={styles.primaryButton} disabled={submitting || totalCents === null} type="submit">
            {submitting ? <><Save aria-hidden="true" size={16} /> A guardar…</> : <><Check aria-hidden="true" size={16} /> {editing ? "Guardar alterações" : "Guardar snapshot"}</>}
          </button>
        </div>
      </footer>
    </form>
  );
}
