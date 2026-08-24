import { Download, FilePlus2, FileSpreadsheet, FolderOpen, Play, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FinancialFile } from "../lib";

export type WelcomeIntent = "open" | "template" | "demo" | null;

export function Welcome({
  intent,
  busy,
  error,
  onChooseFile,
  onStartTemplate,
  onDownloadTemplate,
  onStartDemo,
  onStartEmpty,
}: {
  intent: WelcomeIntent;
  busy: boolean;
  error: string | null;
  onChooseFile: (file: FinancialFile) => void;
  onStartTemplate: () => void;
  onDownloadTemplate: () => void;
  onStartDemo: () => void;
  onStartEmpty: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (intent === "open") openButtonRef.current?.focus();
  }, [intent]);

  return (
    <main className="welcome" id="main-content">
      <div className="container">
        <header className="welcome__header">
          <p className="eyebrow">Prumo Web</p>
          <h1>Welcome to Prumo.</h1>
          <p>Open your data, start with a legible template, or explore a completely fictitious portfolio. You will understand the flow in seconds.</p>
          <span className="welcome__privacy"><ShieldCheck size={14} aria-hidden="true" /> Files are processed locally in this browser</span>
        </header>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <div className="entry-grid">
          <article className="entry-card" data-highlighted={intent === "open" || undefined}>
            <span className="entry-card__icon"><FolderOpen size={21} aria-hidden="true" /></span>
            <h2>Open your file</h2>
            <p>Choose an XLSX or UTF-8 CSV up to 10 MB. See dates, categories, duplicates and errors before confirming.</p>
            <button
              className="button button--primary button--wide"
              ref={openButtonRef}
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet size={16} aria-hidden="true" /> {busy ? "Reading locally…" : "Choose XLSX or CSV"}
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              aria-label="Choose a local XLSX or CSV file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onChooseFile(file);
                event.target.value = "";
              }}
            />
          </article>

          <article className="entry-card" data-highlighted={intent === "template" || undefined}>
            <span className="entry-card__icon"><FilePlus2 size={21} aria-hidden="true" /></span>
            <h2>Start with a template</h2>
            <p>A plain Date · category balances · Note structure, with three rows that are visibly marked as fictitious examples.</p>
            <div className="entry-card__actions">
              <button className="button button--secondary" type="button" disabled={busy} onClick={onStartTemplate}>Use template in Prumo</button>
              <button className="entry-card__text-button" type="button" disabled={busy} onClick={onDownloadTemplate}>
                <Download size={13} aria-hidden="true" /> Download prumo-template.xlsx
              </button>
            </div>
          </article>

          <article className="entry-card" data-highlighted={intent === "demo" || undefined}>
            <span className="entry-card__icon"><Play size={21} aria-hidden="true" /></span>
            <h2>Explore demo</h2>
            <p>Twelve fictitious snapshots, useful categories, notes, growth and a few honest pullbacks. Clearly labelled at all times.</p>
            <button className="button button--secondary button--wide" type="button" disabled={busy} onClick={onStartDemo}>
              <Play size={15} fill="currentColor" aria-hidden="true" /> Explore demo
            </button>
          </article>
        </div>

        <p className="welcome__footnote">
          Prefer a blank canvas? <button className="entry-card__text-button" type="button" disabled={busy} onClick={onStartEmpty}>Start from scratch</button>. Prumo will keep the template categories and remove every example snapshot.
        </p>
      </div>
    </main>
  );
}
