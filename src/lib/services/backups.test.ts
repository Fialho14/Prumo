import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FinanceDatabase } from "@/lib/db/client";
import { closeDatabase, openTestDatabase } from "@/lib/db/client";
import { FinanceError } from "@/lib/domain/errors";
import { createCategory } from "@/lib/services/categories";
import { createSnapshot } from "@/lib/services/snapshots";
import {
  buildBackupDocument,
  configureAutomaticBackups,
  createVerifiedBackup,
  exportSnapshotsCsv,
  getAutomaticBackupSettings,
  maybeCreateAutomaticBackup,
  previewBackupRestore,
  restoreBackupDocument,
  validateBackupDocument,
} from "@/lib/services/backups";

const cleanups: Array<() => Promise<void>> = [];
const originalFinanceBackupPath = process.env.FINANCE_BACKUP_PATH;
const originalFinanceDatabasePath = process.env.FINANCE_DB_PATH;

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
  vi.useRealTimers();
  if (originalFinanceBackupPath === undefined) {
    delete process.env.FINANCE_BACKUP_PATH;
  } else {
    process.env.FINANCE_BACKUP_PATH = originalFinanceBackupPath;
  }
  if (originalFinanceDatabasePath === undefined) {
    delete process.env.FINANCE_DB_PATH;
  } else {
    process.env.FINANCE_DB_PATH = originalFinanceDatabasePath;
  }
  await closeDatabase();
});

async function testDatabase(): Promise<{ db: FinanceDatabase; directory: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "prumo-backup-test-"));
  const db = await openTestDatabase(path.join(directory, "finance.db"));
  cleanups.push(async () => {
    if (db.open) db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { db, directory };
}

async function seed(db: FinanceDatabase, name = "Carteira") {
  const category = await createCategory(
    { name, type: "available", color: "#5B8CFF", icon: "wallet" },
    db,
  );
  await createSnapshot(
    {
      date: "2026-01-27",
      note: "Primeiro registo",
      values: [{ categoryId: category.id, amountCents: 123_45 }],
    },
    db,
  );
  return category;
}

async function jsonBackups(directory: string): Promise<string[]> {
  return (await fs.readdir(directory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
}

describe("backups JSON", () => {
  it("cria um documento versionado cujo checksum deteta qualquer alteração", async () => {
    const { db } = await testDatabase();
    await seed(db);
    const document = await buildBackupDocument(db, new Date("2026-08-24T01:00:00.000Z"));

    expect(validateBackupDocument(JSON.stringify(document))).toEqual(document);
    const changed = structuredClone(document);
    changed.data.snapshots[0].values[0].amountCents += 1;
    expect(() => validateBackupDocument(JSON.stringify(changed))).toThrowError(
      expect.objectContaining({ code: "backup_checksum_mismatch" }),
    );
  });

  it("escreve atomicamente, verifica e mantém apenas a retenção configurada", async () => {
    const { db, directory } = await testDatabase();
    await seed(db);
    const backupDirectory = path.join(directory, "backups");
    for (let index = 0; index < 4; index += 1) {
      await createVerifiedBackup({
        database: db,
        directory: backupDirectory,
        retention: 2,
        now: new Date(Date.UTC(2026, 7, 24, 1, 0, index)),
      });
    }
    const files = await fs.readdir(backupDirectory);
    expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(2);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
    for (const file of files) {
      if (file.endsWith(".json")) validateBackupDocument(await fs.readFile(path.join(backupDirectory, file)));
    }
  });

  it("só restaura com checksum confirmado e cria primeiro um backup verificável", async () => {
    const { db, directory } = await testDatabase();
    await seed(db);
    const source = await buildBackupDocument(db, new Date("2026-08-24T01:00:00.000Z"));
    await createCategory(
      { name: "Temporária", type: "other", color: "#9B7BFF", icon: "wallet" },
      db,
    );

    await expect(
      restoreBackupDocument(source, {
        expectedChecksum: "0".repeat(64),
        database: db,
        backupDirectory: path.join(directory, "backups"),
      }),
    ).rejects.toMatchObject({ code: "restore_confirmation_required" } satisfies Partial<FinanceError>);
    expect((db.prepare("SELECT COUNT(*) count FROM categories").get() as { count: number }).count).toBe(2);

    const restored = await restoreBackupDocument(source, {
      expectedChecksum: source.checksum.value,
      database: db,
      backupDirectory: path.join(directory, "backups"),
      now: new Date("2026-08-24T01:01:00.000Z"),
    });
    expect(restored.categories).toBe(1);
    expect((db.prepare("SELECT COUNT(*) count FROM categories").get() as { count: number }).count).toBe(1);
    validateBackupDocument(await fs.readFile(restored.preRestoreBackupPath));
  });

  it("recupera pela UI/service quando a base atual está corrompida e preserva o original", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "prumo-corrupt-restore-"));
    cleanups.push(async () => fs.rm(directory, { recursive: true, force: true }));
    const databasePath = path.join(directory, "finance.db");
    const source = await openTestDatabase(databasePath);
    await seed(source);
    const document = await buildBackupDocument(
      source,
      new Date("2026-08-24T01:00:00.000Z"),
    );
    source.close();

    const corruptBytes = Buffer.from("este ficheiro deixou de ser sqlite", "utf8");
    await fs.writeFile(databasePath, corruptBytes);
    process.env.FINANCE_DB_PATH = databasePath;

    await expect(previewBackupRestore(document)).resolves.toMatchObject({
      checksum: document.checksum.value,
      current: null,
      backup: { categories: 1, snapshots: 1 },
    });
    const restored = await restoreBackupDocument(document, {
      expectedChecksum: document.checksum.value,
      now: new Date("2026-08-24T01:02:00.000Z"),
    });

    expect(await fs.readFile(restored.preRestoreBackupPath)).toEqual(corruptBytes);
    const recovered = await openTestDatabase(databasePath);
    expect(recovered.pragma("quick_check", { simple: true })).toBe("ok");
    expect(recovered.prepare("SELECT COUNT(*) AS count FROM snapshots").get()).toEqual({ count: 1 });
    expect(recovered.prepare("SELECT SUM(amount_cents) AS total FROM snapshot_values").get()).toEqual({
      total: 123_45,
    });
    recovered.close();
  });
});

describe("exportação CSV", () => {
  it("exporta em formato largo e neutraliza fórmulas em nomes e notas", async () => {
    const { db } = await testDatabase();
    const category = await seed(db, "=HYPERLINK");
    const latest = db.prepare("SELECT id FROM snapshots LIMIT 1").get() as { id: string };
    db.prepare("UPDATE snapshots SET note = ? WHERE id = ?").run(" @SUM(A1)", latest.id);

    const csv = await exportSnapshotsCsv(db);
    expect(csv).toContain('"\'=HYPERLINK"');
    expect(csv).toContain('"\' @SUM(A1)"');
    expect(csv).toContain('"123,45"');
    expect(category.name).toBe("=HYPERLINK");
  });
});

describe("backups automáticos", () => {
  const activationTime = new Date("2026-08-24T01:00:00.000Z");

  it("só ativa depois de escrever um primeiro backup verificável", async () => {
    const { db, directory } = await testDatabase();
    await seed(db);
    vi.useFakeTimers();
    vi.setSystemTime(activationTime);

    const blockedPath = path.join(directory, "nao-e-diretoria");
    await fs.writeFile(blockedPath, "bloqueio", "utf8");
    process.env.FINANCE_BACKUP_PATH = blockedPath;

    await expect(configureAutomaticBackups(true, db)).rejects.toThrow();
    await expect(getAutomaticBackupSettings(db)).resolves.toEqual({
      enabled: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFileName: null,
      lastError: false,
    });

    const backupDirectory = path.join(directory, "backups");
    process.env.FINANCE_BACKUP_PATH = backupDirectory;
    const active = await configureAutomaticBackups(true, db);

    expect(active).toEqual({
      enabled: true,
      lastAttemptAt: activationTime.toISOString(),
      lastSuccessAt: activationTime.toISOString(),
      lastFileName: "finance-backup-20260824-010000Z.json",
      lastError: false,
    });
    expect(await getAutomaticBackupSettings(db)).toEqual(active);
    const files = await jsonBackups(backupDirectory);
    expect(files).toEqual([active.lastFileName]);
    expect(
      validateBackupDocument(
        await fs.readFile(path.join(backupDirectory, active.lastFileName!)),
      ).createdAt,
    ).toBe(activationTime.toISOString());
  });

  it("desativa sem apagar backups existentes nem criar novos", async () => {
    const { db, directory } = await testDatabase();
    await seed(db);
    const backupDirectory = path.join(directory, "backups");
    process.env.FINANCE_BACKUP_PATH = backupDirectory;
    vi.useFakeTimers();
    vi.setSystemTime(activationTime);

    const active = await configureAutomaticBackups(true, db);
    const before = await jsonBackups(backupDirectory);
    const disabled = await configureAutomaticBackups(false, db);
    await maybeCreateAutomaticBackup(
      db,
      new Date("2026-08-26T01:00:00.000Z"),
    );

    expect(disabled).toEqual({ ...active, enabled: false });
    expect(await getAutomaticBackupSettings(db)).toEqual(disabled);
    expect(await jsonBackups(backupDirectory)).toEqual(before);
  });

  it("aplica throttling antes de 20 horas e cria outro backup depois do intervalo", async () => {
    const { db, directory } = await testDatabase();
    await seed(db);
    const backupDirectory = path.join(directory, "backups");
    process.env.FINANCE_BACKUP_PATH = backupDirectory;
    vi.useFakeTimers();
    vi.setSystemTime(activationTime);

    const first = await configureAutomaticBackups(true, db);
    const beforeInterval = new Date(
      activationTime.getTime() + 20 * 60 * 60 * 1_000 - 1,
    );
    await maybeCreateAutomaticBackup(db, beforeInterval);

    expect(await jsonBackups(backupDirectory)).toEqual([first.lastFileName]);
    expect(await getAutomaticBackupSettings(db)).toEqual(first);

    const afterInterval = new Date(
      activationTime.getTime() + 20 * 60 * 60 * 1_000 + 1_000,
    );
    await maybeCreateAutomaticBackup(db, afterInterval);

    const settings = await getAutomaticBackupSettings(db);
    expect(settings).toEqual({
      enabled: true,
      lastAttemptAt: afterInterval.toISOString(),
      lastSuccessAt: afterInterval.toISOString(),
      lastFileName: "finance-backup-20260824-210001Z.json",
      lastError: false,
    });
    expect(await jsonBackups(backupDirectory)).toEqual([
      "finance-backup-20260824-010000Z.json",
      "finance-backup-20260824-210001Z.json",
    ]);
  });

  it("regista erro de diretoria sem lançar nem alterar os dados financeiros", async () => {
    const { db, directory } = await testDatabase();
    const category = await seed(db);
    const backupDirectory = path.join(directory, "backups");
    process.env.FINANCE_BACKUP_PATH = backupDirectory;
    vi.useFakeTimers();
    vi.setSystemTime(activationTime);

    const active = await configureAutomaticBackups(true, db);
    const blockedPath = path.join(directory, "diretoria-indisponivel");
    await fs.writeFile(blockedPath, "continua a ser um ficheiro", "utf8");
    process.env.FINANCE_BACKUP_PATH = blockedPath;
    const failedAt = new Date("2026-08-25T01:00:00.000Z");

    await expect(maybeCreateAutomaticBackup(db, failedAt)).resolves.toBeUndefined();

    expect(await getAutomaticBackupSettings(db)).toEqual({
      ...active,
      lastAttemptAt: failedAt.toISOString(),
      lastError: true,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM categories").get(),
    ).toEqual({ count: 1 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM snapshots").get(),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          "SELECT amount_cents FROM snapshot_values WHERE category_id = ?",
        )
        .get(category.id),
    ).toEqual({ amount_cents: 123_45 });
    expect(db.pragma("quick_check", { simple: true })).toBe("ok");
    expect(await fs.readFile(blockedPath, "utf8")).toBe(
      "continua a ser um ficheiro",
    );
    expect(await jsonBackups(backupDirectory)).toEqual([active.lastFileName]);
  });
});
