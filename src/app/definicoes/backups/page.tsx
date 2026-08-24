import { BackupManager } from "@/components/finance/backup-manager";
import { DatabaseState } from "@/components/finance/database-state";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { resolveBackupDirectory, resolveDatabaseConfig } from "@/lib/db/config";
import { getAutomaticBackupSettings } from "@/lib/services/backups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BackupsPage() {
  const status = await inspectDatabaseStatus();
  if (status.code !== "ready" && status.code !== "corrupt") {
    return <DatabaseState status={status} />;
  }
  const backupPath = resolveBackupDirectory(resolveDatabaseConfig().path).path;
  const recoveryMode = status.code === "corrupt";
  return (
    <BackupManager
      backupPath={backupPath}
      initialAutomatic={
        recoveryMode
          ? {
              enabled: false,
              lastAttemptAt: null,
              lastSuccessAt: null,
              lastFileName: null,
              lastError: false,
            }
          : await getAutomaticBackupSettings()
      }
      recoveryMode={recoveryMode}
    />
  );
}
