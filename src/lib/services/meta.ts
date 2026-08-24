import type { FinanceDatabase } from "@/lib/db/client";
import { getDatabase } from "@/lib/db/client";

export async function getMeta<T>(
  key: string,
  fallback: T,
  database?: FinanceDatabase,
): Promise<T> {
  const db = database ?? (await getDatabase());
  const row = db.prepare("SELECT value_json FROM app_meta WHERE key = ?").get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function setMeta(
  key: string,
  value: unknown,
  database?: FinanceDatabase,
): Promise<void> {
  const db = database ?? (await getDatabase());
  db.prepare(
    `INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export async function getOnboardingState(database?: FinanceDatabase) {
  const db = database ?? (await getDatabase());
  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM categories) AS categories,
              (SELECT COUNT(*) FROM snapshots) AS snapshots`,
    )
    .get() as { categories: number; snapshots: number };
  const completed = await getMeta("onboarding_completed", false, db);
  return {
    ...counts,
    required: !completed && counts.categories === 0 && counts.snapshots === 0,
  };
}
