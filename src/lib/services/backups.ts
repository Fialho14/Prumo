import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FinanceDatabase } from "@/lib/db/client";
import {
  closeDatabase,
  getDatabase,
  inspectDatabaseStatus,
  openTestDatabase,
} from "@/lib/db/client";
import {
  isStorageVolumeAvailable,
  resolveBackupDirectory,
  resolveDatabaseConfig,
} from "@/lib/db/config";
import { assertIsoDate } from "@/lib/domain/dates";
import { FinanceError } from "@/lib/domain/errors";
import { assertValidCents } from "@/lib/domain/money";
import { normalizeName, snapshotContentHash, stableJson } from "@/lib/domain/normalize";
import { CATEGORY_TYPES, type CategoryType, type Snapshot } from "@/lib/domain/types";

export const BACKUP_FORMAT = "prumo-financas" as const;
export const BACKUP_VERSION = 1 as const;
export const BACKUP_RETENTION = 30;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

const AUTOMATIC_BACKUP_META_KEY = "automatic_backup";
const AUTOMATIC_BACKUP_INTERVAL_MS = 20 * 60 * 60 * 1_000;

export type AutomaticBackupSettings = {
  enabled: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFileName: string | null;
  lastError: boolean;
};

export type BackupCategory = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  position: number;
  archivedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type BackupImportBatch = {
  id: string;
  fileName: string;
  fileSha256: string;
  mappingHash: string;
  importedRows: number;
  skippedRows: number;
  createdAt: string;
};

export type BackupSnapshot = {
  id: string;
  date: string;
  recordedAt: string;
  note: string | null;
  source: Snapshot["source"];
  importBatchId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  values: Array<{ categoryId: string; amountCents: number }>;
};

export type BackupDataV1 = {
  categories: BackupCategory[];
  importBatches: BackupImportBatch[];
  snapshots: BackupSnapshot[];
  appMeta: Array<{ key: string; valueJson: string; updatedAt: string }>;
};

export type BackupDocumentV1 = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  checksum: { algorithm: "sha256"; value: string };
  data: BackupDataV1;
};

export type BackupRestorePreview = {
  checksum: string;
  createdAt: string;
  version: number;
  backup: {
    categories: number;
    archivedCategories: number;
    snapshots: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  current: { categories: number; snapshots: number } | null;
};

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  position: number;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

type ImportBatchRow = {
  id: string;
  file_name: string;
  file_sha256: string;
  mapping_hash: string;
  imported_rows: number;
  skipped_rows: number;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  snapshot_date: string;
  recorded_at: string;
  note: string | null;
  source: Snapshot["source"];
  import_batch_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  amount_cents: number | null;
};

type AppMetaRow = { key: string; value_json: string; updated_at: string };

function checksumPayload(document: Omit<BackupDocumentV1, "checksum">): string {
  return stableJson(document);
}

function calculateChecksum(document: Omit<BackupDocumentV1, "checksum">): string {
  return createHash("sha256").update(checksumPayload(document)).digest("hex");
}

function readBackupData(db: FinanceDatabase): BackupDataV1 {
  return db.transaction(() => {
    const categories = (db
      .prepare(
        `SELECT id, name, type, color, icon, position, archived_at, revision, created_at, updated_at
         FROM categories
         ORDER BY position, created_at, id`,
      )
      .all() as CategoryRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      icon: row.icon,
      position: row.position,
      archivedAt: row.archived_at,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const importBatches = (db
      .prepare(
        `SELECT id, file_name, file_sha256, mapping_hash, imported_rows, skipped_rows, created_at
         FROM import_batches
         ORDER BY created_at, id`,
      )
      .all() as ImportBatchRow[]).map((row) => ({
      id: row.id,
      fileName: row.file_name,
      fileSha256: row.file_sha256,
      mappingHash: row.mapping_hash,
      importedRows: row.imported_rows,
      skippedRows: row.skipped_rows,
      createdAt: row.created_at,
    }));

    const rows = db
      .prepare(
        `SELECT s.id, s.snapshot_date, s.recorded_at, s.note, s.source, s.import_batch_id,
                s.revision, s.created_at, s.updated_at, sv.category_id, sv.amount_cents
         FROM snapshots s
         LEFT JOIN snapshot_values sv ON sv.snapshot_id = s.id
         ORDER BY s.snapshot_date, s.recorded_at, s.id, sv.category_id`,
      )
      .all() as SnapshotRow[];
    const snapshots = new Map<string, BackupSnapshot>();
    for (const row of rows) {
      let snapshot = snapshots.get(row.id);
      if (!snapshot) {
        snapshot = {
          id: row.id,
          date: row.snapshot_date,
          recordedAt: row.recorded_at,
          note: row.note,
          source: row.source,
          importBatchId: row.import_batch_id,
          revision: row.revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          values: [],
        };
        snapshots.set(row.id, snapshot);
      }
      if (row.category_id !== null && row.amount_cents !== null) {
        snapshot.values.push({ categoryId: row.category_id, amountCents: row.amount_cents });
      }
    }

    const appMeta = (db
      .prepare("SELECT key, value_json, updated_at FROM app_meta ORDER BY key")
      .all() as AppMetaRow[]).map((row) => ({
      key: row.key,
      valueJson: row.value_json,
      updatedAt: row.updated_at,
    }));
    return { categories, importBatches, snapshots: [...snapshots.values()], appMeta };
  })();
}

export async function buildBackupDocument(
  database?: FinanceDatabase,
  now = new Date(),
): Promise<BackupDocumentV1> {
  const db = database ?? (await getDatabase());
  const unsigned: Omit<BackupDocumentV1, "checksum"> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    data: readBackupData(db),
  };
  return {
    ...unsigned,
    checksum: { algorithm: "sha256", value: calculateChecksum(unsigned) },
  };
}

function invalidBackup(message = "O ficheiro não é um backup Prumo válido."): never {
  throw new FinanceError("invalid_backup", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.includes("\0")) {
    return invalidBackup();
  }
  return value;
}

function nullableString(value: unknown, max: number): string | null {
  if (value === null) return null;
  return requiredString(value, max);
}

function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    return invalidBackup();
  }
  return value as number;
}

function timestamp(value: unknown): string {
  const text = requiredString(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) return invalidBackup();
  return text;
}

function sha256(value: unknown): string {
  const text = requiredString(value, 64).toLocaleLowerCase("en-US");
  if (!/^[a-f0-9]{64}$/.test(text)) return invalidBackup();
  return text;
}

function validateCategory(value: unknown): BackupCategory {
  if (!isRecord(value)) return invalidBackup();
  const type = requiredString(value.type, 32);
  if (!CATEGORY_TYPES.includes(type as CategoryType)) return invalidBackup();
  const color = requiredString(value.color, 32);
  if (!/^#[a-fA-F0-9]{6}$/.test(color)) return invalidBackup();
  return {
    id: requiredString(value.id, 100),
    name: requiredString(value.name, 80).trim(),
    type: type as CategoryType,
    color,
    icon: requiredString(value.icon, 48),
    position: integer(value.position, 0, 1_000_000),
    archivedAt: value.archivedAt === null ? null : timestamp(value.archivedAt),
    revision: integer(value.revision, 1, 2_147_483_647),
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
  };
}

function validateImportBatch(value: unknown): BackupImportBatch {
  if (!isRecord(value)) return invalidBackup();
  return {
    id: requiredString(value.id, 100),
    fileName: requiredString(value.fileName, 255),
    fileSha256: sha256(value.fileSha256),
    mappingHash: sha256(value.mappingHash),
    importedRows: integer(value.importedRows, 0, 100_000),
    skippedRows: integer(value.skippedRows, 0, 100_000),
    createdAt: timestamp(value.createdAt),
  };
}

function validateSnapshot(value: unknown): BackupSnapshot {
  if (!isRecord(value) || !Array.isArray(value.values) || value.values.length > 250) {
    return invalidBackup();
  }
  const date = requiredString(value.date, 10);
  try {
    assertIsoDate(date);
  } catch {
    return invalidBackup();
  }
  const source = requiredString(value.source, 24);
  if (!["manual", "quick_edit", "import", "demo"].includes(source)) return invalidBackup();
  const seenCategories = new Set<string>();
  const values = value.values.map((item) => {
    if (!isRecord(item)) return invalidBackup();
    const categoryId = requiredString(item.categoryId, 100);
    if (seenCategories.has(categoryId)) return invalidBackup();
    seenCategories.add(categoryId);
    const amountCents = integer(item.amountCents, 0, 9_000_000_000_000);
    try {
      assertValidCents(amountCents);
    } catch {
      return invalidBackup();
    }
    return { categoryId, amountCents };
  });
  return {
    id: requiredString(value.id, 100),
    date,
    recordedAt: timestamp(value.recordedAt),
    note: nullableString(value.note, 500),
    source: source as Snapshot["source"],
    importBatchId: value.importBatchId === null ? null : requiredString(value.importBatchId, 100),
    revision: integer(value.revision, 1, 2_147_483_647),
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
    values,
  };
}

function parseBackupInput(input: string | Buffer | Uint8Array | ArrayBuffer | unknown): unknown {
  if (
    typeof input === "string" ||
    Buffer.isBuffer(input) ||
    input instanceof Uint8Array ||
    input instanceof ArrayBuffer
  ) {
    const bytes =
      typeof input === "string"
        ? Buffer.from(input, "utf8")
        : input instanceof ArrayBuffer
          ? Buffer.from(input)
          : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BACKUP_BYTES) {
      throw new FinanceError(
        "invalid_backup_size",
        `O backup tem de ter no máximo ${MAX_BACKUP_BYTES / 1024 / 1024} MB.`,
        bytes.byteLength > MAX_BACKUP_BYTES ? 413 : 400,
      );
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return JSON.parse(text);
    } catch {
      return invalidBackup("O backup não contém JSON UTF-8 válido.");
    }
  }
  try {
    const serialized = JSON.stringify(input);
    if (!serialized || Buffer.byteLength(serialized) > MAX_BACKUP_BYTES) return invalidBackup();
    return JSON.parse(serialized);
  } catch {
    return invalidBackup();
  }
}

export function validateBackupDocument(
  input: string | Buffer | Uint8Array | ArrayBuffer | unknown,
): BackupDocumentV1 {
  const root = parseBackupInput(input);
  if (!isRecord(root)) return invalidBackup();
  if (root.format !== BACKUP_FORMAT) return invalidBackup();
  if (root.version !== BACKUP_VERSION) {
    throw new FinanceError(
      "unsupported_backup_version",
      "Esta versão do backup não é suportada por esta instalação.",
      409,
    );
  }
  if (!isRecord(root.checksum) || root.checksum.algorithm !== "sha256" || !isRecord(root.data)) {
    return invalidBackup();
  }

  const createdAt = timestamp(root.createdAt);
  const checksum = sha256(root.checksum.value);
  const rawData = root.data;
  if (
    !Array.isArray(rawData.categories) ||
    !Array.isArray(rawData.importBatches) ||
    !Array.isArray(rawData.snapshots) ||
    !Array.isArray(rawData.appMeta) ||
    rawData.categories.length > 250 ||
    rawData.importBatches.length > 100_000 ||
    rawData.snapshots.length > 100_000 ||
    rawData.appMeta.length > 500
  ) {
    return invalidBackup();
  }

  const categories = rawData.categories.map(validateCategory);
  const categoryIds = new Set<string>();
  const categoryNames = new Set<string>();
  for (const category of categories) {
    const nameKey = normalizeName(category.name);
    if (!nameKey || categoryIds.has(category.id) || categoryNames.has(nameKey)) return invalidBackup();
    categoryIds.add(category.id);
    categoryNames.add(nameKey);
  }

  const importBatches = rawData.importBatches.map(validateImportBatch);
  const importBatchIds = new Set<string>();
  for (const batch of importBatches) {
    if (importBatchIds.has(batch.id)) return invalidBackup();
    importBatchIds.add(batch.id);
  }

  const snapshots = rawData.snapshots.map(validateSnapshot);
  const snapshotIds = new Set<string>();
  const contentHashes = new Set<string>();
  let totalValues = 0;
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.id)) return invalidBackup();
    snapshotIds.add(snapshot.id);
    totalValues += snapshot.values.length;
    if (totalValues > 1_000_000) return invalidBackup();
    if (snapshot.importBatchId && !importBatchIds.has(snapshot.importBatchId)) return invalidBackup();
    if (snapshot.values.some((item) => !categoryIds.has(item.categoryId))) return invalidBackup();
    const contentHash = snapshotContentHash(snapshot);
    if (contentHashes.has(contentHash)) return invalidBackup();
    contentHashes.add(contentHash);
  }

  const metaKeys = new Set<string>();
  const appMeta = rawData.appMeta.map((item) => {
    if (!isRecord(item)) return invalidBackup();
    const key = requiredString(item.key, 100);
    const valueJson = requiredString(item.valueJson, 100_000);
    try {
      JSON.parse(valueJson);
    } catch {
      return invalidBackup();
    }
    if (metaKeys.has(key)) return invalidBackup();
    metaKeys.add(key);
    return { key, valueJson, updatedAt: timestamp(item.updatedAt) };
  });

  const unsigned: Omit<BackupDocumentV1, "checksum"> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    data: { categories, importBatches, snapshots, appMeta },
  };
  const expected = Buffer.from(calculateChecksum(unsigned), "hex");
  const actual = Buffer.from(checksum, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new FinanceError(
      "backup_checksum_mismatch",
      "O backup foi alterado ou está incompleto. O checksum não corresponde.",
    );
  }
  return { ...unsigned, checksum: { algorithm: "sha256", value: checksum } };
}

function backupTimestamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "Z");
}

function checkedBackupDirectory(explicit?: string): string {
  const directory =
    explicit ?? resolveBackupDirectory(resolveDatabaseConfig().path).path;
  if (!path.isAbsolute(directory) || directory.includes("\0")) {
    throw new FinanceError("invalid_backup_path", "O caminho dos backups tem de ser absoluto.");
  }
  return path.normalize(directory);
}

async function unusedBackupPath(directory: string, baseName: string): Promise<string> {
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const fileName = suffix === 0 ? `${baseName}.json` : `${baseName}-${suffix + 1}.json`;
    const candidate = path.join(directory, fileName);
    try {
      await fs.access(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
  throw new FinanceError("backup_name_collision", "Não foi possível escolher um nome para o backup.");
}

async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, "r").catch(() => null);
  if (!handle) return;
  try {
    await handle.sync();
  } catch {
    // Nem todos os sistemas de ficheiros permitem fsync numa diretoria.
  } finally {
    await handle.close();
  }
}

async function retainNewestBackups(directory: string, keep: number, protectedPath: string) {
  const names = await fs.readdir(directory);
  const candidates = await Promise.all(
    names
      .filter((name) => /^finance-backup-(?:pre-restore-)?\d{8}-\d{6}Z(?:-\d+)?\.json$/.test(name))
      .map(async (name) => {
        const filePath = path.join(directory, name);
        const stat = await fs.stat(filePath);
        return { filePath, modified: stat.mtimeMs, name };
      }),
  );
  candidates.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
  const protectedNormalized = path.normalize(protectedPath);
  const keepSet = new Set(
    [
      candidates.find((candidate) => path.normalize(candidate.filePath) === protectedNormalized),
      ...candidates.filter((candidate) => path.normalize(candidate.filePath) !== protectedNormalized),
    ]
      .filter((candidate): candidate is (typeof candidates)[number] => Boolean(candidate))
      .slice(0, keep)
      .map((candidate) => candidate.filePath),
  );
  const removable = candidates.filter((candidate) => !keepSet.has(candidate.filePath));
  await Promise.all(removable.map((candidate) => fs.unlink(candidate.filePath)));
}

export async function createVerifiedBackup(
  options: {
    database?: FinanceDatabase;
    directory?: string;
    now?: Date;
    retention?: number;
    reason?: "manual" | "automatic" | "pre-restore" | "pre-delete";
  } = {},
): Promise<{
  path: string;
  fileName: string;
  checksum: string;
  bytes: number;
  categories: number;
  snapshots: number;
}> {
  const now = options.now ?? new Date();
  const retention = options.retention ?? BACKUP_RETENTION;
  if (!Number.isSafeInteger(retention) || retention < 1 || retention > 1_000) {
    throw new FinanceError("invalid_backup_retention", "A retenção de backups não é válida.");
  }
  const directory = checkedBackupDirectory(options.directory);
  if (!(await isStorageVolumeAvailable(directory))) {
    throw new FinanceError(
      "backup_volume_unavailable",
      "O volume de backups não está desbloqueado e montado.",
      503,
    );
  }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700).catch(() => undefined);

  const document = await buildBackupDocument(options.database, now);
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_BACKUP_BYTES) {
    throw new FinanceError(
      "backup_too_large",
      `O backup excede o limite de ${MAX_BACKUP_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }
  const reasonPrefix = options.reason === "pre-restore" ? "pre-restore-" : "";
  const target = await unusedBackupPath(
    directory,
    `finance-backup-${reasonPrefix}${backupTimestamp(now)}`,
  );
  const temporary = path.join(directory, `.finance-backup-${randomUUID()}.tmp`);
  let targetWritten = false;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
    targetWritten = true;
    await fs.chmod(target, 0o600).catch(() => undefined);
    await syncDirectory(directory);

    const written = await fs.readFile(target);
    const verified = validateBackupDocument(written);
    if (verified.checksum.value !== document.checksum.value) {
      throw new FinanceError("backup_verification_failed", "O backup escrito não passou a verificação.");
    }
    // Uma falha de limpeza não invalida o novo backup já verificado. Não se registam
    // caminhos nem conteúdo financeiro; a tentativa seguinte volta a aplicar a retenção.
    await retainNewestBackups(directory, retention, target).catch(() => undefined);
    return {
      path: target,
      fileName: path.basename(target),
      checksum: document.checksum.value,
      bytes: written.byteLength,
      categories: document.data.categories.length,
      snapshots: document.data.snapshots.length,
    };
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    if (targetWritten) await fs.unlink(target).catch(() => undefined);
    throw error;
  }
}

function readAutomaticBackupSettings(db: FinanceDatabase): AutomaticBackupSettings {
  const row = db
    .prepare("SELECT value_json FROM app_meta WHERE key = ?")
    .get(AUTOMATIC_BACKUP_META_KEY) as { value_json: string } | undefined;
  if (!row) {
    return {
      enabled: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFileName: null,
      lastError: false,
    };
  }
  try {
    const value = JSON.parse(row.value_json) as Partial<AutomaticBackupSettings>;
    return {
      enabled: value.enabled === true,
      lastAttemptAt: typeof value.lastAttemptAt === "string" ? value.lastAttemptAt : null,
      lastSuccessAt: typeof value.lastSuccessAt === "string" ? value.lastSuccessAt : null,
      lastFileName: typeof value.lastFileName === "string" ? value.lastFileName : null,
      lastError: value.lastError === true,
    };
  } catch {
    return {
      enabled: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFileName: null,
      lastError: true,
    };
  }
}

function writeAutomaticBackupSettings(db: FinanceDatabase, value: AutomaticBackupSettings) {
  db.prepare(
    `INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(AUTOMATIC_BACKUP_META_KEY, JSON.stringify(value), new Date().toISOString());
}

export async function getAutomaticBackupSettings(
  database?: FinanceDatabase,
): Promise<AutomaticBackupSettings> {
  const db = database ?? (await getDatabase());
  return readAutomaticBackupSettings(db);
}

export async function configureAutomaticBackups(
  enabled: boolean,
  database?: FinanceDatabase,
): Promise<AutomaticBackupSettings> {
  const db = database ?? (await getDatabase());
  const current = readAutomaticBackupSettings(db);
  if (!enabled) {
    const disabled = { ...current, enabled: false };
    writeAutomaticBackupSettings(db, disabled);
    return disabled;
  }

  // Ativar esta opção só é considerado bem-sucedido depois de escrever e verificar
  // um primeiro backup. Assim nunca mostramos proteção automática que ainda não funcionou.
  const now = new Date();
  const backup = await createVerifiedBackup({ database: db, now, reason: "automatic" });
  const active: AutomaticBackupSettings = {
    enabled: true,
    lastAttemptAt: now.toISOString(),
    lastSuccessAt: now.toISOString(),
    lastFileName: backup.fileName,
    lastError: false,
  };
  writeAutomaticBackupSettings(db, active);
  return active;
}

export async function maybeCreateAutomaticBackup(
  database?: FinanceDatabase,
  now = new Date(),
): Promise<void> {
  const db = database ?? (await getDatabase());
  const current = readAutomaticBackupSettings(db);
  if (!current.enabled) return;
  const lastSuccess = current.lastSuccessAt ? Date.parse(current.lastSuccessAt) : Number.NaN;
  if (Number.isFinite(lastSuccess) && now.getTime() - lastSuccess < AUTOMATIC_BACKUP_INTERVAL_MS) {
    return;
  }

  try {
    const backup = await createVerifiedBackup({ database: db, now, reason: "automatic" });
    writeAutomaticBackupSettings(db, {
      enabled: true,
      lastAttemptAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      lastFileName: backup.fileName,
      lastError: false,
    });
  } catch {
    // O snapshot já está persistido. Registamos apenas o estado da tentativa, nunca
    // montantes nem caminhos, e a interface mostra que a cópia automática precisa de atenção.
    writeAutomaticBackupSettings(db, {
      ...current,
      lastAttemptAt: now.toISOString(),
      lastError: true,
    });
  }
}

export async function previewBackupRestore(
  input: string | Buffer | Uint8Array | ArrayBuffer | unknown,
  database?: FinanceDatabase,
): Promise<BackupRestorePreview> {
  const document = validateBackupDocument(input);
  let current: BackupRestorePreview["current"] = null;
  if (database) {
    current = database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM categories) AS categories,
           (SELECT COUNT(*) FROM snapshots) AS snapshots`,
      )
      .get() as { categories: number; snapshots: number };
  } else {
    const status = await inspectDatabaseStatus();
    if (status.code === "ready") {
      const db = await getDatabase();
      current = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM categories) AS categories,
             (SELECT COUNT(*) FROM snapshots) AS snapshots`,
        )
        .get() as { categories: number; snapshots: number };
    } else if (status.code !== "corrupt") {
      // Mantém a mensagem normal para volume desmontado, permissões ou caminho inválido.
      await getDatabase();
    }
  }
  const dates = document.data.snapshots.map((snapshot) => snapshot.date).sort();
  return {
    checksum: document.checksum.value,
    createdAt: document.createdAt,
    version: document.version,
    backup: {
      categories: document.data.categories.length,
      archivedCategories: document.data.categories.filter((category) => category.archivedAt).length,
      snapshots: document.data.snapshots.length,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    },
    current,
  };
}

async function unusedRecoveryPath(directory: string, now: Date): Promise<string> {
  const stem = `finance-recovery-corrupt-${backupTimestamp(now)}`;
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = path.join(
      directory,
      `${stem}${suffix === 0 ? "" : `-${suffix + 1}`}.db`,
    );
    try {
      await fs.access(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
  throw new FinanceError("backup_name_collision", "Não foi possível preservar a base danificada.");
}

async function restoreCorruptDatabaseDocument(
  document: BackupDocumentV1,
  options: { expectedChecksum: string; now?: Date },
): Promise<{
  categories: number;
  snapshots: number;
  preRestoreBackupPath: string;
  checksum: string;
}> {
  const config = resolveDatabaseConfig();
  const parent = path.dirname(config.path);
  const now = options.now ?? new Date();
  const recoveryDirectory = path.join(parent, "backups");
  await fs.mkdir(recoveryDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(recoveryDirectory, 0o700).catch(() => undefined);

  const operationId = randomUUID();
  const temporaryDatabase = path.join(parent, `.finance-recovery-${operationId}.db`);
  const scratchBackups = path.join(recoveryDirectory, `.restore-${operationId}`);
  const rollbackReplacement = path.join(parent, `.finance-recovery-failed-${operationId}.db`);
  const preservedDatabase = await unusedRecoveryPath(recoveryDirectory, now);
  const movedSidecars: Array<{ source: string; preserved: string }> = [];
  let temporary: FinanceDatabase | undefined;
  let originalMoved = false;
  let replacementInstalled = false;

  try {
    // Constrói e valida a nova base sem tocar no ficheiro danificado.
    temporary = await openTestDatabase(temporaryDatabase);
    await restoreBackupDocument(document, {
      expectedChecksum: options.expectedChecksum,
      database: temporary,
      backupDirectory: scratchBackups,
      now,
    });
    if (temporary.pragma("quick_check", { simple: true }) !== "ok") {
      throw new FinanceError("restore_verification_failed", "A base restaurada não passou a verificação.");
    }
    if ((temporary.pragma("foreign_key_check") as unknown[]).length > 0) {
      throw new FinanceError("restore_verification_failed", "A base restaurada contém referências inválidas.");
    }
    temporary.pragma("wal_checkpoint(TRUNCATE)");
    temporary.close();
    temporary = undefined;
    await fs.chmod(temporaryDatabase, 0o600).catch(() => undefined);

    // A versão danificada e os sidecars são movidos intactos para uma diretoria
    // privada no mesmo volume antes da troca atómica.
    await closeDatabase();
    await fs.rename(config.path, preservedDatabase);
    originalMoved = true;
    await fs.chmod(preservedDatabase, 0o600).catch(() => undefined);
    for (const sidecarSuffix of ["-wal", "-shm"] as const) {
      const source = `${config.path}${sidecarSuffix}`;
      const preserved = `${preservedDatabase}${sidecarSuffix}`;
      try {
        await fs.rename(source, preserved);
        movedSidecars.push({ source, preserved });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await fs.rename(temporaryDatabase, config.path);
    replacementInstalled = true;
    await syncDirectory(parent);

    const verified = await openTestDatabase(config.path);
    try {
      if (verified.pragma("quick_check", { simple: true }) !== "ok") {
        throw new FinanceError("restore_verification_failed", "A base restaurada não passou a verificação final.");
      }
    } finally {
      verified.close();
    }
    await fs.chmod(config.path, 0o600).catch(() => undefined);
    await fs.rm(scratchBackups, { recursive: true, force: true });
    return {
      categories: document.data.categories.length,
      snapshots: document.data.snapshots.length,
      preRestoreBackupPath: preservedDatabase,
      checksum: document.checksum.value,
    };
  } catch (error) {
    if (temporary?.open) temporary.close();
    if (replacementInstalled) {
      await fs.rename(config.path, rollbackReplacement).catch(() => undefined);
    }
    if (originalMoved) {
      await fs.rename(preservedDatabase, config.path).catch(() => undefined);
      for (const sidecar of movedSidecars) {
        await fs.rename(sidecar.preserved, sidecar.source).catch(() => undefined);
      }
    }
    await fs.unlink(rollbackReplacement).catch(() => undefined);
    throw error;
  } finally {
    await fs.unlink(temporaryDatabase).catch(() => undefined);
    await fs.rm(scratchBackups, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function restoreBackupDocument(
  input: string | Buffer | Uint8Array | ArrayBuffer | unknown,
  options: {
    expectedChecksum: string;
    database?: FinanceDatabase;
    backupDirectory?: string;
    now?: Date;
  },
): Promise<{
  categories: number;
  snapshots: number;
  preRestoreBackupPath: string;
  checksum: string;
}> {
  const document = validateBackupDocument(input);
  if (!options?.expectedChecksum || options.expectedChecksum !== document.checksum.value) {
    throw new FinanceError(
      "restore_confirmation_required",
      "Volta a validar o backup antes de confirmar a substituição dos dados.",
      409,
    );
  }
  if (!options.database) {
    const status = await inspectDatabaseStatus();
    if (status.code === "corrupt") {
      return restoreCorruptDatabaseDocument(document, {
        expectedChecksum: options.expectedChecksum,
        now: options.now,
      });
    }
  }
  const db = options.database ?? (await getDatabase());

  // Este backup verificado acontece antes de qualquer DELETE e é deliberadamente obrigatório.
  const safetyBackup = await createVerifiedBackup({
    database: db,
    directory: options.backupDirectory,
    now: options.now,
    reason: "pre-restore",
  });

  const insertCategory = db.prepare(
    `INSERT INTO categories
     (id, name, name_key, type, color, icon, position, archived_at, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBatch = db.prepare(
    `INSERT INTO import_batches
     (id, file_name, file_sha256, mapping_hash, imported_rows, skipped_rows, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSnapshot = db.prepare(
    `INSERT INTO snapshots
     (id, snapshot_date, recorded_at, note, source, content_hash, import_batch_id,
      revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertValue = db.prepare(
    "INSERT INTO snapshot_values (snapshot_id, category_id, amount_cents) VALUES (?, ?, ?)",
  );
  const insertMeta = db.prepare(
    "INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    db.prepare("DELETE FROM snapshots").run();
    db.prepare("DELETE FROM import_batches").run();
    db.prepare("DELETE FROM categories").run();
    db.prepare("DELETE FROM app_meta").run();

    for (const category of document.data.categories) {
      insertCategory.run(
        category.id,
        category.name,
        normalizeName(category.name),
        category.type,
        category.color,
        category.icon,
        category.position,
        category.archivedAt,
        category.revision,
        category.createdAt,
        category.updatedAt,
      );
    }
    for (const batch of document.data.importBatches) {
      insertBatch.run(
        batch.id,
        batch.fileName,
        batch.fileSha256,
        batch.mappingHash,
        batch.importedRows,
        batch.skippedRows,
        batch.createdAt,
      );
    }
    for (const snapshot of document.data.snapshots) {
      insertSnapshot.run(
        snapshot.id,
        snapshot.date,
        snapshot.recordedAt,
        snapshot.note,
        snapshot.source,
        snapshotContentHash(snapshot),
        snapshot.importBatchId,
        snapshot.revision,
        snapshot.createdAt,
        snapshot.updatedAt,
      );
      for (const value of snapshot.values) {
        insertValue.run(snapshot.id, value.categoryId, value.amountCents);
      }
    }
    for (const item of document.data.appMeta) {
      insertMeta.run(item.key, item.valueJson, item.updatedAt);
    }
    const foreignKeyErrors = db.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) throw new Error("foreign key check failed");
  })();

  return {
    categories: document.data.categories.length,
    snapshots: document.data.snapshots.length,
    preRestoreBackupPath: safetyBackup.path,
    checksum: document.checksum.value,
  };
}

function protectCsvFormula(value: string): string {
  return /^(?:[=+\-@\t\r\n]|\s+[=+\-@])/u.test(value) ? `'${value}` : value;
}

function csvCell(value: string, protect = true): string {
  const safe = protect ? protectCsvFormula(value) : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvEuros(cents: number): string {
  assertValidCents(cents);
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

export async function exportSnapshotsCsv(database?: FinanceDatabase): Promise<string> {
  const db = database ?? (await getDatabase());
  const categories = db
    .prepare(
      `SELECT id, name FROM categories
       ORDER BY archived_at IS NOT NULL, position, created_at, id`,
    )
    .all() as Array<{ id: string; name: string }>;
  const snapshotRows = db
    .prepare(
      `SELECT s.id, s.snapshot_date, s.note, sv.category_id, sv.amount_cents
       FROM snapshots s
       LEFT JOIN snapshot_values sv ON sv.snapshot_id = s.id
       ORDER BY s.snapshot_date, s.recorded_at, s.id, sv.category_id`,
    )
    .all() as Array<{
    id: string;
    snapshot_date: string;
    note: string | null;
    category_id: string | null;
    amount_cents: number | null;
  }>;
  const snapshots = new Map<
    string,
    { date: string; note: string | null; values: Map<string, number> }
  >();
  for (const row of snapshotRows) {
    let snapshot = snapshots.get(row.id);
    if (!snapshot) {
      snapshot = { date: row.snapshot_date, note: row.note, values: new Map() };
      snapshots.set(row.id, snapshot);
    }
    if (row.category_id !== null && row.amount_cents !== null) {
      snapshot.values.set(row.category_id, row.amount_cents);
    }
  }

  const lines = [
    ["Data", "Nota", ...categories.map((category) => category.name), "Total"]
      .map((value) => csvCell(value))
      .join(";"),
  ];
  for (const snapshot of snapshots.values()) {
    let total = 0;
    const values = categories.map((category) => {
      const amount = snapshot.values.get(category.id) ?? 0;
      total += amount;
      return csvCell(csvEuros(amount), false);
    });
    lines.push(
      [
        csvCell(snapshot.date, false),
        csvCell(snapshot.note ?? ""),
        ...values,
        csvCell(csvEuros(total), false),
      ].join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
