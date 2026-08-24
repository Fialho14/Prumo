import type { FinanceDatabase } from "@/lib/db/client";
import { FinanceError } from "@/lib/domain/errors";
import { normalizeName } from "@/lib/domain/normalize";
import type { CategoryType, SnapshotValue } from "@/lib/domain/types";
import { createSnapshot } from "@/lib/services/snapshots";
import { DEMO_CATEGORIES, DEMO_HISTORY } from "@/lib/seeds/demo";

type SeedCategory = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
};

async function assertEmpty(db: FinanceDatabase) {
  const counts = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM snapshots) AS snapshots",
    )
    .get() as { categories: number; snapshots: number };
  if (counts.categories > 0 || counts.snapshots > 0) {
    throw new FinanceError(
      "database_not_empty",
      "A base de dados já tem conteúdo. O seed foi cancelado para não misturar dados.",
      409,
    );
  }
}

function insertCategories(db: FinanceDatabase, categories: readonly SeedCategory[], createdAt: string) {
  const insert = db.prepare(
    `INSERT INTO categories
     (id, name, name_key, type, color, icon, position, archived_at, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
  );
  db.transaction(() => {
    categories.forEach((category, position) =>
      insert.run(
        category.id,
        category.name,
        normalizeName(category.name),
        category.type,
        category.color,
        category.icon,
        position,
        createdAt,
        createdAt,
      ),
    );
  })();
}

function markDataMode(db: FinanceDatabase, mode: "personal" | "demo") {
  db.prepare(
    `INSERT INTO app_meta (key, value_json, updated_at) VALUES ('data_mode', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(mode), new Date().toISOString());
}

export async function seedImportedData(
  db: FinanceDatabase,
  input: {
    categories: readonly SeedCategory[];
    history: ReadonlyArray<readonly [string, ...(number | null)[]]>;
    notes?: Readonly<Record<string, string>>;
    idPrefix?: string;
  },
) {
  await assertEmpty(db);
  markDataMode(db, "personal");
  const firstDate = input.history[0]?.[0];
  if (!firstDate) throw new Error("O seed privado não contém histórico.");
  insertCategories(db, input.categories, `${firstDate}T12:00:00.000Z`);
  for (const [index, row] of input.history.entries()) {
    const [date, ...amounts] = row;
    const values: SnapshotValue[] = amounts.flatMap((amount, categoryIndex) =>
      amount === null
        ? []
        : [{ categoryId: input.categories[categoryIndex].id, amountCents: amount }],
    );
    await createSnapshot(
      {
        id: `${input.idPrefix ?? "private"}-${date}`,
        date,
        note: input.notes?.[date] ?? null,
        values,
        source: "import",
        recordedAt: `${date}T12:${String(index).padStart(2, "0")}:00.000Z`,
      },
      db,
    );
  }
}

export async function seedDemoData(db: FinanceDatabase) {
  await assertEmpty(db);
  // A marca é escrita antes dos registos: mesmo que uma execução seja interrompida,
  // os dados fictícios nunca ficam editáveis como se fossem pessoais.
  markDataMode(db, "demo");
  insertCategories(db, DEMO_CATEGORIES, "2025-02-01T12:00:00.000Z");
  for (const [date, amounts] of DEMO_HISTORY) {
    await createSnapshot(
      {
        id: `demo-${date}`,
        date,
        values: amounts.map((amountCents, index) => ({
          categoryId: DEMO_CATEGORIES[index].id,
          amountCents,
        })),
        source: "demo",
        recordedAt: `${date}T12:00:00.000Z`,
      },
      db,
    );
  }
}
