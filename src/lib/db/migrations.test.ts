import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openTestDatabase,
  type FinanceDatabase,
} from "@/lib/db/client";
import { MIGRATIONS } from "@/lib/db/migrations";

describe("database migrations and connection guarantees", () => {
  let directory: string;
  let database: FinanceDatabase | undefined;
  let databasePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "prumo-migrations-"));
    databasePath = path.join(directory, "finance.db");
    database = await openTestDatabase(databasePath);
  });

  afterEach(async () => {
    if (database?.open) database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("aplica todas as migrations uma única vez", async () => {
    const applied = database!
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all();

    expect(applied).toEqual(
      MIGRATIONS.map(({ version, name }) => ({ version, name })),
    );

    database!.close();
    database = await openTestDatabase(databasePath);

    expect(
      database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: MIGRATIONS.length });
    expect(database.pragma("quick_check", { simple: true })).toBe("ok");
  });

  it("ativa os PRAGMAs de durabilidade e integridade esperados", () => {
    expect(database!.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database!.pragma("busy_timeout", { simple: true })).toBe(5_000);
    expect(database!.pragma("synchronous", { simple: true })).toBe(2);
    expect(database!.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(database!.pragma("quick_check", { simple: true })).toBe("ok");
    expect(database!.pragma("foreign_key_check")).toEqual([]);
  });

  it("cria o schema com CASCADE para snapshots e RESTRICT para categorias", () => {
    const tables = database!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map(({ name }) => name)).toEqual([
      "app_meta",
      "categories",
      "import_batches",
      "schema_migrations",
      "snapshot_values",
      "snapshots",
    ]);

    const foreignKeys = database!.pragma("foreign_key_list(snapshot_values)") as {
      table: string;
      from: string;
      on_delete: string;
    }[];
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "snapshots",
          from: "snapshot_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "categories",
          from: "category_id",
          on_delete: "RESTRICT",
        }),
      ]),
    );
  });
});
