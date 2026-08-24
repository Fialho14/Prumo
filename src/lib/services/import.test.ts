import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import type { FinanceDatabase } from "@/lib/db/client";
import { openTestDatabase } from "@/lib/db/client";
import { parseImportDate } from "@/lib/import/tabular";
import { createCategory } from "@/lib/services/categories";
import { commitImportPreview, previewImportFile } from "@/lib/services/import";
import { createSnapshot } from "@/lib/services/snapshots";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

async function testDatabase(): Promise<FinanceDatabase> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "prumo-import-test-"));
  const db = await openTestDatabase(path.join(directory, "finance.db"));
  cleanups.push(async () => {
    if (db.open) db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return db;
}

describe("datas de importação", () => {
  it("interpreta datas pt-PT e os sistemas Excel 1900/1904 sem timezone local", () => {
    expect(parseImportDate("15/03/2026")).toBe("2026-03-15");
    expect(parseImportDate("15 mar. 2026")).toBe("2026-03-15");
    expect(parseImportDate(1, false)).toBe("1900-01-01");
    expect(parseImportDate(0, true)).toBe("1904-01-01");
    expect(() => parseImportDate(60, false)).toThrow();
  });
});

describe("preview e commit CSV", () => {
  it("assinala duplicado exato e conflito diferente na mesma data", async () => {
    const db = await testDatabase();
    const category = await createCategory(
      { name: "Investimentos", type: "investment", color: "#5B8CFF", icon: "chart" },
      db,
    );
    await createSnapshot(
      { date: "2026-03-15", values: [{ categoryId: category.id, amountCents: 800_00 }] },
      db,
    );
    const input = {
      fileName: "exemplo.csv",
      data: Buffer.from("Data;Investimentos\n15/03/2026;800,00\n15/03/2026;950,00\n", "utf8"),
    };

    const preview = await previewImportFile(input, {}, db);
    expect(preview.summary).toMatchObject({ exactDuplicates: 1, dateConflicts: 1, invalid: 0 });
    await expect(
      commitImportPreview(input, {
        mapping: preview.mapping,
        expectedFileSha256: preview.file.sha256,
        expectedMappingHash: preview.mappingHash,
        database: db,
      }),
    ).rejects.toMatchObject({ code: "import_date_conflicts" });

    const committed = await commitImportPreview(input, {
      mapping: preview.mapping,
      expectedFileSha256: preview.file.sha256,
      expectedMappingHash: preview.mappingHash,
      allowDateConflicts: true,
      database: db,
      now: new Date("2026-08-24T01:00:00.000Z"),
    });
    expect(committed).toMatchObject({ importedRows: 1, skippedExactDuplicates: 1 });
    expect((db.prepare("SELECT COUNT(*) count FROM snapshots").get() as { count: number }).count).toBe(2);
  });

  it("não grava categorias, batches ou snapshots se uma linha for inválida", async () => {
    const db = await testDatabase();
    const input = {
      fileName: "exemplo.csv",
      data: Buffer.from("Data;Nova categoria\n15/03/2026;100,00\n16/03/2026;-1,00\n", "utf8"),
    };
    const preview = await previewImportFile(input, {}, db);
    expect(preview.summary.invalid).toBe(1);
    await expect(
      commitImportPreview(input, {
        mapping: preview.mapping,
        expectedFileSha256: preview.file.sha256,
        expectedMappingHash: preview.mappingHash,
        database: db,
      }),
    ).rejects.toMatchObject({ code: "import_has_invalid_rows" });
    expect((db.prepare("SELECT COUNT(*) count FROM categories").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) count FROM snapshots").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) count FROM import_batches").get() as { count: number }).count).toBe(0);
  });
});

describe("importação XLSX", () => {
  it("lê serial Excel e grava os montantes como cêntimos numa única transação", async () => {
    const db = await testDatabase();
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Data", "Conta corrente", "Fundo de emergência"],
      [46096, 325.5, 950.25],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Património");
    const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const input = { fileName: "historico.xlsx", data };

    const preview = await previewImportFile(input, {}, db);
    expect(preview.rows[0]).toMatchObject({
      date: "2026-03-15",
      totalCents: 1275_75,
      status: "ready",
    });
    const result = await commitImportPreview(input, {
      mapping: preview.mapping,
      expectedFileSha256: preview.file.sha256,
      expectedMappingHash: preview.mappingHash,
      database: db,
      now: new Date("2026-08-24T01:00:00.000Z"),
    });
    expect(result.importedRows).toBe(1);
    expect(result.createdCategories).toHaveLength(2);
    const amounts = db
      .prepare("SELECT amount_cents FROM snapshot_values ORDER BY amount_cents")
      .all() as Array<{ amount_cents: number }>;
    expect(amounts.map((row) => row.amount_cents)).toEqual([325_50, 950_25]);
  });
});
