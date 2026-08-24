"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { deleteSnapshotAction, duplicateSnapshotAction } from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import { PrivateAmount } from "@/components/ui/private-amount";
import { formatDate } from "@/lib/domain/dates";
import type { Category, Snapshot } from "@/lib/domain/types";
import { CategoryIcon } from "./category-icon";
import styles from "./finance.module.css";

export function HistoryView({
  snapshots,
  categories,
  today,
}: {
  snapshots: Snapshot[];
  categories: Category[];
  today: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<Snapshot | null>(null);
  const [duplicating, setDuplicating] = useState<Snapshot | null>(null);
  const [duplicateDate, setDuplicateDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicateDateRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const operationInFlightRef = useRef(false);
  const years = useMemo(() => {
    const groups = new Map<string, Array<{ snapshot: Snapshot; previous: Snapshot | null }>>();
    snapshots.forEach((snapshot, index) => {
      const year = snapshot.date.slice(0, 4);
      const list = groups.get(year) ?? [];
      list.push({ snapshot, previous: snapshots[index + 1] ?? null });
      groups.set(year, list);
    });
    return [...groups.entries()];
  }, [snapshots]);

  const confirmDelete = async () => {
    if (!deleting || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteSnapshotAction(deleting.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a eliminação. Atualiza o histórico antes de repetir; o snapshot pode já ter sido removido.",
      );
    } finally {
      operationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const confirmDuplicate = async () => {
    if (!duplicating || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await duplicateSnapshotAction(duplicating.id, duplicateDate);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDuplicating(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a duplicação. Atualiza o histórico antes de repetir, para evitar um snapshot duplicado.",
      );
    } finally {
      operationInFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Todos os momentos</p>
          <h1 className={styles.pageTitle}>Histórico</h1>
          <p className={styles.pageIntro}>Cada linha é uma resposta à pergunta: “neste dia, quanto tinha?”</p>
        </div>
        <Link className={styles.primaryButton} href="/registos/novo"><Plus aria-hidden="true" size={16} /> Novo snapshot</Link>
      </header>

      {snapshots.length === 0 ? (
        <section className={styles.emptyState} style={{ minHeight: "45vh" }}>
          <h2>Ainda não há histórico.</h2>
          <p>O primeiro snapshot cria o ponto de partida.</p>
          <div className={styles.stateActions}><Link className={styles.primaryButton} href="/registos/novo">Criar primeiro snapshot</Link></div>
        </section>
      ) : (
        <div className={styles.historyYears}>
          {years.map(([year, entries]) => (
            <section className={styles.historyYear} key={year} aria-labelledby={`year-${year}`}>
              <h2 className={styles.yearLabel} id={`year-${year}`}>{year}</h2>
              <div className={styles.snapshotList}>
                {entries.map(({ snapshot, previous }) => {
                  const values = new Map(snapshot.values.map((value) => [value.categoryId, value.amountCents]));
                  const delta = snapshot.totalCents - (previous?.totalCents ?? snapshot.totalCents);
                  return (
                    <details className={styles.snapshotItem} key={snapshot.id}>
                      <summary className={styles.snapshotSummary}>
                        <time className={styles.snapshotDate} dateTime={snapshot.date}>{formatDate(snapshot.date)}</time>
                        <PrivateAmount className={styles.snapshotTotal} amountCents={snapshot.totalCents} />
                        <span className={`${styles.snapshotDelta} ${delta > 0 ? styles.positive : delta < 0 ? styles.negative : ""}`}>
                          <PrivateAmount amountCents={delta} showSign />
                        </span>
                        <span className={styles.snapshotNote}>{snapshot.note || "Sem nota"}</span>
                        <ChevronDown aria-hidden="true" size={16} />
                      </summary>
                      <div className={styles.snapshotDetail}>
                        <dl className={styles.snapshotValues}>
                          {categories
                            .filter((category) => values.has(category.id))
                            .map((category) => (
                              <div className={styles.snapshotValue} key={category.id}>
                                <dt className={styles.categoryIdentity}>
                                  <span style={{ color: category.color }}><CategoryIcon icon={category.icon} size={13} /></span>
                                  {category.name}
                                </dt>
                                <dd><PrivateAmount amountCents={values.get(category.id)!} /></dd>
                              </div>
                            ))}
                        </dl>
                        {snapshot.note && <p className={styles.pageIntro}>{snapshot.note}</p>}
                        <div className={styles.snapshotActions}>
                          <Link className={styles.secondaryButton} href={`/historico/${snapshot.id}`}>
                            <Pencil aria-hidden="true" size={14} /> Editar
                          </Link>
                          <button
                            className={styles.secondaryButton}
                            onClick={() => {
                              setDuplicating(snapshot);
                              setDuplicateDate(today);
                              setError(null);
                            }}
                            type="button"
                          >
                            <Copy aria-hidden="true" size={14} /> Duplicar
                          </button>
                          <button className={styles.dangerButton} onClick={() => { setDeleting(snapshot); setError(null); }} type="button">
                            <Trash2 aria-hidden="true" size={14} /> Apagar
                          </button>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        className={styles.dialog}
        describedBy="duplicate-description"
        dismissDisabled={busy}
        initialFocusRef={duplicateDateRef}
        labelledBy="duplicate-heading"
        onDismiss={() => setDuplicating(null)}
        open={duplicating !== null}
      >
        {duplicating ? (
          <>
            <h2 id="duplicate-heading">Duplicar snapshot</h2>
            <p id="duplicate-description">Copia todos os valores de {formatDate(duplicating.date)} para uma nova data.</p>
            <label className={styles.fieldLabel} style={{ marginTop: "1rem" }}>
              Nova data
              <input className={styles.textInput} disabled={busy} onChange={(event) => setDuplicateDate(event.target.value)} ref={duplicateDateRef} type="date" value={duplicateDate} />
            </label>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => setDuplicating(null)} type="button">Cancelar</button>
              <button className={styles.primaryButton} disabled={busy} onClick={() => void confirmDuplicate()} type="button">
                {busy ? "A duplicar…" : "Duplicar"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        className={styles.dialog}
        describedBy="delete-description"
        dismissDisabled={busy}
        initialFocusRef={deleteCancelRef}
        labelledBy="delete-heading"
        onDismiss={() => setDeleting(null)}
        open={deleting !== null}
        role="alertdialog"
      >
        {deleting ? (
          <>
            <h2 id="delete-heading">Apagar o snapshot de {formatDate(deleting.date)}?</h2>
            <p id="delete-description">Será criado um backup de segurança antes da eliminação. Esta ação remove este momento do gráfico.</p>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => setDeleting(null)} ref={deleteCancelRef} type="button">Cancelar</button>
              <button className={styles.dangerButton} disabled={busy} onClick={() => void confirmDelete()} type="button">
                {busy ? "A criar backup…" : "Apagar snapshot"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </main>
  );
}
