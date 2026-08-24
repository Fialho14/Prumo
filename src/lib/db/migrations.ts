export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
        name_key TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'other'
          CHECK(type IN ('available','reserved','investment','asset','savings','other')),
        color TEXT NOT NULL CHECK(length(color) BETWEEN 4 AND 32),
        icon TEXT NOT NULL CHECK(length(icon) BETWEEN 1 AND 48),
        position INTEGER NOT NULL CHECK(position >= 0),
        archived_at TEXT,
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS categories_order_idx
        ON categories(archived_at, position);

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY NOT NULL,
        file_name TEXT NOT NULL,
        file_sha256 TEXT NOT NULL,
        mapping_hash TEXT NOT NULL,
        imported_rows INTEGER NOT NULL CHECK(imported_rows >= 0),
        skipped_rows INTEGER NOT NULL CHECK(skipped_rows >= 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS import_batches_file_idx
        ON import_batches(file_sha256);

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        snapshot_date TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        note TEXT CHECK(note IS NULL OR length(note) <= 500),
        source TEXT NOT NULL DEFAULT 'manual'
          CHECK(source IN ('manual','quick_edit','import','demo')),
        content_hash TEXT NOT NULL UNIQUE,
        import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS snapshots_chronological_idx
        ON snapshots(snapshot_date, recorded_at, id);

      CREATE TABLE IF NOT EXISTS snapshot_values (
        snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        amount_cents INTEGER NOT NULL
          CHECK(typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 0 AND 9000000000000),
        PRIMARY KEY(snapshot_id, category_id)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS snapshot_values_category_idx
        ON snapshot_values(category_id);
    `,
  },
];
