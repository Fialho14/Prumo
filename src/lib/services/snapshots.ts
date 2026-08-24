import { randomUUID } from "node:crypto";
import type { FinanceDatabase } from "@/lib/db/client";
import { getDatabase } from "@/lib/db/client";
import { assertIsoDate } from "@/lib/domain/dates";
import { FinanceError } from "@/lib/domain/errors";
import { assertValidCents } from "@/lib/domain/money";
import { snapshotContentHash } from "@/lib/domain/normalize";
import type {
  CategoryBalance,
  DashboardData,
  Snapshot,
  SnapshotValue,
} from "@/lib/domain/types";
import { snapshotInputSchema } from "@/lib/domain/validation";
import { listCategories } from "@/lib/services/categories";

type SnapshotRow = {
  id: string;
  snapshot_date: string;
  recorded_at: string;
  note: string | null;
  source: Snapshot["source"];
  revision: number;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  amount_cents: number | null;
};

function rowsToSnapshots(rows: SnapshotRow[]): Snapshot[] {
  const snapshots = new Map<string, Snapshot>();
  for (const row of rows) {
    let snapshot = snapshots.get(row.id);
    if (!snapshot) {
      snapshot = {
        id: row.id,
        date: row.snapshot_date,
        recordedAt: row.recorded_at,
        note: row.note,
        source: row.source,
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        values: [],
        totalCents: 0,
      };
      snapshots.set(row.id, snapshot);
    }
    if (row.category_id && row.amount_cents !== null) {
      snapshot.values.push({ categoryId: row.category_id, amountCents: row.amount_cents });
      snapshot.totalCents += row.amount_cents;
    }
  }
  return [...snapshots.values()];
}

function snapshotQuery(order: "ASC" | "DESC") {
  return `
    SELECT s.id, s.snapshot_date, s.recorded_at, s.note, s.source, s.revision,
           s.created_at, s.updated_at, sv.category_id, sv.amount_cents
    FROM snapshots s
    LEFT JOIN snapshot_values sv ON sv.snapshot_id = s.id
    ORDER BY s.snapshot_date ${order}, s.recorded_at ${order}, s.id ${order}, sv.category_id
  `;
}

export async function listSnapshots(
  order: "ASC" | "DESC" = "DESC",
  database?: FinanceDatabase,
): Promise<Snapshot[]> {
  const db = database ?? (await getDatabase());
  return rowsToSnapshots(db.prepare(snapshotQuery(order)).all() as SnapshotRow[]);
}

export async function getSnapshot(id: string, database?: FinanceDatabase): Promise<Snapshot> {
  const db = database ?? (await getDatabase());
  const rows = db
    .prepare(
      `SELECT s.id, s.snapshot_date, s.recorded_at, s.note, s.source, s.revision,
              s.created_at, s.updated_at, sv.category_id, sv.amount_cents
       FROM snapshots s
       LEFT JOIN snapshot_values sv ON sv.snapshot_id = s.id
       WHERE s.id = ?
       ORDER BY sv.category_id`,
    )
    .all(id) as SnapshotRow[];
  const snapshot = rowsToSnapshots(rows)[0];
  if (!snapshot) throw new FinanceError("snapshot_not_found", "Snapshot não encontrado.", 404);
  return snapshot;
}

function validateValues(values: SnapshotValue[]) {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.categoryId)) throw new FinanceError("duplicate_category_value", "Categoria repetida.");
    ids.add(value.categoryId);
    assertValidCents(value.amountCents);
  }
}

export async function createSnapshot(
  input: {
    date: string;
    note?: string | null;
    values: SnapshotValue[];
    source?: Snapshot["source"];
    allowSameDate?: boolean;
    recordedAt?: string;
    id?: string;
  },
  database?: FinanceDatabase,
): Promise<Snapshot> {
  const parsed = snapshotInputSchema.parse({
    ...input,
    source: input.source ?? "manual",
    allowSameDate: input.allowSameDate ?? false,
  });
  assertIsoDate(parsed.date);
  validateValues(parsed.values);
  const db = database ?? (await getDatabase());
  const known = db.prepare("SELECT id FROM categories").all() as { id: string }[];
  const knownIds = new Set(known.map((row) => row.id));
  if (parsed.values.some((value) => !knownIds.has(value.categoryId))) {
    throw new FinanceError("unknown_category", "Uma das categorias já não existe.", 409);
  }

  const hash = snapshotContentHash(parsed);
  const exact = db.prepare("SELECT id FROM snapshots WHERE content_hash = ?").get(hash) as
    | { id: string }
    | undefined;
  if (exact) {
    throw new FinanceError("duplicate_snapshot", "Este snapshot já existe.", 409);
  }
  const sameDate = db
    .prepare("SELECT id FROM snapshots WHERE snapshot_date = ? ORDER BY recorded_at DESC LIMIT 1")
    .get(parsed.date) as { id: string } | undefined;
  if (sameDate && !parsed.allowSameDate) {
    throw new FinanceError(
      "same_date_conflict",
      "Já existe um snapshot nesta data. Confirma se queres manter ambos.",
      409,
    );
  }

  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const recordedAt = input.recordedAt ?? now;
  const insertValue = db.prepare(
    "INSERT INTO snapshot_values (snapshot_id, category_id, amount_cents) VALUES (?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare(
      `INSERT INTO snapshots
       (id, snapshot_date, recorded_at, note, source, content_hash, import_batch_id, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
    ).run(id, parsed.date, recordedAt, parsed.note || null, parsed.source, hash, now, now);
    for (const value of parsed.values) {
      insertValue.run(id, value.categoryId, value.amountCents);
    }
  })();
  return getSnapshot(id, db);
}

export async function updateSnapshot(
  id: string,
  input: {
    date: string;
    note?: string | null;
    values: SnapshotValue[];
    revision: number;
    allowSameDate?: boolean;
  },
  database?: FinanceDatabase,
): Promise<Snapshot> {
  assertIsoDate(input.date);
  validateValues(input.values);
  const db = database ?? (await getDatabase());
  const existing = await getSnapshot(id, db);
  if (existing.revision !== input.revision) {
    throw new FinanceError("stale_snapshot", "Este snapshot foi alterado noutro separador.", 409);
  }
  const known = db.prepare("SELECT id FROM categories").all() as { id: string }[];
  const knownIds = new Set(known.map((row) => row.id));
  if (input.values.some((value) => !knownIds.has(value.categoryId))) {
    throw new FinanceError("unknown_category", "Uma das categorias já não existe.", 409);
  }
  const hash = snapshotContentHash(input);
  const duplicate = db
    .prepare("SELECT id FROM snapshots WHERE content_hash = ? AND id <> ?")
    .get(hash, id) as { id: string } | undefined;
  if (duplicate) throw new FinanceError("duplicate_snapshot", "Este snapshot já existe.", 409);
  const sameDate = db
    .prepare("SELECT id FROM snapshots WHERE snapshot_date = ? AND id <> ? LIMIT 1")
    .get(input.date, id) as { id: string } | undefined;
  if (sameDate && !input.allowSameDate) {
    throw new FinanceError(
      "same_date_conflict",
      "Já existe um snapshot nesta data. Confirma se queres manter ambos.",
      409,
    );
  }

  const now = new Date().toISOString();
  const insertValue = db.prepare(
    "INSERT INTO snapshot_values (snapshot_id, category_id, amount_cents) VALUES (?, ?, ?)",
  );
  db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE snapshots
         SET snapshot_date = ?, note = ?, content_hash = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND revision = ?`,
      )
      .run(input.date, input.note?.trim() || null, hash, now, id, input.revision);
    if (result.changes === 0) throw new FinanceError("stale_snapshot", "O snapshot foi entretanto alterado.", 409);
    db.prepare("DELETE FROM snapshot_values WHERE snapshot_id = ?").run(id);
    for (const value of input.values) insertValue.run(id, value.categoryId, value.amountCents);
  })();
  return getSnapshot(id, db);
}

export async function deleteSnapshot(id: string, database?: FinanceDatabase): Promise<void> {
  const db = database ?? (await getDatabase());
  const result = db.prepare("DELETE FROM snapshots WHERE id = ?").run(id);
  if (result.changes === 0) throw new FinanceError("snapshot_not_found", "Snapshot não encontrado.", 404);
}

export async function duplicateSnapshot(
  id: string,
  date: string,
  database?: FinanceDatabase,
): Promise<Snapshot> {
  const db = database ?? (await getDatabase());
  const source = await getSnapshot(id, db);
  return createSnapshot(
    {
      date,
      note: source.note,
      values: source.values,
      source: "manual",
      allowSameDate: false,
    },
    db,
  );
}

export async function quickEditSnapshot(
  input: { categoryId: string; amountCents: number; date: string; allowSameDate?: boolean },
  database?: FinanceDatabase,
): Promise<Snapshot> {
  const db = database ?? (await getDatabase());
  const latest = (await listSnapshots("DESC", db))[0];
  if (!latest) throw new FinanceError("no_snapshot", "Cria primeiro um snapshot completo.", 409);
  const categories = await listCategories({ includeArchived: true }, db);
  const target = categories.find((category) => category.id === input.categoryId);
  if (!target || target.archivedAt) {
    throw new FinanceError("category_not_found", "Categoria não encontrada.", 404);
  }
  const current = new Map(latest.values.map((value) => [value.categoryId, value.amountCents]));
  // Uma categoria arquivada não deve receber novas edições, mas um saldo histórico
  // ainda diferente de zero nunca pode desaparecer de um snapshot criado por quick edit.
  const carriedCategories = categories.filter(
    (category) => !category.archivedAt || (current.get(category.id) ?? 0) > 0,
  );
  const values = carriedCategories.map((category) => ({
    categoryId: category.id,
    amountCents:
      category.id === input.categoryId ? assertValidCents(input.amountCents) : (current.get(category.id) ?? 0),
  }));
  return createSnapshot(
    {
      date: input.date,
      values,
      source: "quick_edit",
      allowSameDate: input.allowSameDate ?? false,
    },
    db,
  );
}

export async function getDashboardData(database?: FinanceDatabase): Promise<DashboardData> {
  const db = database ?? (await getDatabase());
  const [snapshots, categories] = await Promise.all([
    listSnapshots("ASC", db),
    listCategories({ includeArchived: true }, db),
  ]);
  const latest = snapshots.at(-1) ?? null;
  const previous = snapshots.at(-2) ?? null;
  const first = snapshots[0] ?? null;
  const latestValues = new Map(latest?.values.map((value) => [value.categoryId, value.amountCents]));
  const previousValues = new Map(previous?.values.map((value) => [value.categoryId, value.amountCents]));
  const total = latest?.totalCents ?? 0;

  const categoryBalances: CategoryBalance[] = categories.flatMap((category) => {
    const amountCents = latestValues.get(category.id) ?? 0;
    if (category.archivedAt && amountCents === 0) return [];
    const previousAmountCents = previousValues.get(category.id) ?? 0;
    return [{
      ...category,
      amountCents,
      previousAmountCents,
      deltaCents: amountCents - previousAmountCents,
      percentage: total > 0 ? amountCents / total : 0,
    }];
  });

  const byDate = new Map<string, Snapshot>();
  for (const snapshot of snapshots) byDate.set(snapshot.date, snapshot);
  const chart = [...byDate.values()].map((snapshot) => ({
    id: snapshot.id,
    date: snapshot.date,
    totalCents: snapshot.totalCents,
    note: snapshot.note,
    values: snapshot.values,
  }));
  const record = chart.reduce<(typeof chart)[number] | null>(
    (best, point) => (!best || point.totalCents > best.totalCents ? point : best),
    null,
  );
  const sumType = (types: string[]) =>
    categoryBalances
      .filter((category) => types.includes(category.type))
      .reduce((sum, category) => sum + category.amountCents, 0);
  const growthCents = total - (first?.totalCents ?? total);

  return {
    latest,
    previous,
    first,
    categories: categoryBalances,
    chartCategories: categories,
    chart,
    record,
    stats: {
      totalCents: total,
      deltaCents: total - (previous?.totalCents ?? total),
      growthCents,
      growthPercentage: first?.totalCents ? growthCents / first.totalCents : null,
      investedCents: sumType(["investment"]),
      liquidCents: sumType(["available", "reserved"]),
      savingsCents: sumType(["savings"]),
    },
  };
}
