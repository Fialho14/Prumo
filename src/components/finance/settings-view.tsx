"use client";

import { ArchiveRestore, Database, Eye, FileSpreadsheet, LockKeyhole, Palette } from "lucide-react";
import Link from "next/link";
import { usePrivacy } from "@/components/shell/privacy-provider";
import { useTheme, type ThemePreference } from "@/components/shell/theme-provider";
import type { AutomaticBackupSettings } from "@/lib/services/backups";
import type { DatabaseStatus } from "@/lib/domain/types";
import styles from "./finance.module.css";

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

function statusLabel(status: DatabaseStatus): string {
  if (status.code === "ready") return "Disponível e verificada";
  if (status.code === "not_initialized") return "Por inicializar";
  if (status.code === "permission_denied") return "Sem permissão";
  if (status.code === "corrupt") return "Precisa de restauro";
  return "Volume indisponível";
}

export function SettingsView({
  status,
  backupPath,
  automaticBackup,
}: {
  status: DatabaseStatus;
  backupPath: string;
  automaticBackup: AutomaticBackupSettings | null;
}) {
  const { theme, setTheme } = useTheme();
  const { isPrivacyMode, setPrivacyMode } = usePrivacy();
  const ready = status.code === "ready";

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Preferências locais</p>
          <h1 className={styles.pageTitle}>Definições</h1>
          <p className={styles.pageIntro}>O essencial para aparência, armazenamento e portabilidade. Nada sai deste Mac.</p>
        </div>
      </header>

      <div className={styles.settingsGrid}>
        <section className={styles.settingsSection}>
          <Database aria-hidden="true" size={20} />
          <h2>Base de dados privada</h2>
          <p>SQLite local, com valores guardados em cêntimos e integridade referencial ativa.</p>
          <span className={`${styles.statusLine} ${ready ? "" : styles.warningText}`}>
            <span className={styles.statusDot} /> {statusLabel(status)}
          </span>
          <code className={styles.pathBox} title={status.displayPath}>{status.displayPath}</code>
          <small className={styles.mutedNote}>
            {status.configured ? "Caminho definido por FINANCE_DB_PATH." : "Caminho local de desenvolvimento; configura FINANCE_DB_PATH para usar o volume encriptado."}
          </small>
        </section>

        <section className={styles.settingsSection}>
          <Palette aria-hidden="true" size={20} />
          <h2>Aparência</h2>
          <p>Ambos os temas usam os mesmos tokens de contraste, profundidade e foco.</p>
          <div className={styles.choiceGroup} aria-label="Tema visual">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.choiceButton}
                data-active={theme === option.value}
                aria-pressed={theme === option.value}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className={styles.switchRow}>
            <span><Eye aria-hidden="true" size={17} /> Ocultar montantes</span>
            <input
              type="checkbox"
              checked={isPrivacyMode}
              onChange={(event) => setPrivacyMode(event.target.checked)}
            />
          </label>
          <small className={styles.mutedNote}>Também disponível com ⌘ ⇧ P. É privacidade visual, não encriptação.</small>
        </section>

        <section className={styles.settingsSection}>
          <FileSpreadsheet aria-hidden="true" size={20} />
          <h2>Importar histórico</h2>
          <p>Mapeia as colunas de Excel ou CSV, revê o resultado e só depois cria snapshots.</p>
          {ready ? (
            <Link className={styles.secondaryButton} href="/definicoes/importar">Importar Excel ou CSV</Link>
          ) : (
            <span className={styles.mutedNote}>Disponível quando o volume estiver montado.</span>
          )}
        </section>

        <section className={styles.settingsSection}>
          <ArchiveRestore aria-hidden="true" size={20} />
          <h2>Backups e exportação</h2>
          <p>JSON independente do formato interno, CSV legível e restauro validado.</p>
          <code className={styles.pathBox} title={backupPath}>{backupPath}</code>
          {ready || status.code === "corrupt" ? (
            <Link className={styles.secondaryButton} href="/definicoes/backups">
              {status.code === "corrupt"
                ? "Restaurar backup"
                : automaticBackup?.enabled
                  ? "Backups automáticos ativos"
                  : "Gerir backups"}
            </Link>
          ) : (
            <span className={styles.mutedNote}>Nenhum backup será escrito para um volume indisponível.</span>
          )}
        </section>

        <section className={`${styles.settingsSection} ${styles.settingsWide}`}>
          <LockKeyhole aria-hidden="true" size={20} />
          <h2>Segurança local, sem teatro</h2>
          <p>
            O servidor aceita apenas localhost/127.0.0.1, não inclui analytics nem integrações externas e não envia dados financeiros para APIs. A proteção real em repouso é a encriptação do volume macOS; o Privacy Mode serve apenas para esconder o ecrã.
          </p>
        </section>
      </div>
    </main>
  );
}
