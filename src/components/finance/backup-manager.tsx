"use client";

import { AlertTriangle, ArchiveRestore, Check, Download, FileJson, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { configureAutomaticBackupsAction } from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import type { AutomaticBackupSettings, BackupRestorePreview } from "@/lib/services/backups";
import { formatDate } from "@/lib/domain/dates";
import styles from "./finance.module.css";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
type ManualBackupResult = { fileName: string; checksum: string; bytes: number; categories: number; snapshots: number };

async function readJson<T>(response: Response): Promise<ApiResult<T>> {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { message: "A resposta local não pôde ser lida." } };
  }
}

export function BackupManager({
  backupPath,
  initialAutomatic,
  recoveryMode = false,
}: {
  backupPath: string;
  initialAutomatic: AutomaticBackupSettings;
  recoveryMode?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoTriggered = useRef(false);
  const [automatic, setAutomatic] = useState(initialAutomatic);
  const [busy, setBusy] = useState<"manual" | "automatic" | "preview" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const restoreCancelRef = useRef<HTMLButtonElement>(null);
  const operationInFlightRef = useRef(false);

  const createBackup = useCallback(async () => {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy("manual");
    setError(null);
    setMessage(null);
    try {
      const result = await readJson<ManualBackupResult>(await fetch("/api/backups/create", { method: "POST" }));
      if (!result.ok) return setError(result.error.message);
      setMessage(`Backup verificado: ${result.data.fileName} · ${result.data.snapshots} snapshots.`);
    } catch {
      setError(
        "Não foi possível confirmar a criação do backup. Verifica a pasta de backups antes de repetir; a cópia pode já existir.",
      );
    } finally {
      operationInFlightRef.current = false;
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (recoveryMode || searchParams.get("acao") !== "criar" || autoTriggered.current) return;
    autoTriggered.current = true;
    void createBackup();
  }, [createBackup, recoveryMode, searchParams]);

  const toggleAutomatic = async () => {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy("automatic");
    setError(null);
    setMessage(null);
    try {
      const result = await configureAutomaticBackupsAction(!automatic.enabled);
      if (!result.ok) return setError(result.error.message);
      setAutomatic(result.data);
      setMessage(result.data.enabled ? "Backup automático ativado e primeira cópia verificada." : "Backup automático desativado. As cópias existentes foram mantidas.");
    } catch {
      setError(
        "Não foi possível confirmar a configuração do backup automático. Atualiza a página antes de repetir para verificar o estado local.",
      );
      router.refresh();
    } finally {
      operationInFlightRef.current = false;
      setBusy(null);
    }
  };

  const previewRestore = async (file: File) => {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setRestoreFile(file);
    setPreview(null);
    setConfirming(false);
    setBusy("preview");
    setError(null);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const result = await readJson<BackupRestorePreview>(await fetch("/api/backups/preview", { method: "POST", body: form }));
      if (!result.ok) return setError(result.error.message);
      setPreview(result.data);
    } catch {
      setError("Não foi possível validar este backup no servidor local. O ficheiro não foi alterado; tenta selecioná-lo novamente.");
    } finally {
      operationInFlightRef.current = false;
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!restoreFile || !preview || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy("restore");
    setError(null);
    const form = new FormData();
    form.set("file", restoreFile);
    form.set("expectedChecksum", preview.checksum);
    try {
      const result = await readJson<{ categories: number; snapshots: number }>(
        await fetch("/api/backups/restore", { method: "POST", body: form }),
      );
      if (!result.ok) return setError(result.error.message);
      setConfirming(false);
      setMessage(
        recoveryMode
          ? `Recuperação concluída: ${result.data.snapshots} snapshots. O ficheiro danificado foi preservado intacto.`
          : `Restauro concluído: ${result.data.snapshots} snapshots. Foi preservado um backup do estado anterior.`,
      );
      setPreview(null);
      setRestoreFile(null);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar o resultado do restauro. Recarrega a página e volta a validar o backup antes de repetir.",
      );
    } finally {
      operationInFlightRef.current = false;
      setBusy(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.backLink} href="/definicoes">← Definições</Link>
          <p className={styles.eyebrow}>{recoveryMode ? "Recuperação segura" : "Portabilidade total"}</p>
          <h1 className={styles.pageTitle}>{recoveryMode ? "Restaurar a base de dados" : "Backups"}</h1>
          <p className={styles.pageIntro}>
            {recoveryMode
              ? "A base atual não passou a verificação. Valida um backup para recuperar sem apagar o ficheiro danificado."
              : "Os teus dados continuam teus, mesmo sem esta aplicação."}
          </p>
        </div>
      </header>

      {recoveryMode ? (
        <section className={styles.featurePanel} role="status">
          <div className={styles.featurePanelLead}>
            <AlertTriangle aria-hidden="true" size={23} />
            <div>
              <h2>Modo de recuperação</h2>
              <p>
                As exportações e os backups automáticos ficam suspensos porque a base atual não é legível.
                Antes da troca, o ficheiro danificado e os seus sidecars são movidos intactos para a pasta de backups junto à base.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.featurePanel}>
            <div className={styles.featurePanelLead}>
              <ShieldCheck aria-hidden="true" size={23} />
              <div>
                <h2>Cópia local verificada</h2>
                <p>Escrita atómica, permissões privadas, checksum SHA-256 e retenção das 30 cópias mais recentes.</p>
              </div>
            </div>
            <code className={styles.pathBox} title={backupPath}>{backupPath}</code>
            <div className={styles.actionRow}>
              <button className={styles.primaryButton} type="button" disabled={busy !== null} onClick={() => void createBackup()}>
                <ArchiveRestore aria-hidden="true" size={16} /> {busy === "manual" ? "A verificar…" : "Criar backup"}
              </button>
              <button className={styles.secondaryButton} type="button" disabled={busy !== null} onClick={() => void toggleAutomatic()} aria-pressed={automatic.enabled}>
                {busy === "automatic" ? "A configurar…" : automatic.enabled ? "Desativar automático" : "Ativar automático"}
              </button>
            </div>
            <p className={styles.mutedNote}>
              {automatic.enabled
                ? automatic.lastError
                  ? "A última tentativa automática falhou. Verifica se o volume continua disponível."
                  : `Ativo: uma cópia após alterações, no máximo uma vez por dia${automatic.lastFileName ? ` · ${automatic.lastFileName}` : ""}.`
                : "Ao ativar, a aplicação cria imediatamente uma primeira cópia válida."}
            </p>
          </section>

          <section className={styles.splitPanel}>
            <div>
              <FileJson aria-hidden="true" size={21} />
              <h2>JSON completo</h2>
              <p>Categorias, snapshots, notas, histórico e metadados num formato versionado.</p>
              <a className={styles.secondaryButton} href="/api/backups/json" download><Download aria-hidden="true" size={15} /> Descarregar JSON</a>
            </div>
            <div>
              <FileSpreadsheet aria-hidden="true" size={21} />
              <h2>CSV universal</h2>
              <p>Uma linha por snapshot, pronto para Excel, Numbers ou qualquer editor tabular.</p>
              <a className={styles.secondaryButton} href="/api/backups/csv" download><Download aria-hidden="true" size={15} /> Descarregar CSV</a>
            </div>
          </section>
        </>
      )}

      <section className={styles.restorePanel}>
        <div className={styles.featurePanelLead}>
          <Upload aria-hidden="true" size={22} />
          <div>
            <h2>Restaurar backup</h2>
            <p>O ficheiro é validado primeiro. Nada é substituído durante a pré-visualização.</p>
          </div>
        </div>
        <label className={styles.fileDrop}>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void previewRestore(file);
            }}
          />
          <Upload aria-hidden="true" size={20} />
          <span>{busy === "preview" ? "A validar checksum…" : restoreFile?.name ?? "Escolher backup JSON"}</span>
        </label>

        {preview ? (
          <div className={styles.restorePreview}>
            <span className={styles.statusLine}><span className={styles.statusDot} /> Checksum válido</span>
            <dl className={styles.statRow}>
              <div><dt>Backup</dt><dd>{preview.backup.snapshots} snapshots</dd></div>
              <div><dt>Atual</dt><dd>{preview.current ? `${preview.current.snapshots} snapshots` : "Não legível"}</dd></div>
              <div><dt>Período</dt><dd>{preview.backup.firstDate && preview.backup.lastDate ? `${formatDate(preview.backup.firstDate, "long")} — ${formatDate(preview.backup.lastDate, "long")}` : "Sem snapshots"}</dd></div>
            </dl>
            <button className={styles.dangerButton} type="button" onClick={() => setConfirming(true)}>Restaurar este backup</button>
          </div>
        ) : null}
      </section>

      {message ? <p className={styles.successMessage} role="status"><Check aria-hidden="true" size={16} /> {message}</p> : null}
      {error && !confirming ? <p className={styles.formError} role="alert">{error}</p> : null}

      <Modal
        className={styles.dialog}
        describedBy="restore-description"
        dismissDisabled={busy === "restore"}
        initialFocusRef={restoreCancelRef}
        labelledBy="restore-title"
        onDismiss={() => setConfirming(false)}
        open={confirming && preview !== null}
        role="alertdialog"
      >
        {preview ? (
          <>
            <h2 id="restore-title">{recoveryMode ? "Recuperar a partir deste backup?" : "Substituir todos os dados atuais?"}</h2>
            <p id="restore-description">
              Serão repostas {preview.backup.categories} categorias e {preview.backup.snapshots} snapshots. {recoveryMode
                ? "A base danificada é preservada intacta antes de instalar a cópia já verificada."
                : "Antes disso, a aplicação cria obrigatoriamente um backup verificado do estado atual."}
            </p>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} type="button" disabled={busy === "restore"} onClick={() => setConfirming(false)} ref={restoreCancelRef}>Cancelar</button>
              <button className={styles.dangerButton} type="button" disabled={busy === "restore"} onClick={() => void restore()}>{busy === "restore" ? "A restaurar…" : "Sim, substituir e restaurar"}</button>
            </div>
          </>
        ) : null}
      </Modal>
    </main>
  );
}
