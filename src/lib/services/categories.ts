import { randomUUID } from "node:crypto";
import type { FinanceDatabase } from "@/lib/db/client";
import { getDatabase } from "@/lib/db/client";
import { FinanceError } from "@/lib/domain/errors";
import { normalizeName } from "@/lib/domain/normalize";
import type { Category } from "@/lib/domain/types";
import { categoryInputSchema } from "@/lib/domain/validation";

type CategoryRow = {
  id: string;
  name: string;
  type: Category["type"];
  color: string;
  icon: string;
  position: number;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export function mapCategory(row: CategoryRow): Category {
  return {
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
  };
}

export async function listCategories(
  options: { includeArchived?: boolean } = {},
  database?: FinanceDatabase,
): Promise<Category[]> {
  const db = database ?? (await getDatabase());
  const rows = db
    .prepare(
      `SELECT * FROM categories
       ${options.includeArchived ? "" : "WHERE archived_at IS NULL"}
       ORDER BY archived_at IS NOT NULL, position, created_at`,
    )
    .all() as CategoryRow[];
  return rows.map(mapCategory);
}

export async function createCategory(
  input: { name: string; type: Category["type"]; color: string; icon: string },
  database?: FinanceDatabase,
): Promise<Category> {
  const parsed = categoryInputSchema.parse(input);
  const db = database ?? (await getDatabase());
  const now = new Date().toISOString();
  const id = randomUUID();
  const position = (
    db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM categories WHERE archived_at IS NULL").get() as {
      position: number;
    }
  ).position;

  try {
    db.prepare(
      `INSERT INTO categories
       (id, name, name_key, type, color, icon, position, archived_at, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
    ).run(
      id,
      parsed.name,
      normalizeName(parsed.name),
      parsed.type,
      parsed.color,
      parsed.icon,
      position,
      now,
      now,
    );
  } catch (error) {
    if (/UNIQUE constraint failed: categories.name_key/i.test(String(error))) {
      throw new FinanceError("category_name_exists", "Já existe uma categoria com este nome.", 409);
    }
    throw error;
  }

  return mapCategory(db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow);
}

export async function updateCategory(
  id: string,
  input: { name: string; type: Category["type"]; color: string; icon: string; revision?: number },
  database?: FinanceDatabase,
): Promise<Category> {
  const parsed = categoryInputSchema.parse(input);
  const db = database ?? (await getDatabase());
  const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow | undefined;
  if (!existing) throw new FinanceError("category_not_found", "Categoria não encontrada.", 404);
  if (input.revision && input.revision !== existing.revision) {
    throw new FinanceError("stale_category", "Esta categoria foi alterada noutro separador.", 409);
  }

  try {
    db.prepare(
      `UPDATE categories
       SET name = ?, name_key = ?, type = ?, color = ?, icon = ?,
           revision = revision + 1, updated_at = ?
       WHERE id = ?`,
    ).run(
      parsed.name,
      normalizeName(parsed.name),
      parsed.type,
      parsed.color,
      parsed.icon,
      new Date().toISOString(),
      id,
    );
  } catch (error) {
    if (/UNIQUE constraint failed: categories.name_key/i.test(String(error))) {
      throw new FinanceError("category_name_exists", "Já existe uma categoria com este nome.", 409);
    }
    throw error;
  }
  return mapCategory(db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow);
}

export async function setCategoryArchived(
  id: string,
  archived: boolean,
  database?: FinanceDatabase,
): Promise<void> {
  const db = database ?? (await getDatabase());
  if (archived) {
    const latestBalance = db
      .prepare(
        `SELECT COALESCE(sv.amount_cents, 0) AS amount_cents
         FROM snapshots s
         LEFT JOIN snapshot_values sv ON sv.snapshot_id = s.id AND sv.category_id = ?
         ORDER BY s.snapshot_date DESC, s.recorded_at DESC, s.id DESC
         LIMIT 1`,
      )
      .get(id) as { amount_cents: number } | undefined;
    if ((latestBalance?.amount_cents ?? 0) > 0) {
      throw new FinanceError(
        "category_has_current_balance",
        "Atualiza primeiro esta categoria para 0 €. Assim, arquivá-la não faz dinheiro desaparecer do próximo snapshot.",
        409,
      );
    }
  }
  const result = db
    .prepare(
      "UPDATE categories SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?",
    )
    .run(archived ? new Date().toISOString() : null, new Date().toISOString(), id);
  if (result.changes === 0) throw new FinanceError("category_not_found", "Categoria não encontrada.", 404);
}

export async function deleteCategory(id: string, database?: FinanceDatabase): Promise<void> {
  const db = database ?? (await getDatabase());
  const count = (
    db.prepare("SELECT COUNT(*) AS count FROM snapshot_values WHERE category_id = ?").get(id) as {
      count: number;
    }
  ).count;
  if (count > 0) {
    throw new FinanceError(
      "category_has_history",
      "Esta categoria tem histórico. Arquiva-a para preservar os registos.",
      409,
    );
  }
  const result = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (result.changes === 0) throw new FinanceError("category_not_found", "Categoria não encontrada.", 404);
}

export async function reorderCategories(ids: string[], database?: FinanceDatabase): Promise<void> {
  const db = database ?? (await getDatabase());
  if (new Set(ids).size !== ids.length) throw new FinanceError("invalid_order", "Ordem inválida.");
  const active = db
    .prepare("SELECT id FROM categories WHERE archived_at IS NULL ORDER BY position")
    .all() as { id: string }[];
  const activeIds = active.map((row) => row.id);
  if (activeIds.length !== ids.length || activeIds.some((id) => !ids.includes(id))) {
    throw new FinanceError("invalid_order", "A ordem já não corresponde às categorias atuais.", 409);
  }
  const update = db.prepare(
    "UPDATE categories SET position = ?, revision = revision + 1, updated_at = ? WHERE id = ?",
  );
  db.transaction(() => {
    const now = new Date().toISOString();
    ids.forEach((id, position) => update.run(position, now, id));
  })();
}
