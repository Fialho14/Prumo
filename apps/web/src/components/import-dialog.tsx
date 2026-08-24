import { AlertTriangle, Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatCurrency } from "@/lib/domain/money";
import {
  parseFinancialFile,
  type FinancialFile,
  type FinancialImportResult,
  type WebPortfolio,
} from "../lib";
import { useModalFocus } from "./use-modal-focus";

export function ImportDialog({
  file,
  initialResult,
  onClose,
  onImport,
}: {
  file: FinancialFile;
  initialResult: FinancialImportResult;
  onClose: () => void;
  onImport: (portfolio: WebPortfolio) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState(initialResult);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { preview } = result;

  useModalFocus(dialogRef, onClose, saving || loadingSheet);

  const changeSheet = async (sheetName: string) => {
    setLoadingSheet(true);
    setError(null);
    try {
      setResult(await parseFinancialFile(file, sheetName));
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "This sheet could not be read.");
    } finally {
      setLoadingSheet(false);
    }
  };

  const confirm = async () => {
    if (!result.portfolio || !preview.canImport) return;
    setSaving(true);
    setError(null);
    try {
      await onImport(result.portfolio);
      onClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The data could not be saved in this browser.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !loadingSheet) onClose();
      }}
    >
      <div
        className="dialog-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        tabIndex={-1}
      >
        <header className="dialog-card__header">
          <div>
            <h2 id="import-dialog-title">Review before opening</h2>
            <p>{preview.fileName} · processed in this browser</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close import preview" onClick={onClose} disabled={saving || loadingSheet}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="dialog-card__body">
          {error ? <div className="error-banner" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {error}</div> : null}

          {preview.availableSheets.length > 1 ? (
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label htmlFor="import-sheet">Workbook sheet</label>
              <select
                id="import-sheet"
                value={preview.sheetName ?? ""}
                disabled={loadingSheet}
                onChange={(event) => void changeSheet(event.target.value)}
              >
                {preview.availableSheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
              </select>
            </div>
          ) : null}

          <div className="preview-summary" role="group" aria-label="Import summary">
            <div><strong>{preview.snapshotCount}</strong><span>valid snapshots</span></div>
            <div><strong>{preview.categories.length}</strong><span>categories found</span></div>
            <div><strong>{preview.skippedRowCount}</strong><span>rows skipped</span></div>
          </div>

          <div className="preview-details">
            <section>
              <h3>Categories</h3>
              {preview.categories.length ? (
                <ul>{preview.categories.map((category) => <li key={category}>{category}</li>)}</ul>
              ) : <p className="text-muted">No balance columns found.</p>}
            </section>
            <section>
              <h3>Checks</h3>
              <ul>
                <li>{preview.duplicateDates.length ? `${preview.duplicateDates.length} duplicate date${preview.duplicateDates.length === 1 ? "" : "s"}` : "No duplicate dates"}</li>
                <li>{preview.unknownColumns.length ? `Ignored: ${preview.unknownColumns.join(", ")}` : "No unknown columns"}</li>
                <li>{preview.errors.length ? `${preview.errors.length} issue${preview.errors.length === 1 ? "" : "s"} found` : "No row errors"}</li>
              </ul>
            </section>
          </div>

          {preview.errors.length ? (
            <div className="error-banner" role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                Invalid rows will stay out of the import. {preview.errors.slice(0, 3).map((issue) => issue.row ? `Row ${issue.row}: ${issue.message}` : issue.message).join(" ")}
              </span>
            </div>
          ) : (
            <div className="info-banner"><Check size={16} aria-hidden="true" /> The preview is ready. Nothing has been saved yet.</div>
          )}

          <div className="preview-table-wrap">
            <table className="preview-table">
              <caption className="sr-only">First valid and invalid rows in the selected file</caption>
              <thead>
                <tr><th>Row</th><th>Date</th><th>Total</th><th>Note</th><th>Status</th></tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 8).map((row) => (
                  <tr key={row.sourceRow}>
                    <td>{row.sourceRow}</td>
                    <td>{row.date ?? "—"}</td>
                    <td>{row.totalCents === null ? "—" : formatCurrency(row.totalCents)}</td>
                    <td>{row.note || "—"}</td>
                    <td>{row.valid ? "Ready" : "Skipped"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="dialog-card__footer">
          <button className="button button--ghost" type="button" onClick={onClose} disabled={saving || loadingSheet}>Choose another file</button>
          <button className="button button--primary" type="button" onClick={() => void confirm()} disabled={!preview.canImport || saving || loadingSheet}>
            {saving ? "Saving locally…" : loadingSheet ? "Reading sheet…" : `Open ${preview.snapshotCount} snapshots`}
          </button>
        </footer>
      </div>
    </div>
  );
}
