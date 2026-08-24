import { createHash, randomUUID } from "node:crypto";
import type { FinanceDatabase } from "@/lib/db/client";
import { getDatabase } from "@/lib/db/client";
import { FinanceError } from "@/lib/domain/errors";
import { MAX_MONEY_CENTS, parseMoneyToCents } from "@/lib/domain/money";
import { normalizeName, snapshotContentHash, stableJson } from "@/lib/domain/normalize";
import type { Category, CategoryType, SnapshotValue } from "@/lib/domain/types";
import { categoryInputSchema } from "@/lib/domain/validation";
import {
  parseImportDate,
  parseTabularFile,
  type ImportFileInput,
  type ParsedTabularFile,
  type TabularCell,
} from "@/lib/import/tabular";
import { listCategories } from "@/lib/services/categories";

export type { ImportFileInput } from "@/lib/import/tabular";

export type NewImportCategory = {
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
};

export type ImportCategoryMapping =
  | { columnIndex: number; categoryId: string; create?: never }
  | { columnIndex: number; categoryId?: never; create: NewImportCategory };

export type ImportMapping = {
  sheetName: string;
  headerRow: number;
  dateColumn: number;
  noteColumn?: number;
  categories: ImportCategoryMapping[];
};

export type ImportRowStatus = "ready" | "exact_duplicate" | "date_conflict" | "invalid";

export type ImportPreviewRow = {
  rowNumber: number;
  date: string | null;
  note: string | null;
  totalCents: number | null;
  status: ImportRowStatus;
  message: string | null;
  values: Array<{
    columnIndex: number;
    categoryId: string | null;
    categoryName: string;
    amountCents: number;
  }>;
};

export type ImportPreview = {
  file: {
    name: string;
    sha256: string;
    size: number;
    sheetName: string;
    sheetNames: string[];
  };
  headers: Array<{ columnIndex: number; label: string }>;
  mapping: ImportMapping;
  mappingHash: string;
  rows: ImportPreviewRow[];
  issues: Array<{
    rowNumber: number;
    status: Exclude<ImportRowStatus, "ready">;
    message: string;
  }>;
  summary: {
    rows: number;
    ready: number;
    exactDuplicates: number;
    dateConflicts: number;
    invalid: number;
    omittedFromPreview: number;
  };
  warnings: string[];
};

type ResolvedCategoryMapping = {
  columnIndex: number;
  targetKey: string;
  categoryId: string | null;
  categoryName: string;
  create: NewImportCategory | null;
};

type EvaluatedRow = ImportPreviewRow & {
  semanticHash: string | null;
  existingContentHash: string | null;
  resolvedValues: Array<{
    targetKey: string;
    categoryId: string | null;
    amountCents: number;
  }>;
};

const HEADER_SCAN_ROWS = 20;
const PREVIEW_ROWS = 100;
const PREVIEW_ISSUES = 100;
const NEW_CATEGORY_COLORS = [
  "#5B8CFF",
  "#9B7BFF",
  "#2FBF9F",
  "#F59E62",
  "#E56B8C",
  "#64A7A0",
  "#D4A72C",
  "#7C8BA1",
];

function headerLabel(value: TabularCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  // Reverte apenas a proteção anti-fórmula aplicada pela nossa própria exportação CSV.
  return /^'(?:[=+\-@\t\r\n]|\s+[=+\-@])/u.test(text) ? text.slice(1) : text;
}

function headerKey(value: TabularCell): string {
  return headerLabel(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-PT");
}

function isDateHeader(value: TabularCell): boolean {
  return ["data", "date", "data do snapshot", "snapshot date"].includes(headerKey(value));
}

function isNoteHeader(value: TabularCell): boolean {
  return ["nota", "notas", "note", "notes", "momento", "observacoes"].includes(headerKey(value));
}

function isTotalHeader(value: TabularCell): boolean {
  return ["total", "patrimonio", "patrimonio total", "net worth"].includes(headerKey(value));
}

function rowIsBlank(row: TabularCell[]): boolean {
  return row.every((value) => value === null || (typeof value === "string" && value.trim() === ""));
}

function detectHeaderRow(parsed: ParsedTabularFile, categories: Category[]): number {
  const categoryKeys = new Set(categories.map((category) => normalizeName(category.name)));
  let best = { row: -1, score: -1 };
  parsed.rows.slice(0, HEADER_SCAN_ROWS).forEach((row, rowIndex) => {
    let score = 0;
    let hasDate = false;
    for (const cell of row) {
      if (headerLabel(cell)) score += 1;
      if (isDateHeader(cell)) {
        score += 100;
        hasDate = true;
      }
      if (categoryKeys.has(normalizeName(headerLabel(cell)))) score += 8;
    }
    if (hasDate && score > best.score) best = { row: rowIndex, score };
  });
  if (best.row >= 0) return best.row;
  const fallback = parsed.rows.slice(0, HEADER_SCAN_ROWS).findIndex((row) => !rowIsBlank(row));
  if (fallback < 0) throw new FinanceError("import_header_not_found", "Não foi encontrado um cabeçalho.");
  return fallback;
}

function inferCategoryType(name: string): CategoryType {
  const key = headerKey(name);
  if (/\b(invest|broker|corretora|acoes|fundos)\b/.test(key)) return "investment";
  if (/\b(savings|poupanca|poupado)\b/.test(key)) return "savings";
  if (/\b(colecao|ativo|imovel)\b/.test(key)) return "asset";
  if (/\b(reserv|nao gastes|emergencia)\b/.test(key)) return "reserved";
  if (/\b(disponivel|conta corrente|cash|carteira)\b/.test(key)) return "available";
  return "other";
}

function suggestMapping(
  parsed: ParsedTabularFile,
  categories: Category[],
): { mapping: ImportMapping; warnings: string[] } {
  const headerRow = detectHeaderRow(parsed, categories);
  const headers = parsed.rows[headerRow];
  const byName = new Map(categories.map((category) => [normalizeName(category.name), category]));
  const warnings: string[] = [];
  let dateColumn = headers.findIndex(isDateHeader);
  if (dateColumn < 0) {
    dateColumn = headers.findIndex((cell) => Boolean(headerLabel(cell)));
    if (dateColumn < 0) throw new FinanceError("import_date_column_not_found", "Seleciona a coluna Data.");
    warnings.push("Não reconhecemos automaticamente a coluna Data. Confirma o mapeamento sugerido.");
  }
  const noteColumn = headers.findIndex((cell, index) => index !== dateColumn && isNoteHeader(cell));
  const mappedTargets = new Set<string>();
  const mappedNames = new Set<string>();
  const mappings: ImportCategoryMapping[] = [];

  headers.forEach((cell, columnIndex) => {
    if (columnIndex === dateColumn || columnIndex === noteColumn) return;
    const label = headerLabel(cell);
    if (!label) return;
    const existing = byName.get(normalizeName(label));
    if (existing) {
      if (mappedTargets.has(existing.id)) {
        warnings.push("Existem colunas repetidas no cabeçalho; confirma o mapeamento.");
        return;
      }
      mappedTargets.add(existing.id);
      mappings.push({ columnIndex, categoryId: existing.id });
      return;
    }
    if (isTotalHeader(cell)) return;
    const name = label.trim();
    const nameKey = normalizeName(name);
    if (!nameKey || name.length > 80 || mappedNames.has(nameKey)) {
      warnings.push("Uma coluna não pôde ser mapeada automaticamente; confirma os cabeçalhos.");
      return;
    }
    mappedNames.add(nameKey);
    mappings.push({
      columnIndex,
      create: {
        name,
        type: inferCategoryType(name),
        color: NEW_CATEGORY_COLORS[mappings.length % NEW_CATEGORY_COLORS.length],
        icon: "wallet",
      },
    });
  });

  if (mappings.length === 0) {
    warnings.push("Mapeia pelo menos uma coluna a uma categoria antes de importar.");
  }
  return {
    mapping: {
      sheetName: parsed.sheetName,
      headerRow,
      dateColumn,
      ...(noteColumn >= 0 ? { noteColumn } : {}),
      categories: mappings,
    },
    warnings,
  };
}

function validateColumnIndex(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 250) {
    throw new FinanceError("invalid_import_mapping", `A coluna ${name} não é válida.`);
  }
  return value;
}

function resolveMapping(
  mapping: ImportMapping,
  parsed: ParsedTabularFile,
  categories: Category[],
): ResolvedCategoryMapping[] {
  if (
    mapping.sheetName !== parsed.sheetName ||
    !Number.isSafeInteger(mapping.headerRow) ||
    mapping.headerRow < 0 ||
    mapping.headerRow >= parsed.rows.length
  ) {
    throw new FinanceError("invalid_import_mapping", "O mapeamento já não corresponde ao ficheiro.", 409);
  }
  validateColumnIndex(mapping.dateColumn, "Data");
  if (mapping.noteColumn !== undefined) validateColumnIndex(mapping.noteColumn, "Nota");
  if (mapping.noteColumn === mapping.dateColumn) {
    throw new FinanceError("invalid_import_mapping", "Data e Nota não podem usar a mesma coluna.");
  }
  if (!Array.isArray(mapping.categories) || mapping.categories.length === 0 || mapping.categories.length > 250) {
    throw new FinanceError("invalid_import_mapping", "Mapeia pelo menos uma categoria.");
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const existingNames = new Set(categories.map((category) => normalizeName(category.name)));
  const columns = new Set<number>([
    mapping.dateColumn,
    ...(mapping.noteColumn === undefined ? [] : [mapping.noteColumn]),
  ]);
  const targets = new Set<string>();
  const resolved: ResolvedCategoryMapping[] = [];
  for (const item of mapping.categories) {
    if (!item || typeof item !== "object") {
      throw new FinanceError("invalid_import_mapping", "O mapeamento de categorias não é válido.");
    }
    const columnIndex = validateColumnIndex(item.columnIndex, "de categoria");
    if (columns.has(columnIndex)) {
      throw new FinanceError("invalid_import_mapping", "Uma coluna foi mapeada mais do que uma vez.");
    }
    columns.add(columnIndex);
    if (item.categoryId) {
      const category = byId.get(item.categoryId);
      if (!category) {
        throw new FinanceError(
          "import_category_changed",
          "Uma categoria do mapeamento já não existe.",
          409,
        );
      }
      const targetKey = `existing:${category.id}`;
      if (targets.has(targetKey)) {
        throw new FinanceError("invalid_import_mapping", "Uma categoria foi mapeada mais do que uma vez.");
      }
      targets.add(targetKey);
      resolved.push({
        columnIndex,
        targetKey,
        categoryId: category.id,
        categoryName: category.name,
        create: null,
      });
      continue;
    }
    let create: NewImportCategory;
    try {
      create = categoryInputSchema.parse(item.create) as NewImportCategory;
    } catch {
      throw new FinanceError("invalid_import_mapping", "Os dados da nova categoria não são válidos.");
    }
    const nameKey = normalizeName(create.name);
    if (existingNames.has(nameKey)) {
      throw new FinanceError(
        "import_category_already_exists",
        "Uma nova categoria já existe. Liga a coluna à categoria existente.",
        409,
      );
    }
    const targetKey = `new:${nameKey}`;
    if (targets.has(targetKey)) {
      throw new FinanceError("invalid_import_mapping", "Uma categoria foi mapeada mais do que uma vez.");
    }
    targets.add(targetKey);
    resolved.push({
      columnIndex,
      targetKey,
      categoryId: null,
      categoryName: create.name,
      create,
    });
  }
  return resolved;
}

function parseNote(value: TabularCell): string | null {
  if (value === null || value === undefined) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > 500 || note.includes("\0")) {
    throw new FinanceError("invalid_import_note", "A nota excede o limite de 500 caracteres.");
  }
  return note;
}

function parseAmount(value: TabularCell): number {
  if (value === null || (typeof value === "string" && value.trim() === "")) return 0;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new FinanceError("invalid_import_amount", "Um montante não é válido.");
  }
  try {
    return parseMoneyToCents(value);
  } catch {
    throw new FinanceError(
      "invalid_import_amount",
      "Um montante é inválido. Usa valores iguais ou superiores a zero, com até dois cêntimos.",
    );
  }
}

function mappingDigest(mapping: ImportMapping): string {
  const categories = mapping.categories.map((item) => {
    if (item.categoryId) return { columnIndex: item.columnIndex, categoryId: item.categoryId };
    if (!item.create) {
      throw new FinanceError("invalid_import_mapping", "O mapeamento de categorias não é válido.");
    }
    return {
      columnIndex: item.columnIndex,
      create: {
        name: item.create.name,
        type: item.create.type,
        color: item.create.color,
        icon: item.create.icon,
      },
    };
  });
  const canonical = {
    sheetName: mapping.sheetName,
    headerRow: mapping.headerRow,
    dateColumn: mapping.dateColumn,
    ...(mapping.noteColumn === undefined ? {} : { noteColumn: mapping.noteColumn }),
    categories,
  };
  return createHash("sha256").update(stableJson(canonical)).digest("hex");
}

function semanticRowHash(
  date: string,
  note: string | null,
  values: EvaluatedRow["resolvedValues"],
): string {
  return createHash("sha256")
    .update(
      stableJson({
        date,
        note,
        values: [...values]
          .sort((a, b) => a.targetKey.localeCompare(b.targetKey))
          .map((value) => [value.targetKey, value.amountCents]),
      }),
    )
    .digest("hex");
}

function invalidEvaluatedRow(rowNumber: number, message: string): EvaluatedRow {
  return {
    rowNumber,
    date: null,
    note: null,
    totalCents: null,
    status: "invalid",
    message,
    values: [],
    semanticHash: null,
    existingContentHash: null,
    resolvedValues: [],
  };
}

function evaluateRows(
  parsed: ParsedTabularFile,
  mapping: ImportMapping,
  resolved: ResolvedCategoryMapping[],
  database: FinanceDatabase,
): EvaluatedRow[] {
  const existing = database
    .prepare("SELECT snapshot_date, content_hash FROM snapshots")
    .all() as Array<{ snapshot_date: string; content_hash: string }>;
  const existingDates = new Set(existing.map((row) => row.snapshot_date));
  const existingHashes = new Set(existing.map((row) => row.content_hash));
  const seenDates = new Set<string>();
  const seenSemantic = new Set<string>();
  const result: EvaluatedRow[] = [];

  parsed.rows.slice(mapping.headerRow + 1).forEach((row, offset) => {
    if (rowIsBlank(row)) return;
    const rowNumber = mapping.headerRow + offset + 2;
    try {
      const date = parseImportDate(row[mapping.dateColumn] ?? null, parsed.date1904);
      const note = mapping.noteColumn === undefined ? null : parseNote(row[mapping.noteColumn] ?? null);
      let totalCents = 0;
      const resolvedValues = resolved.map((category) => {
        const amountCents = parseAmount(row[category.columnIndex] ?? null);
        totalCents += amountCents;
        if (!Number.isSafeInteger(totalCents) || totalCents > MAX_MONEY_CENTS) {
          throw new FinanceError("invalid_import_total", "O total da linha excede o limite permitido.");
        }
        return {
          targetKey: category.targetKey,
          categoryId: category.categoryId,
          amountCents,
        };
      });
      const semanticHash = semanticRowHash(date, note, resolvedValues);
      const canCompareExisting = resolvedValues.every((value) => value.categoryId !== null);
      const existingContentHash = canCompareExisting
        ? snapshotContentHash({
            date,
            note,
            values: resolvedValues.map((value) => ({
              categoryId: value.categoryId as string,
              amountCents: value.amountCents,
            })),
          })
        : null;

      let status: ImportRowStatus = "ready";
      let message: string | null = null;
      if (
        (existingContentHash && existingHashes.has(existingContentHash)) ||
        seenSemantic.has(semanticHash)
      ) {
        status = "exact_duplicate";
        message = "Este snapshot já existe e será ignorado.";
      } else if (existingDates.has(date) || seenDates.has(date)) {
        status = "date_conflict";
        message = "Já existe um snapshot diferente nesta data.";
      }
      seenSemantic.add(semanticHash);
      seenDates.add(date);
      result.push({
        rowNumber,
        date,
        note,
        totalCents,
        status,
        message,
        values: resolved.map((category, index) => ({
          columnIndex: category.columnIndex,
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          amountCents: resolvedValues[index].amountCents,
        })),
        semanticHash,
        existingContentHash,
        resolvedValues,
      });
    } catch (error) {
      result.push(
        invalidEvaluatedRow(
          rowNumber,
          error instanceof FinanceError ? error.message : "A linha contém dados inválidos.",
        ),
      );
    }
  });
  return result;
}

export async function previewImportFile(
  input: ImportFileInput,
  options: { mapping?: ImportMapping; sheetName?: string } = {},
  database?: FinanceDatabase,
): Promise<ImportPreview> {
  const db = database ?? (await getDatabase());
  const parsed = parseTabularFile(input, {
    sheetName: options.mapping?.sheetName ?? options.sheetName,
  });
  const categories = await listCategories({ includeArchived: true }, db);
  const suggested = options.mapping
    ? { mapping: options.mapping, warnings: [] as string[] }
    : suggestMapping(parsed, categories);
  const resolved = resolveMapping(suggested.mapping, parsed, categories);
  const evaluated = evaluateRows(parsed, suggested.mapping, resolved, db);
  const counts = (status: ImportRowStatus) =>
    evaluated.reduce((total, row) => total + Number(row.status === status), 0);
  const publicRows = evaluated.slice(0, PREVIEW_ROWS).map((row) => ({
    rowNumber: row.rowNumber,
    date: row.date,
    note: row.note,
    totalCents: row.totalCents,
    status: row.status,
    message: row.message,
    values: row.values,
  }));
  const issues = evaluated
    .filter((row) => row.status !== "ready")
    .slice(0, PREVIEW_ISSUES)
    .map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status as Exclude<ImportRowStatus, "ready">,
      message: row.message ?? "A linha precisa de atenção.",
    }));
  const header = parsed.rows[suggested.mapping.headerRow] ?? [];

  return {
    file: {
      name: parsed.fileName,
      sha256: parsed.fileSha256,
      size: parsed.fileSize,
      sheetName: parsed.sheetName,
      sheetNames: parsed.sheetNames,
    },
    headers: header.map((value, columnIndex) => ({ columnIndex, label: headerLabel(value) })),
    mapping: suggested.mapping,
    mappingHash: mappingDigest(suggested.mapping),
    rows: publicRows,
    issues,
    summary: {
      rows: evaluated.length,
      ready: counts("ready"),
      exactDuplicates: counts("exact_duplicate"),
      dateConflicts: counts("date_conflict"),
      invalid: counts("invalid"),
      omittedFromPreview: Math.max(0, evaluated.length - publicRows.length),
    },
    warnings: suggested.warnings,
  };
}

export async function commitImportPreview(
  input: ImportFileInput,
  options: {
    mapping: ImportMapping;
    expectedFileSha256: string;
    expectedMappingHash: string;
    allowDateConflicts?: boolean;
    database?: FinanceDatabase;
    now?: Date;
  },
): Promise<{
  batchId: string | null;
  importedRows: number;
  skippedExactDuplicates: number;
  createdCategories: Array<{ id: string; name: string }>;
}> {
  const db = options.database ?? (await getDatabase());
  const parsed = parseTabularFile(input, { sheetName: options.mapping.sheetName });
  if (!/^[a-f0-9]{64}$/.test(options.expectedFileSha256)) {
    throw new FinanceError("import_preview_required", "Pré-visualiza novamente o ficheiro.", 409);
  }
  if (parsed.fileSha256 !== options.expectedFileSha256) {
    throw new FinanceError(
      "import_file_changed",
      "O ficheiro mudou desde a pré-visualização. Revê-o antes de importar.",
      409,
    );
  }
  const categories = await listCategories({ includeArchived: true }, db);
  const resolved = resolveMapping(options.mapping, parsed, categories);
  const currentMappingHash = mappingDigest(options.mapping);
  if (
    !/^[a-f0-9]{64}$/.test(options.expectedMappingHash) ||
    currentMappingHash !== options.expectedMappingHash
  ) {
    throw new FinanceError(
      "import_mapping_changed",
      "O mapeamento mudou desde a pré-visualização. Revê-o antes de importar.",
      409,
    );
  }
  const evaluated = evaluateRows(parsed, options.mapping, resolved, db);
  const invalid = evaluated.filter((row) => row.status === "invalid");
  if (invalid.length > 0) {
    throw new FinanceError(
      "import_has_invalid_rows",
      `A importação contém ${invalid.length} linha${invalid.length === 1 ? "" : "s"} inválida${invalid.length === 1 ? "" : "s"}. Corrige o ficheiro primeiro.`,
      409,
    );
  }
  const conflicts = evaluated.filter((row) => row.status === "date_conflict");
  if (conflicts.length > 0 && !options.allowDateConflicts) {
    throw new FinanceError(
      "import_date_conflicts",
      `Existem ${conflicts.length} conflito${conflicts.length === 1 ? "" : "s"} de data. Confirma explicitamente se queres manter ambos.`,
      409,
    );
  }

  const importable = evaluated.filter(
    (row) => row.status === "ready" || (row.status === "date_conflict" && options.allowDateConflicts),
  );
  const skippedExactDuplicates = evaluated.length - importable.length - conflicts.length * Number(!options.allowDateConflicts);
  if (importable.length === 0) {
    return { batchId: null, importedRows: 0, skippedExactDuplicates, createdCategories: [] };
  }

  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new FinanceError("invalid_import_time", "Data de importação inválida.");
  const nowIso = now.toISOString();
  const batchId = randomUUID();
  const newCategoryIds = new Map<string, string>();
  for (const item of resolved) {
    if (item.create) newCategoryIds.set(item.targetKey, randomUUID());
  }
  const createdCategories = resolved
    .filter((item): item is ResolvedCategoryMapping & { create: NewImportCategory } => Boolean(item.create))
    .map((item) => ({ id: newCategoryIds.get(item.targetKey) as string, name: item.create.name }));

  const insertCategory = db.prepare(
    `INSERT INTO categories
     (id, name, name_key, type, color, icon, position, archived_at, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
  );
  const insertSnapshot = db.prepare(
    `INSERT INTO snapshots
     (id, snapshot_date, recorded_at, note, source, content_hash, import_batch_id,
      revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'import', ?, ?, 1, ?, ?)`,
  );
  const insertValue = db.prepare(
    "INSERT INTO snapshot_values (snapshot_id, category_id, amount_cents) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    let position = (
      db.prepare(
        "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM categories WHERE archived_at IS NULL",
      ).get() as { position: number }
    ).position;
    for (const item of resolved) {
      if (!item.create) continue;
      const id = newCategoryIds.get(item.targetKey) as string;
      insertCategory.run(
        id,
        item.create.name,
        normalizeName(item.create.name),
        item.create.type,
        item.create.color,
        item.create.icon,
        position,
        nowIso,
        nowIso,
      );
      position += 1;
    }

    db.prepare(
      `INSERT INTO import_batches
       (id, file_name, file_sha256, mapping_hash, imported_rows, skipped_rows, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      batchId,
      parsed.fileName,
      parsed.fileSha256,
      currentMappingHash,
      importable.length,
      skippedExactDuplicates,
      nowIso,
    );

    importable.forEach((row, index) => {
      const values: SnapshotValue[] = row.resolvedValues.map((value) => ({
        categoryId: value.categoryId ?? (newCategoryIds.get(value.targetKey) as string),
        amountCents: value.amountCents,
      }));
      const id = randomUUID();
      const recordedAt = new Date(now.getTime() + index).toISOString();
      const contentHash = snapshotContentHash({ date: row.date as string, note: row.note, values });
      insertSnapshot.run(
        id,
        row.date,
        recordedAt,
        row.note,
        contentHash,
        batchId,
        nowIso,
        nowIso,
      );
      for (const value of values) insertValue.run(id, value.categoryId, value.amountCents);
    });
  })();

  return {
    batchId,
    importedRows: importable.length,
    skippedExactDuplicates,
    createdCategories,
  };
}
