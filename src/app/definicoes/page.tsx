import { SettingsView } from "@/components/finance/settings-view";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { resolveBackupDirectory, resolveDatabaseConfig } from "@/lib/db/config";
import { getAutomaticBackupSettings } from "@/lib/services/backups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const status = await inspectDatabaseStatus();
  let backupPath = "Configuração indisponível";
  try {
    backupPath = resolveBackupDirectory(resolveDatabaseConfig().path).path;
  } catch {
    // O estado acima já apresenta o erro de configuração de forma segura.
  }
  const automaticBackup = status.code === "ready" ? await getAutomaticBackupSettings() : null;
  return <SettingsView status={status} backupPath={backupPath} automaticBackup={automaticBackup} />;
}
