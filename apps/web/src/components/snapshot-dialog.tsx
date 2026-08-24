import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { centsToInput, parseMoneyToCents } from "@/lib/domain/money";
import { recordSnapshot, updateSnapshot, type WebPortfolio } from "../lib";
import { useModalFocus } from "./use-modal-focus";

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function SnapshotDialog({
  portfolio,
  onClose,
  onSave,
}: {
  portfolio: WebPortfolio;
  onClose: () => void;
  onSave: (portfolio: WebPortfolio) => Promise<void>;
}) {
  const latest = portfolio.snapshots.at(-1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      portfolio.categories.map((category) => [
        category.id,
        centsToInput(latest?.values.find((value) => value.categoryId === category.id)?.amountCents ?? 0),
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const existing = useMemo(() => portfolio.snapshots.find((snapshot) => snapshot.date === date), [date, portfolio.snapshots]);

  useModalFocus(dialogRef, onClose, saving, "input");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    let amountsCents: Record<string, number>;
    try {
      amountsCents = Object.fromEntries(
        portfolio.categories.map((category) => [category.id, parseMoneyToCents(amounts[category.id] ?? "0")]),
      );
    } catch (inputError) {
      setError(inputError instanceof Error ? inputError.message : "Check the amounts and try again.");
      return;
    }

    setSaving(true);
    try {
      const nextPortfolio = existing
        ? updateSnapshot(portfolio, existing.id, { date, note, amountsCents })
        : recordSnapshot(portfolio, { date, note, amountsCents });
      await onSave(nextPortfolio);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The snapshot could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="dialog-card dialog-card--small"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="snapshot-dialog-title"
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <header className="dialog-card__header">
            <div>
              <h2 id="snapshot-dialog-title">Update snapshot</h2>
              <p>Values are saved only in this browser.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Close" onClick={onClose} disabled={saving}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="dialog-card__body">
            {error ? <div className="error-banner" role="alert">{error}</div> : null}
            {existing ? (
              <div className="info-banner">A snapshot already exists on this date. Saving will replace that snapshot instead of creating a duplicate.</div>
            ) : null}
            <div className="field-grid">
              <div className="field">
                <label htmlFor="snapshot-date">Date</label>
                <input id="snapshot-date" type="date" value={date} required onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="field field--full">
                <label htmlFor="snapshot-note">Note <span className="text-muted">(optional)</span></label>
                <textarea id="snapshot-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed?" />
              </div>
            </div>
            <div className="snapshot-values">
              {portfolio.categories.map((category) => (
                <div className="snapshot-value-row" key={category.id}>
                  <label htmlFor={`amount-${category.id}`}>
                    <span className="category-list__dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
                    {category.name}
                  </label>
                  <input
                    id={`amount-${category.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={amounts[category.id] ?? ""}
                    onChange={(event) => setAmounts((current) => ({ ...current, [category.id]: event.target.value }))}
                    aria-label={`${category.name} amount in euro`}
                  />
                </div>
              ))}
            </div>
          </div>
          <footer className="dialog-card__footer">
            <button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : existing ? "Replace snapshot" : "Save snapshot"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
