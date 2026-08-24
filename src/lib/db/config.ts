import fs from "node:fs/promises";
import path from "node:path";

export type DatabaseConfig = {
  path: string;
  configured: boolean;
};

export function resolveDatabaseConfig(cwd = process.cwd()): DatabaseConfig {
  const raw = process.env.FINANCE_DB_PATH?.trim();
  if (!raw) {
    return { path: path.join(cwd, "data", "finance.db"), configured: false };
  }
  if (!path.isAbsolute(raw) || raw.includes("\0")) {
    throw new Error("FINANCE_DB_PATH tem de ser um caminho absoluto válido.");
  }
  return { path: path.normalize(raw), configured: true };
}

export function resolveBackupDirectory(dbPath: string): { path: string; configured: boolean } {
  const raw = process.env.FINANCE_BACKUP_PATH?.trim();
  if (!raw) {
    return { path: path.join(path.dirname(dbPath), "backups"), configured: false };
  }
  if (!path.isAbsolute(raw) || raw.includes("\0")) {
    throw new Error("FINANCE_BACKUP_PATH tem de ser um caminho absoluto válido.");
  }
  return { path: path.normalize(raw), configured: true };
}

export async function isStorageVolumeAvailable(targetPath: string): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const volumesRoot = "/Volumes";
  const relative = path.relative(volumesRoot, path.normalize(targetPath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return true;
  const volumeName = relative.split(path.sep)[0];
  if (!volumeName) return false;
  try {
    const [root, volume] = await Promise.all([
      fs.stat(volumesRoot),
      fs.stat(path.join(volumesRoot, volumeName)),
    ]);
    return root.dev !== volume.dev;
  } catch {
    return false;
  }
}
