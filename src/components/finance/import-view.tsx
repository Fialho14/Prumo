"use client";

import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PrivateAmount } from "@/components/ui/private-amount";
import type { Category, CategoryType } from "@/lib/domain/types";
import type { ImportCategoryMapping, ImportMapping, ImportPreview } from "@/lib/services/import";
import styles from "./finance.module.css";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
type CommitResult = { importedRows: number; skippedExactDuplicates: number; createdCategories: Array<{ id: string; name: string }> };

const TYPE_BY_LABEL: Record<string, CategoryType> = {
  corretora: "investment",
  savings: "savings",
  "poupança": "savings",
  coleção: "asset",
};

async function readJson<T>(response: Response): Promise<ApiResult<T>> {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { message: "A resposta local não pôde ser lida." } };
  }
}

function newMapping(columnIndex: number, label: string): ImportCategoryMapping {
  return {
    columnIndex,
    create: {
      name: label || `Categoria ${columnIndex + 1}`,
      type: TYPE_BY_LABEL[label.toLocaleLowerCase("pt-PT")] ?? "other",
      color: "#5B8CFF",
      icon: "wallet",
    },
  };
}

function statusLabel(status: ImportPreview["rows"][number]["status"]): string {
  if (status === "ready") return "Pronto";
  if (status === "exact_duplicate") return "Duplicado — ignorar";
  if (status === "date_conflict") return "Conflito de data";
  return "Inválido";
}

export function ImportView({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [dirty, setDirty] = useState(false);
  const [allowConflicts, setAllowConflicts] = useState(false);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CommitResult | null>(null);

  const headersByIndex = useMemo(
    () => new Map(preview?.headers.map((header) => [header.columnIndex, header.label]) ?? []),
    [preview?.headers],
  );

  const problemRows = useMemo<ImportPreview["issues"]>(() => {
    if (!preview) return [];
    const byRow = new Map(preview.issues.map((issue) => [issue.rowNumber, issue]));
    for (const row of preview.rows) {
      if (row.status === "ready" || !row.message || byRow.has(row.rowNumber)) continue;
      byRow.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        status: row.status,
        message: row.message,
      });
    }
    return [...byRow.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  }, [preview]);

  const requestPreview = async (nextFile: File, options?: { mapping?: ImportMapping; sheetName?: string }) => {
    setBusy("preview");
    setError(null);
    setSuccess(null);
    setPreview(null);
    setMapping(null);
    setDirty(false);
    setAllowConflicts(false);
    try {
      const form = new FormData();
      form.set("file", nextFile);
      if (options?.mapping) form.set("mapping", JSON.stringify(options.mapping));
      if (options?.sheetName) form.set("sheetName", options.sheetName);
      const result = await readJson<ImportPreview>(await fetch("/api/import/preview", { method: "POST", body: form }));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPreview(result.data);
      setMapping(result.data.mapping);
    } catch {
      setError("Não foi possível analisar o ficheiro localmente. Tenta novamente.");
    } finally {
      setBusy(null);
    }
  };

  const chooseTarget = (columnIndex: number, target: string) => {
    if (!mapping || !preview) return;
    const others = mapping.categories.filter((item) => item.columnIndex !== columnIndex);
    let categoriesMapping = others;
    if (target.startsWith("existing:")) {
      categoriesMapping = [...others, { columnIndex, categoryId: target.slice("existing:".length) }];
    } else if (target === "new") {
      categoriesMapping = [...others, newMapping(columnIndex, headersByIndex.get(columnIndex) ?? "")];
    }
    setMapping({ ...mapping, categories: categoriesMapping.sort((a, b) => a.columnIndex - b.columnIndex) });
    setDirty(true);
  };

  const targetFor = (columnIndex: number): string => {
    const item = mapping?.categories.find((entry) => entry.columnIndex === columnIndex);
    if (!item) return "ignore";
    return item.categoryId ? `existing:${item.categoryId}` : "new";
  };

  const commit = async () => {
    if (!file || !preview || !mapping || dirty || success || busy !== null) return;
    setBusy("commit");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mapping", JSON.stringify(mapping));
      form.set("expectedFileSha256", preview.file.sha256);
      form.set("expectedMappingHash", preview.mappingHash);
      form.set("allowDateConflicts", String(allowConflicts));
      const result = await readJson<CommitResult>(await fetch("/api/import/commit", { method: "POST", body: form }));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFile(null);
      setPreview(null);
      setMapping(null);
      setDirty(false);
      setAllowConflicts(false);
      setSuccess(result.data);
      router.refresh();
    } catch {
      setError("Não foi possível concluir a importação local. Tenta novamente.");
    } finally {
      setBusy(null);
    }
  };

  const hasConflicts = Boolean(preview?.summary.dateConflicts);
  const canCommit = Boolean(
    preview && mapping && !dirty && !success && preview.summary.invalid === 0 &&
    (preview.summary.ready > 0 || (allowConflicts && preview.summary.dateConflicts > 0)),
  );

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.backLink} href="/definicoes">← Definições</Link>
          <p className={styles.eyebrow}>Migração sem compromisso</p>
          <h1 className={styles.pageTitle}>Importar histórico</h1>
          <p className={styles.pageIntro}>Primeiro mapeias. Depois revês. Só no fim a aplicação escreve na base de dados.</p>
        </div>
      </header>

      <section className={styles.importStage} aria-busy={busy === "preview"}>
        <label className={styles.fileDrop}>
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby="import-file-help"
            aria-label="Escolher ficheiro Excel ou CSV"
            disabled={busy !== null}
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (!next) return;
              event.currentTarget.value = "";
              setFile(next);
              void requestPreview(next);
            }}
          />
          <FileSpreadsheet aria-hidden="true" size={23} />
          <span aria-live="polite">{busy === "preview" ? "A analisar localmente…" : file?.name ?? "Escolher Excel ou CSV"}</span>
          <small id="import-file-help">Até 10 MB · nenhum upload para a Internet</small>
        </label>
      </section>

      {preview && mapping ? (
        <>
          <section className={styles.mappingPanel}>
            <div className={styles.sectionTitleRow}>
              <div><p className={styles.eyebrow}>1 · Mapeamento</p><h2>O que significa cada coluna?</h2></div>
              {dirty ? <span className={styles.warningPill}>Preview desatualizado</span> : <span className={styles.readyPill}><Check aria-hidden="true" size={13} /> Confirmado</span>}
            </div>
            {preview.file.sheetNames.length > 1 ? (
              <label className={styles.fieldLabel}>Folha
                <select className={styles.selectInput} value={preview.file.sheetName} onChange={(event) => file && void requestPreview(file, { sheetName: event.target.value })}>
                  {preview.file.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            ) : null}
            <div className={styles.mappingGrid}>
              <label><span>Coluna de data</span>
                <select
                  className={styles.selectInput}
                  value={mapping.dateColumn}
                  onChange={(event) => {
                    const dateColumn = Number(event.target.value);
                    setMapping({ ...mapping, dateColumn, noteColumn: mapping.noteColumn === dateColumn ? undefined : mapping.noteColumn, categories: mapping.categories.filter((item) => item.columnIndex !== dateColumn) });
                    setDirty(true);
                  }}
                >
                  {preview.headers.filter((header) => header.label).map((header) => <option key={header.columnIndex} value={header.columnIndex}>{header.label}</option>)}
                </select>
              </label>
              <label><span>Coluna de nota (opcional)</span>
                <select
                  className={styles.selectInput}
                  value={mapping.noteColumn ?? ""}
                  onChange={(event) => {
                    const noteColumn = event.target.value === "" ? undefined : Number(event.target.value);
                    setMapping({ ...mapping, noteColumn, categories: mapping.categories.filter((item) => item.columnIndex !== noteColumn) });
                    setDirty(true);
                  }}
                >
                  <option value="">Sem nota</option>
                  {preview.headers.filter((header) => header.label && header.columnIndex !== mapping.dateColumn).map((header) => <option key={header.columnIndex} value={header.columnIndex}>{header.label}</option>)}
                </select>
              </label>
            </div>
            <div className={styles.columnMappings}>
              {preview.headers.filter((header) => header.label && header.columnIndex !== mapping.dateColumn && header.columnIndex !== mapping.noteColumn).map((header) => (
                <label key={header.columnIndex} className={styles.columnMapping}>
                  <span>{header.label}</span><ArrowRight aria-hidden="true" size={14} />
                  <select className={styles.selectInput} value={targetFor(header.columnIndex)} onChange={(event) => chooseTarget(header.columnIndex, event.target.value)}>
                    <option value="ignore">Ignorar coluna</option>
                    {categories.map((category) => <option key={category.id} value={`existing:${category.id}`}>{category.name}{category.archivedAt ? " (arquivada)" : ""}</option>)}
                    <option value="new">Criar “{header.label}”</option>
                  </select>
                </label>
              ))}
            </div>
            {dirty ? (
              <button className={styles.primaryButton} type="button" disabled={busy !== null} onClick={() => file && void requestPreview(file, { mapping })}>
                <RefreshCw aria-hidden="true" size={15} /> {busy === "preview" ? "A recalcular…" : "Atualizar preview"}
              </button>
            ) : null}
          </section>

          <section className={styles.previewPanel}>
            <div className={styles.sectionTitleRow}><div><p className={styles.eyebrow}>2 · Preview</p><h2>{preview.summary.rows} linhas analisadas</h2></div></div>
            <dl className={styles.statRow}>
              <div><dt>Prontas</dt><dd>{preview.summary.ready}</dd></div>
              <div><dt>Duplicados</dt><dd>{preview.summary.exactDuplicates}</dd></div>
              <div><dt>Conflitos</dt><dd>{preview.summary.dateConflicts}</dd></div>
              <div><dt>Inválidas</dt><dd>{preview.summary.invalid}</dd></div>
            </dl>
            {preview.warnings.map((warning) => <p key={warning} className={styles.inlineWarning}><AlertTriangle aria-hidden="true" size={15} /> {warning}</p>)}
            <div className={styles.previewTableWrap}>
              <table className={styles.previewTable} aria-label="Amostra das primeiras linhas analisadas">
                <thead><tr><th scope="col">Linha</th><th scope="col">Data</th><th scope="col">Total</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 14).map((row) => (
                    <tr key={row.rowNumber} data-status={row.status}>
                      <td>{row.rowNumber}</td><td>{row.date ?? "—"}</td><td>{row.totalCents === null ? "—" : <PrivateAmount amountCents={row.totalCents} />}</td><td>{statusLabel(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.summary.rows > 14 ? <p className={styles.mutedNote}>A mostrar as primeiras 14 linhas; todas as {preview.summary.rows} foram validadas.</p> : null}
            {problemRows.length > 0 ? (
              <div aria-labelledby="import-issues-heading">
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.eyebrow}>Detalhes da validação</p>
                    <h3 id="import-issues-heading">Linhas que requerem atenção</h3>
                  </div>
                </div>
                <p className={styles.mutedNote}>Inclui problemas encontrados fora da amostra das primeiras 14 linhas.</p>
                <div className={styles.previewTableWrap}>
                  <table className={styles.previewTable} aria-labelledby="import-issues-heading">
                    <thead><tr><th scope="col">Linha</th><th scope="col">Estado</th><th scope="col">Detalhe</th></tr></thead>
                    <tbody>
                      {problemRows.map((issue) => (
                        <tr key={`${issue.rowNumber}-${issue.status}`} data-status={issue.status}>
                          <td>{issue.rowNumber}</td>
                          <td>{statusLabel(issue.status)}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {hasConflicts ? (
              <label className={styles.confirmRow}>
                <input type="checkbox" checked={allowConflicts} onChange={(event) => setAllowConflicts(event.target.checked)} />
                <span>Manter também os {preview.summary.dateConflicts} snapshots diferentes que têm datas já existentes.</span>
              </label>
            ) : null}
          </section>

          <section className={styles.commitBar}>
            <div>
              <strong>{preview.summary.exactDuplicates > 0 ? `${preview.summary.exactDuplicates} duplicados serão ignorados` : "Nenhum duplicado exato"}</strong>
              <small>A importação é transacional: ou entra tudo o que confirmaste, ou não entra nada.</small>
            </div>
            <button className={styles.primaryButton} type="button" disabled={!canCommit || busy !== null} onClick={() => void commit()}>
              <Upload aria-hidden="true" size={16} /> {busy === "commit" ? "A importar…" : "Confirmar importação"}
            </button>
          </section>
        </>
      ) : null}

      {success ? (
        <div className={styles.successPanel} role="status">
          <Check aria-hidden="true" size={21} />
          <div><strong>{success.importedRows} snapshots importados.</strong><p>{success.skippedExactDuplicates} duplicados exatos foram ignorados.</p></div>
          <Link className={styles.secondaryButton} href="/historico">Ver histórico</Link>
        </div>
      ) : null}
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
    </main>
  );
}
