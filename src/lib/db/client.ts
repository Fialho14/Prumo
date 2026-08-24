import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { isStorageVolumeAvailable, resolveDatabaseConfig } from "@/lib/db/config";
import { MIGRATIONS } from "@/lib/db/migrations";
import type { DatabaseStatus } from "@/lib/domain/types";
import { FinanceError } from "@/lib/domain/errors";

type Db = Database.Database;

declare global {
  var __prumoDatabasePromise: Promise<Db> | undefined;
  var __prumoDatabasePath: string | undefined;
}

function configureConnection(db: Db) {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = FULL");
  const journal = db.pragma("journal_mode = WAL", { simple: true });
  if (journal !== "wal") throw new Error("SQLite WAL indisponível.");
}

function verifyConnection(db: Db) {
  const quick = db.pragma("quick_check", { simple: true });
  if (quick !== "ok") throw new Error("A verificação de integridade da base de dados falhou.");
  const foreignKeys = db.pragma("foreign_key_check") as unknown[];
  if (foreignKeys.length > 0) throw new Error("Foram encontradas referências inválidas.");
}

async function migrate(db: Db, dbPath: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const current = (
    db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as {
      version: number;
    }
  ).version;
  const pending = MIGRATIONS.filter((migration) => migration.version > current);
  if (pending.length === 0) {
    verifyConnection(db);
    return;
  }

  if (current > 0) {
    const backupDir = path.join(path.dirname(dbPath), "backups");
    await fsp.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(
      backupDir,
      `pre-migration-v${current}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
    );
    await db.backup(backupPath);
    const backup = new Database(backupPath, { fileMustExist: true, readonly: true });
    try {
      if (backup.pragma("quick_check", { simple: true }) !== "ok") {
        throw new Error("O backup pré-migração não é válido.");
      }
    } finally {
      backup.close();
    }
  }

  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, new Date().toISOString());
    })();
  }
  verifyConnection(db);
}

function mapFsError(error: unknown): FinanceError {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return new FinanceError(
      "database_permission_denied",
      "A base de dados privada existe, mas não pode ser lida ou escrita.",
      503,
    );
  }
  if (code === "ENOENT" || code === "ENOTDIR" || code === "SQLITE_CANTOPEN") {
    return new FinanceError(
      "database_unavailable",
      "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
      503,
    );
  }
  return new FinanceError(
    "database_error",
    "Não foi possível abrir a base de dados privada.",
    503,
  );
}

export async function inspectDatabaseStatus(): Promise<DatabaseStatus> {
  let config;
  try {
    config = resolveDatabaseConfig();
  } catch (error) {
    return {
      code: "invalid_path",
      configured: true,
      displayPath: process.env.FINANCE_DB_PATH ?? "",
      detail: error instanceof Error ? error.message : undefined,
    };
  }

  const parent = path.dirname(config.path);
  if (config.configured && !(await isStorageVolumeAvailable(config.path))) {
    return {
      code: "volume_unavailable",
      configured: true,
      displayPath: config.path,
      detail: "not_mounted",
    };
  }
  try {
    const parentStat = await fsp.stat(parent);
    if (!parentStat.isDirectory()) throw Object.assign(new Error("not a directory"), { code: "ENOTDIR" });
  } catch (error) {
    if (!config.configured) {
      return { code: "not_initialized", configured: false, displayPath: config.path };
    }
    return {
      code: "volume_unavailable",
      configured: true,
      displayPath: config.path,
      detail: (error as NodeJS.ErrnoException).code,
    };
  }

  try {
    await fsp.access(config.path, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { code: "not_initialized", configured: config.configured, displayPath: config.path };
    }
    return {
      code: "permission_denied",
      configured: config.configured,
      displayPath: config.path,
      detail: code,
    };
  }

  let probe: Db | undefined;
  try {
    probe = new Database(config.path, { fileMustExist: true, readonly: true });
    if (probe.pragma("quick_check", { simple: true }) !== "ok") {
      return { code: "corrupt", configured: config.configured, displayPath: config.path };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/malformed|corrupt|not a database|file is encrypted/i.test(message)) {
      return { code: "corrupt", configured: config.configured, displayPath: config.path };
    }
    return {
      code: "permission_denied",
      configured: config.configured,
      displayPath: config.path,
      detail: (error as NodeJS.ErrnoException).code,
    };
  } finally {
    probe?.close();
  }

  return { code: "ready", configured: config.configured, displayPath: config.path };
}

export async function initializeDatabase(): Promise<Db> {
  const config = resolveDatabaseConfig();
  const parent = path.dirname(config.path);

  if (config.configured) {
    if (!(await isStorageVolumeAvailable(config.path))) {
      throw mapFsError(Object.assign(new Error("volume not mounted"), { code: "ENOENT" }));
    }
    const stat = await fsp.stat(parent).catch((error) => {
      throw mapFsError(error);
    });
    if (!stat.isDirectory()) throw mapFsError(Object.assign(new Error(), { code: "ENOTDIR" }));
    await fsp.access(parent, fs.constants.W_OK).catch((error) => {
      throw mapFsError(error);
    });
    if (fs.existsSync(config.path)) return openDatabase(config.path);

    const temporary = `${config.path}.init-${randomUUID()}.tmp`;
    const db = new Database(temporary);
    try {
      configureConnection(db);
      await migrate(db, temporary);
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      await fsp.chmod(temporary, 0o600).catch(() => undefined);
      await fsp.rename(temporary, config.path);
    } catch (error) {
      if (db.open) db.close();
      await fsp.unlink(temporary).catch(() => undefined);
      throw error;
    }
  } else {
    await fsp.mkdir(parent, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(config.path)) {
      const db = new Database(config.path);
      try {
        configureConnection(db);
        await migrate(db, config.path);
        await fsp.chmod(config.path, 0o600).catch(() => undefined);
        return db;
      } catch (error) {
        if (db.open) db.close();
        throw error;
      }
    }
  }
  return openDatabase(config.path);
}

/** Inicializa/migra explicitamente sem deixar uma ligação avulsa aberta. */
export async function initializeDatabaseFile(): Promise<void> {
  const db = await initializeDatabase();
  if (db.open) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  }
}

async function openDatabase(dbPath: string): Promise<Db> {
  try {
    const db = new Database(dbPath, { fileMustExist: true });
    configureConnection(db);
    await migrate(db, dbPath);
    await fsp.chmod(dbPath, 0o600).catch(() => undefined);
    return db;
  } catch (error) {
    if (error instanceof FinanceError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/malformed|corrupt|not a database/i.test(message)) {
      throw new FinanceError(
        "database_corrupt",
        "A base de dados privada parece estar danificada. Restaura um backup válido.",
        503,
      );
    }
    throw mapFsError(error);
  }
}

export async function getDatabase(): Promise<Db> {
  const config = resolveDatabaseConfig();
  if (globalThis.__prumoDatabasePromise && globalThis.__prumoDatabasePath === config.path) {
    return globalThis.__prumoDatabasePromise;
  }

  globalThis.__prumoDatabasePath = config.path;
  globalThis.__prumoDatabasePromise = (async () => {
    const status = await inspectDatabaseStatus();
    if (status.code === "not_initialized" && !status.configured) {
      return initializeDatabase();
    }
    if (status.code === "not_initialized") {
      throw new FinanceError(
        "database_not_initialized",
        "A base de dados privada ainda não foi inicializada.",
        503,
      );
    }
    if (status.code !== "ready") {
      throw new FinanceError(
        `database_${status.code}`,
        "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
        503,
      );
    }
    return openDatabase(config.path);
  })().catch((error) => {
    globalThis.__prumoDatabasePromise = undefined;
    throw error;
  });

  return globalThis.__prumoDatabasePromise;
}

export async function closeDatabase() {
  const db = await globalThis.__prumoDatabasePromise?.catch(() => undefined);
  if (db?.open) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  }
  globalThis.__prumoDatabasePromise = undefined;
  globalThis.__prumoDatabasePath = undefined;
}

export async function openTestDatabase(dbPath: string): Promise<Db> {
  await fsp.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  configureConnection(db);
  await migrate(db, dbPath);
  return db;
}

export type FinanceDatabase = Db;
