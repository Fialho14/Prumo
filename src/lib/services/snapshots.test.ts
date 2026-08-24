import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openTestDatabase,
  type FinanceDatabase,
} from "@/lib/db/client";
import type { Category, CategoryType } from "@/lib/domain/types";
import { aggregateChartPoints, defaultChartCategoryIds } from "@/lib/domain/chart";
import { seedDemoData } from "@/lib/seeds/seed";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryArchived,
} from "@/lib/services/categories";
import {
  createSnapshot,
  deleteSnapshot,
  duplicateSnapshot,
  getDashboardData,
  getSnapshot,
  listSnapshots,
  quickEditSnapshot,
  updateSnapshot,
} from "@/lib/services/snapshots";
import { getMeta } from "@/lib/services/meta";

async function expectFinanceError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    name: "FinanceError",
    code,
  });
}

describe("snapshot and category services", () => {
  let directory: string;
  let database: FinanceDatabase;
  let categorySequence = 0;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "prumo-services-"));
    database = await openTestDatabase(path.join(directory, "finance.db"));
    categorySequence = 0;
  });

  afterEach(async () => {
    if (database.open) database.close();
    await rm(directory, { recursive: true, force: true });
  });

  async function category(
    name: string,
    type: CategoryType = "other",
  ): Promise<Category> {
    categorySequence += 1;
    return createCategory(
      {
        name,
        type,
        color: categorySequence % 2 === 0 ? "#8D72E1" : "#28A889",
        icon: type === "investment" ? "chart" : "wallet",
      },
      database,
    );
  }

  it("cria, edita, duplica e apaga um snapshot de forma transacional", async () => {
    const available = await category("Disponível", "available");
    const savings = await category("Poupança", "savings");

    const created = await createSnapshot(
      {
        id: "snapshot-original",
        date: "2026-01-27",
        note: "  Estado inicial  ",
        recordedAt: "2026-01-27T12:00:00.000Z",
        values: [
          { categoryId: available.id, amountCents: 10_000 },
          { categoryId: savings.id, amountCents: 20_000 },
        ],
      },
      database,
    );

    expect(created).toMatchObject({
      id: "snapshot-original",
      date: "2026-01-27",
      note: "Estado inicial",
      source: "manual",
      revision: 1,
      totalCents: 30_000,
    });

    const edited = await updateSnapshot(
      created.id,
      {
        date: "2026-01-28",
        note: null,
        revision: created.revision,
        values: [
          { categoryId: available.id, amountCents: 15_000 },
          { categoryId: savings.id, amountCents: 20_000 },
        ],
      },
      database,
    );
    expect(edited).toMatchObject({
      id: created.id,
      date: "2026-01-28",
      note: null,
      revision: 2,
      totalCents: 35_000,
    });

    const duplicated = await duplicateSnapshot(
      edited.id,
      "2026-02-01",
      database,
    );
    expect(duplicated).toMatchObject({
      date: "2026-02-01",
      source: "manual",
      totalCents: 35_000,
      values: edited.values,
    });
    expect(duplicated.id).not.toBe(edited.id);

    await deleteSnapshot(edited.id, database);
    await expectFinanceError(getSnapshot(edited.id, database), "snapshot_not_found");
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM snapshot_values WHERE snapshot_id = ?")
        .get(edited.id),
    ).toEqual({ count: 0 });
    expect((await listSnapshots("ASC", database)).map(({ id }) => id)).toEqual([
      duplicated.id,
    ]);
  });

  it("rejeita negativos, categorias repetidas/desconhecidas e conflitos de data", async () => {
    const first = await category("Carteira", "available");
    const second = await category("Reserva", "reserved");
    const values = [
      { categoryId: first.id, amountCents: 10_000 },
      { categoryId: second.id, amountCents: 20_000 },
    ];

    await createSnapshot(
      { date: "2026-01-27", note: "Original", values },
      database,
    );

    await expectFinanceError(
      createSnapshot(
        {
          date: "2026-01-27",
          note: "Original",
          values: [...values].reverse(),
        },
        database,
      ),
      "duplicate_snapshot",
    );
    await expectFinanceError(
      createSnapshot(
        {
          date: "2026-01-27",
          note: "Outro estado",
          values: [{ categoryId: first.id, amountCents: 10_001 }, values[1]],
        },
        database,
      ),
      "same_date_conflict",
    );

    const sameDate = await createSnapshot(
      {
        date: "2026-01-27",
        note: "Outro estado",
        values: [{ categoryId: first.id, amountCents: 10_001 }, values[1]],
        allowSameDate: true,
      },
      database,
    );
    expect(sameDate.date).toBe("2026-01-27");

    await expectFinanceError(
      updateSnapshot(
        sameDate.id,
        {
          date: "2026-01-27",
          note: "Alterado",
          values: [{ categoryId: first.id, amountCents: 10_002 }, values[1]],
          revision: sameDate.revision,
        },
        database,
      ),
      "same_date_conflict",
    );
    const confirmedUpdate = await updateSnapshot(
      sameDate.id,
      {
        date: "2026-01-27",
        note: "Alterado",
        values: [{ categoryId: first.id, amountCents: 10_002 }, values[1]],
        revision: sameDate.revision,
        allowSameDate: true,
      },
      database,
    );
    expect(confirmedUpdate.note).toBe("Alterado");

    await expectFinanceError(
      createSnapshot(
        {
          date: "2026-01-28",
          values: [
            { categoryId: first.id, amountCents: 1 },
            { categoryId: first.id, amountCents: 2 },
          ],
        },
        database,
      ),
      "duplicate_category_value",
    );
    await expectFinanceError(
      createSnapshot(
        {
          date: "2026-01-28",
          values: [{ categoryId: "missing-category", amountCents: 1 }],
        },
        database,
      ),
      "unknown_category",
    );
    await expect(
      createSnapshot(
        {
          date: "2026-01-28",
          values: [{ categoryId: first.id, amountCents: -1 }],
        },
        database,
      ),
    ).rejects.toThrow();

    expect((await listSnapshots("ASC", database))).toHaveLength(2);
  });

  it("mantém histórico de categorias arquivadas e impede a sua eliminação", async () => {
    const historical = await category("Objeto de valor", "asset");
    const unused = await category("Temporária");
    const snapshot = await createSnapshot(
      {
        date: "2026-01-27",
        values: [{ categoryId: historical.id, amountCents: 7_500 }],
      },
      database,
    );

    await expectFinanceError(
      setCategoryArchived(historical.id, true, database),
      "category_has_current_balance",
    );
    await createSnapshot(
      {
        date: "2026-01-28",
        values: [{ categoryId: historical.id, amountCents: 0 }],
      },
      database,
    );
    await setCategoryArchived(historical.id, true, database);

    expect((await listCategories({}, database)).map(({ id }) => id)).toEqual([
      unused.id,
    ]);
    const allCategories = await listCategories(
      { includeArchived: true },
      database,
    );
    expect(allCategories.find(({ id }) => id === historical.id)?.archivedAt).not.toBeNull();
    expect((await getSnapshot(snapshot.id, database)).values).toEqual([
      { categoryId: historical.id, amountCents: 7_500 },
    ]);

    await expectFinanceError(
      deleteCategory(historical.id, database),
      "category_has_history",
    );
    expect(() =>
      database.prepare("DELETE FROM categories WHERE id = ?").run(historical.id),
    ).toThrow(/FOREIGN KEY constraint failed/i);

    await deleteCategory(unused.id, database);
    expect(await listCategories({ includeArchived: true }, database)).toHaveLength(1);
  });

  it("faz quick edit copiando os restantes saldos do último snapshot", async () => {
    const available = await category("Conta corrente", "available");
    const savings = await category("Fundo de emergência", "savings");
    const original = await createSnapshot(
      {
        date: "2026-01-27",
        values: [
          { categoryId: available.id, amountCents: 10_000 },
          { categoryId: savings.id, amountCents: 20_000 },
        ],
      },
      database,
    );

    const edited = await quickEditSnapshot(
      {
        categoryId: available.id,
        amountCents: 12_500,
        date: "2026-01-28",
      },
      database,
    );
    const balances = new Map(
      edited.values.map(({ categoryId, amountCents }) => [categoryId, amountCents]),
    );

    expect(edited).toMatchObject({
      date: "2026-01-28",
      source: "quick_edit",
      totalCents: 32_500,
    });
    expect(balances.get(available.id)).toBe(12_500);
    expect(balances.get(savings.id)).toBe(20_000);
    expect((await getSnapshot(original.id, database)).totalCents).toBe(30_000);
    expect((await getDashboardData(database)).stats.deltaCents).toBe(2_500);
  });

  it("preserva defensivamente um saldo arquivado durante quick edit", async () => {
    const available = await category("Disponível", "available");
    const legacy = await category("Arquivo legado", "asset");
    await createSnapshot(
      {
        date: "2026-01-27",
        values: [
          { categoryId: available.id, amountCents: 10_000 },
          { categoryId: legacy.id, amountCents: 25_000 },
        ],
      },
      database,
    );
    // Simula uma base antiga/importada anterior à regra que obriga a zerar o saldo.
    database
      .prepare("UPDATE categories SET archived_at = ? WHERE id = ?")
      .run("2026-01-27T13:00:00.000Z", legacy.id);

    const edited = await quickEditSnapshot(
      {
        categoryId: available.id,
        amountCents: 12_000,
        date: "2026-01-28",
      },
      database,
    );

    expect(edited.totalCents).toBe(37_000);
    expect(edited.values).toEqual(
      expect.arrayContaining([
        { categoryId: available.id, amountCents: 12_000 },
        { categoryId: legacy.id, amountCents: 25_000 },
      ]),
    );
  });

  it("não permite quick edit sem histórico nem numa categoria arquivada", async () => {
    const categoryToArchive = await category("Antiga", "available");
    await expectFinanceError(
      quickEditSnapshot(
        {
          categoryId: categoryToArchive.id,
          amountCents: 100,
          date: "2026-01-27",
        },
        database,
      ),
      "no_snapshot",
    );

    await createSnapshot(
      {
        date: "2026-01-27",
        values: [{ categoryId: categoryToArchive.id, amountCents: 100 }],
      },
      database,
    );
    await createSnapshot(
      {
        date: "2026-01-28",
        values: [{ categoryId: categoryToArchive.id, amountCents: 0 }],
      },
      database,
    );
    await setCategoryArchived(categoryToArchive.id, true, database);
    await expectFinanceError(
      quickEditSnapshot(
        {
          categoryId: categoryToArchive.id,
          amountCents: 200,
          date: "2026-01-29",
        },
        database,
      ),
      "category_not_found",
    );
  });

  it("calcula toda a dashboard a partir dos dados fictícios", async () => {
    await seedDemoData(database);

    const dashboard = await getDashboardData(database);

    expect(dashboard.first).toMatchObject({
      date: "2025-02-01",
      totalCents: 415_000,
    });
    expect(dashboard.latest).toMatchObject({
      date: "2026-04-01",
      totalCents: 676_000,
    });
    expect(dashboard.stats).toMatchObject({
      totalCents: 676_000,
      growthCents: 261_000,
      investedCents: 182_000,
      liquidCents: 254_000,
      savingsCents: 240_000,
    });
    expect(dashboard.stats.growthPercentage).toBeCloseTo(261_000 / 415_000, 10);
    expect(dashboard.record).toMatchObject({
      date: "2026-04-01",
      totalCents: 676_000,
    });
    expect(dashboard.chartCategories).toHaveLength(4);
    expect(dashboard.chart.at(-1)?.values).toHaveLength(4);
    const defaultChart = aggregateChartPoints(
      dashboard.chart,
      defaultChartCategoryIds(dashboard.chartCategories),
    );
    expect(defaultChart.at(-1)?.totalCents).toBe(254_000);
    expect(dashboard.categories.find(({ name }) => name === "Investimentos")).toMatchObject({
      amountCents: 182_000,
      percentage: 182_000 / 676_000,
    });
  });

  it("marca o seed de demonstração antes de o separar dos dados pessoais", async () => {
    await seedDemoData(database);

    expect(await getMeta("data_mode", "personal", database)).toBe("demo");
    expect(new Set((await listSnapshots("ASC", database)).map(({ source }) => source))).toEqual(
      new Set(["demo"]),
    );
    await expectFinanceError(seedDemoData(database), "database_not_empty");
  });

  it("não deixa um saldo arquivado desaparecer da distribuição", async () => {
    await seedDemoData(database);
    database
      .prepare("UPDATE categories SET archived_at = ? WHERE id = ?")
      .run("2026-05-01T00:00:00.000Z", "demo-savings");

    const dashboard = await getDashboardData(database);
    expect(dashboard.categories.find(({ id }) => id === "demo-savings")).toMatchObject({
      amountCents: 240_000,
      archivedAt: "2026-05-01T00:00:00.000Z",
    });
    expect(dashboard.categories.reduce((sum, category) => sum + category.amountCents, 0)).toBe(
      dashboard.stats.totalCents,
    );
  });
});
