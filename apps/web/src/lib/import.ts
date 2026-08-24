import { assertIsoDate } from "@/lib/domain/dates";
import { MAX_MONEY_CENTS, parseMoneyToCents } from "@/lib/domain/money";
import type { Snapshot } from "@/lib/domain/types";
import {
  WEB_PORTFOLIO_SCHEMA_VERSION,
  createWebCategory,
  normalizePortfolio,
  slugifyCategoryName,
  type WebPortfolio,
} from "./data-model";

export const IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxXlsxUncompressedBytes: 100 * 1024 * 1024,
  maxXlsxEntryBytes: 50 * 1024 * 1024,
  maxXlsxEntries: 10_000,
  maxXlsxCompressionRatio: 200,
  maxRows: 5_000,
  maxColumns: 100,
  maxSheets: 10,
  maxCellCharacters: 10_000,
});

export type FinancialFileKind = "xlsx" | "csv";

export type FinancialFile = Pick<Blob, "arrayBuffer" | "size" | "type"> & {
  name: string;
};

export type ImportIssue = {
  code: string;
  message: string;
  row?: number;
  column?: string;
};

export type ImportPreviewRow = {
  sourceRow: number;
  date: string | null;
  valuesCents: Record<string, number | null>;
  totalCents: number | null;
  note: string | null;
  valid: boolean;
  errors: string[];
};

export type ImportPreview = {
  fileName: string;
  fileType: FinancialFileKind;
  sheetName: string | null;
  availableSheets: string[];
  categories: string[];
  snapshotCount: number;
  totalRowCount: number;
  skippedRowCount: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  duplicateDates: string[];
  unknownColumns: string[];
  ignoredColumns: string[];
  rows: ImportPreviewRow[];
  canImport: boolean;
};

export type FinancialImportResult = {
  preview: ImportPreview;
  portfolio: WebPortfolio | null;
};

export type FinancialFileErrorCode =
  | "empty_file"
  | "file_too_large"
  | "unsupported_extension"
  | "mime_mismatch"
  | "invalid_signature"
  | "invalid_encoding"
  | "invalid_workbook"
  | "unsafe_workbook"
  | "sheet_not_found"
  | "too_many_sheets"
  | "too_many_rows"
  | "too_many_columns"
  | "cell_too_large";

export class FinancialFileError extends Error {
  constructor(
    public readonly code: FinancialFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FinancialFileError";
  }
}

type CellValue = string | number | boolean | Date | null | undefined;
type Matrix = CellValue[][];

type XlsxDateDecoder = (serial: number) => {
  y: number;
  m: number;
  d: number;
} | null;

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/zip",
]);
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
]);

const DATE_HEADERS = new Set(["date", "data", "snapshot date", "snapshot"]);
const NOTE_HEADERS = new Set(["note", "notes", "nota", "notas"]);
const IGNORED_HEADERS = new Set([
  "total",
  "total cents",
  "net worth",
  "patrimonio",
  "património",
  "id",
  "snapshot id",
  "source",
  "recorded at",
  "created at",
  "updated at",
]);

function cleanMime(type: string): string {
  return type.split(";", 1)[0].trim().toLocaleLowerCase("en");
}

function fileKindFromName(name: string): FinancialFileKind {
  const extension = name.trim().toLocaleLowerCase("en").match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "xlsx" || extension === "csv") return extension;
  throw new FinancialFileError(
    "unsupported_extension",
    "Choose an .xlsx or .csv file.",
  );
}

function validateFileEnvelope(file: FinancialFile, kind: FinancialFileKind): void {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new FinancialFileError("empty_file", "The selected file is empty.");
  }
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    throw new FinancialFileError(
      "file_too_large",
      `The file is larger than the ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB limit.`,
    );
  }
  const mime = cleanMime(file.type);
  if (GENERIC_MIME_TYPES.has(mime)) return;
  const allowed = kind === "xlsx" ? XLSX_MIME_TYPES : CSV_MIME_TYPES;
  if (!allowed.has(mime)) {
    throw new FinancialFileError(
      "mime_mismatch",
      `The file type reported by the browser does not match .${kind}.`,
    );
  }
}

function hasZipSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function validateMagic(bytes: Uint8Array, kind: FinancialFileKind): void {
  if (kind === "xlsx") {
    if (!hasZipSignature(bytes)) {
      throw new FinancialFileError(
        "invalid_signature",
        "This file does not contain a valid XLSX workbook signature.",
      );
    }
    return;
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  let suspiciousControls = 0;
  for (const byte of sample) {
    if (byte === 0) {
      throw new FinancialFileError("invalid_signature", "This CSV appears to be a binary file.");
    }
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspiciousControls += 1;
  }
  if (sample.length > 0 && suspiciousControls / sample.length > 0.01) {
    throw new FinancialFileError("invalid_signature", "This CSV contains unexpected binary data.");
  }
}

/**
 * Validates the ZIP central directory before SheetJS is imported or any entry
 * is decompressed. XLSX files are untrusted compressed containers; the 10 MB
 * outer-file limit alone does not protect against zip bombs.
 */
function assertSafeXlsxContainer(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localSignature = 0x04034b50;
  const centralSignature = 0x02014b50;
  const eocdSignature = 0x06054b50;
  const minimumEocdBytes = 22;

  const invalid = (message: string): never => {
    throw new FinancialFileError("invalid_workbook", message);
  };
  const unsafe = (message: string): never => {
    throw new FinancialFileError("unsafe_workbook", message);
  };
  const u16 = (offset: number): number => {
    if (offset < 0 || offset + 2 > view.byteLength) invalid("The XLSX ZIP directory is truncated.");
    return view.getUint16(offset, true);
  };
  const u32 = (offset: number): number => {
    if (offset < 0 || offset + 4 > view.byteLength) invalid("The XLSX ZIP directory is truncated.");
    return view.getUint32(offset, true);
  };
  const assertNoZip64Extra = (offset: number, length: number): void => {
    const end = offset + length;
    if (offset < 0 || end > bytes.byteLength) invalid("An XLSX ZIP extra field is truncated.");
    let cursor = offset;
    while (cursor < end) {
      if (cursor + 4 > end) invalid("An XLSX ZIP extra field is malformed.");
      const headerId = u16(cursor);
      const dataLength = u16(cursor + 2);
      cursor += 4;
      if (cursor + dataLength > end) invalid("An XLSX ZIP extra field is malformed.");
      if (headerId === 0x0001) unsafe("ZIP64 workbooks are not accepted by Prumo Web.");
      cursor += dataLength;
    }
  };

  if (bytes.byteLength < minimumEocdBytes) invalid("The XLSX file has no valid ZIP directory.");
  // EOCD may be followed by a standards-compliant comment of at most 65,535 bytes.
  const searchStart = Math.max(0, bytes.byteLength - 65_535 - minimumEocdBytes);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - minimumEocdBytes; offset >= searchStart; offset -= 1) {
    if (u32(offset) !== eocdSignature) continue;
    const commentLength = u16(offset + 20);
    if (offset + minimumEocdBytes + commentLength === bytes.byteLength) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) invalid("The XLSX file has no valid ZIP end record.");

  const diskNumber = u16(eocdOffset + 4);
  const centralDisk = u16(eocdOffset + 6);
  const entriesOnDisk = u16(eocdOffset + 8);
  const entryCount = u16(eocdOffset + 10);
  const centralSize = u32(eocdOffset + 12);
  const centralOffset = u32(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    invalid("Multi-disk XLSX ZIP containers are not supported.");
  }
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    unsafe("ZIP64 workbooks are not accepted by Prumo Web.");
  }
  if (entryCount === 0 || entryCount > IMPORT_LIMITS.maxXlsxEntries) {
    unsafe(`An XLSX file can contain at most ${IMPORT_LIMITS.maxXlsxEntries.toLocaleString("en")} ZIP entries.`);
  }
  const centralEnd = centralOffset + centralSize;
  if (
    !Number.isSafeInteger(centralEnd) ||
    centralOffset >= eocdOffset ||
    centralEnd !== eocdOffset
  ) {
    invalid("The XLSX ZIP central-directory offsets are invalid.");
  }

  let centralCursor = centralOffset;
  let totalUncompressed = 0;
  const localOffsets = new Set<number>();
  for (let index = 0; index < entryCount; index += 1) {
    if (centralCursor + 46 > centralEnd || u32(centralCursor) !== centralSignature) {
      invalid("The XLSX ZIP central directory is damaged.");
    }
    const flags = u16(centralCursor + 8);
    const compressionMethod = u16(centralCursor + 10);
    const compressedBytes = u32(centralCursor + 20);
    const uncompressedBytes = u32(centralCursor + 24);
    const nameLength = u16(centralCursor + 28);
    const extraLength = u16(centralCursor + 30);
    const commentLength = u16(centralCursor + 32);
    const startDisk = u16(centralCursor + 34);
    const localOffset = u32(centralCursor + 42);
    const entryEnd = centralCursor + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > centralEnd || nameLength === 0) {
      invalid("An XLSX ZIP directory entry is truncated or unnamed.");
    }
    if ((flags & 0x1) !== 0 || (flags & 0x40) !== 0) {
      unsafe("Encrypted XLSX workbooks are not accepted.");
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      unsafe("The XLSX uses an unsupported ZIP compression method.");
    }
    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      localOffset === 0xffffffff ||
      startDisk === 0xffff
    ) {
      unsafe("ZIP64 workbooks are not accepted by Prumo Web.");
    }
    if (startDisk !== 0) invalid("Multi-disk XLSX ZIP entries are not supported.");
    if (uncompressedBytes > IMPORT_LIMITS.maxXlsxEntryBytes) {
      unsafe("An XLSX ZIP entry is too large after decompression.");
    }
    if (compressedBytes === 0 && uncompressedBytes > 0) {
      unsafe("An XLSX ZIP entry declares an unsafe compressed size.");
    }
    if (
      uncompressedBytes >
      compressedBytes * IMPORT_LIMITS.maxXlsxCompressionRatio + 1024 * 1024
    ) {
      unsafe("The XLSX ZIP compression ratio is unsafe.");
    }
    totalUncompressed += uncompressedBytes;
    if (
      !Number.isSafeInteger(totalUncompressed) ||
      totalUncompressed > IMPORT_LIMITS.maxXlsxUncompressedBytes
    ) {
      unsafe("The XLSX is too large after decompression.");
    }
    assertNoZip64Extra(centralCursor + 46 + nameLength, extraLength);

    if (
      localOffset + 30 > centralOffset ||
      localOffset >= centralOffset ||
      localOffsets.has(localOffset) ||
      u32(localOffset) !== localSignature
    ) {
      invalid("An XLSX ZIP entry points to an invalid local header.");
    }
    localOffsets.add(localOffset);
    const localFlags = u16(localOffset + 6);
    const localCompressionMethod = u16(localOffset + 8);
    const localCompressedBytes = u32(localOffset + 18);
    const localUncompressedBytes = u32(localOffset + 22);
    const localNameLength = u16(localOffset + 26);
    const localExtraLength = u16(localOffset + 28);
    const localDataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const localDataEnd = localDataOffset + compressedBytes;
    if (
      (localFlags & 0x1) !== 0 ||
      (localFlags & 0x40) !== 0 ||
      localCompressionMethod !== compressionMethod ||
      localNameLength !== nameLength ||
      localDataOffset > centralOffset ||
      localDataEnd > centralOffset
    ) {
      invalid("An XLSX ZIP local header does not match its directory entry.");
    }
    if (localCompressedBytes === 0xffffffff || localUncompressedBytes === 0xffffffff) {
      unsafe("ZIP64 workbooks are not accepted by Prumo Web.");
    }
    const usesDataDescriptor = (localFlags & 0x08) !== 0;
    if (!usesDataDescriptor && (
      localCompressedBytes !== compressedBytes ||
      localUncompressedBytes !== uncompressedBytes
    )) {
      invalid("An XLSX ZIP local header declares inconsistent sizes.");
    }
    for (let nameIndex = 0; nameIndex < nameLength; nameIndex += 1) {
      if (bytes[centralCursor + 46 + nameIndex] !== bytes[localOffset + 30 + nameIndex]) {
        invalid("An XLSX ZIP entry name does not match its local header.");
      }
    }
    assertNoZip64Extra(localOffset + 30 + localNameLength, localExtraLength);
    centralCursor = entryEnd;
  }
  if (centralCursor !== centralEnd) {
    invalid("The XLSX ZIP central directory has inconsistent dimensions.");
  }
}

function normalizeHeader(value: CellValue): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function comparableHeader(value: string): string {
  return value.toLocaleLowerCase("en");
}

function isEmptyCell(value: CellValue): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function ensureMatrixLimits(matrix: Matrix): void {
  if (matrix.length > IMPORT_LIMITS.maxRows + 1) {
    throw new FinancialFileError(
      "too_many_rows",
      `A file can contain at most ${IMPORT_LIMITS.maxRows.toLocaleString("en")} data rows.`,
    );
  }
  const widest = matrix.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (widest > IMPORT_LIMITS.maxColumns) {
    throw new FinancialFileError(
      "too_many_columns",
      `A file can contain at most ${IMPORT_LIMITS.maxColumns} columns.`,
    );
  }
  for (const row of matrix) {
    for (const cell of row) {
      if (typeof cell === "string" && cell.length > IMPORT_LIMITS.maxCellCharacters) {
        throw new FinancialFileError(
          "cell_too_large",
          `A cell exceeds the ${IMPORT_LIMITS.maxCellCharacters.toLocaleString("en")} character limit.`,
        );
      }
    }
  }
}

function delimiterScore(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(text: string): string {
  const firstRecord = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) =>
    delimiterScore(firstRecord, candidate) > delimiterScore(firstRecord, best) ? candidate : best,
  );
}

/** Small RFC 4180-style parser so CSV does not pull the XLSX bundle into the first load. */
export function parseCsvText(text: string): Matrix {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const rows: Matrix = [];
  let row: CellValue[] = [];
  let cell = "";
  let quoted = false;

  const pushCell = () => {
    if (cell.length > IMPORT_LIMITS.maxCellCharacters) {
      throw new FinancialFileError(
        "cell_too_large",
        `A cell exceeds the ${IMPORT_LIMITS.maxCellCharacters.toLocaleString("en")} character limit.`,
      );
    }
    row.push(cell);
    cell = "";
    if (row.length > IMPORT_LIMITS.maxColumns) {
      throw new FinancialFileError(
        "too_many_columns",
        `A file can contain at most ${IMPORT_LIMITS.maxColumns} columns.`,
      );
    }
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > IMPORT_LIMITS.maxRows + 1) {
      throw new FinancialFileError(
        "too_many_rows",
        `A file can contain at most ${IMPORT_LIMITS.maxRows.toLocaleString("en")} data rows.`,
      );
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === delimiter) pushCell();
    else if (character === "\n") pushRow();
    else if (character === "\r" && source[index + 1] === "\n") {
      // CR is consumed by the following LF.
    } else if (character === "\r") pushRow();
    else cell += character;
  }
  if (quoted) {
    throw new FinancialFileError("invalid_encoding", "The CSV contains an unclosed quoted value.");
  }
  if (cell.length > 0 || row.length > 0) pushRow();
  ensureMatrixLimits(rows);
  return rows;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function makeIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  const candidate = `${year}-${twoDigits(month)}-${twoDigits(day)}`;
  try {
    return assertIsoDate(candidate);
  } catch {
    return null;
  }
}

function parseDateCell(
  input: CellValue,
  excelDateDecoder?: XlsxDateDecoder,
): string | null {
  if (input instanceof Date && !Number.isNaN(input.valueOf())) {
    return makeIsoDate(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === "number" && excelDateDecoder) {
    const decoded = excelDateDecoder(input);
    return decoded ? makeIsoDate(decoded.y, decoded.m, decoded.d) : null;
  }
  if (typeof input !== "string") return null;
  const value = input.trim();
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return makeIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const yearFirst = value.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (yearFirst) {
    return makeIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }
  const dayFirst = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dayFirst) {
    return makeIsoDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }
  return null;
}

function tryParseMoney(value: CellValue): { ok: true; cents: number } | { ok: false } {
  if (isEmptyCell(value)) return { ok: true, cents: 0 };
  if (typeof value !== "string" && typeof value !== "number") return { ok: false };
  try {
    return { ok: true, cents: parseMoneyToCents(value) };
  } catch {
    return { ok: false };
  }
}

function looksLikeMoney(value: CellValue): boolean {
  if (typeof value === "number") return true;
  if (typeof value !== "string" || !/\d/.test(value)) return false;
  return /^[\s€$£()+\-0-9.,]+$/.test(value);
}

function uniqueCategoryId(name: string, used: Set<string>): string {
  const base = slugifyCategoryName(name);
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function portfolioTitle(fileName: string): string {
  const title = fileName.replace(/\.(xlsx|csv)$/i, "").trim();
  return title ? `${title} — imported` : "Imported portfolio";
}

function emptyPreview(
  fileName: string,
  fileType: FinancialFileKind,
  sheetName: string | null,
  availableSheets: string[],
): ImportPreview {
  return {
    fileName,
    fileType,
    sheetName,
    availableSheets,
    categories: [],
    snapshotCount: 0,
    totalRowCount: 0,
    skippedRowCount: 0,
    errors: [],
    warnings: [],
    duplicateDates: [],
    unknownColumns: [],
    ignoredColumns: [],
    rows: [],
    canImport: false,
  };
}

function matrixToImport(
  matrix: Matrix,
  context: {
    fileName: string;
    fileType: FinancialFileKind;
    sheetName: string | null;
    availableSheets: string[];
    excelDateDecoder?: XlsxDateDecoder;
  },
): FinancialImportResult {
  ensureMatrixLimits(matrix);
  const preview = emptyPreview(
    context.fileName,
    context.fileType,
    context.sheetName,
    context.availableSheets,
  );
  const headerRowIndex = matrix.findIndex((row) => row.some((cell) => !isEmptyCell(cell)));
  if (headerRowIndex < 0) {
    preview.errors.push({ code: "empty_sheet", message: "The selected sheet has no data." });
    return { preview, portfolio: null };
  }
  const headers = matrix[headerRowIndex].map(normalizeHeader);
  const comparable = headers.map(comparableHeader);
  const dateColumns = comparable.flatMap((header, index) => DATE_HEADERS.has(header) ? [index] : []);
  const noteColumns = comparable.flatMap((header, index) => NOTE_HEADERS.has(header) ? [index] : []);
  if (dateColumns.length !== 1) {
    preview.errors.push({
      code: dateColumns.length === 0 ? "missing_date_column" : "duplicate_date_column",
      message: dateColumns.length === 0
        ? 'Add one column named "Date".'
        : 'Keep a single column named "Date".',
    });
  }
  if (noteColumns.length > 1) {
    preview.errors.push({
      code: "duplicate_note_column",
      message: 'Keep at most one column named "Note".',
    });
  }

  const dataRows = matrix
    .slice(headerRowIndex + 1)
    .map((cells, offset) => ({ cells, sourceRow: headerRowIndex + offset + 2 }))
    .filter(({ cells }) => cells.some((cell) => !isEmptyCell(cell)));
  preview.totalRowCount = dataRows.length;

  const reservedColumns = new Set([...dateColumns, ...noteColumns]);
  const ignoredIndexes: number[] = [];
  const unknownIndexes: number[] = [];
  const categoryIndexes: number[] = [];
  const usedHeaders = new Set<string>();

  for (let index = 0; index < headers.length; index += 1) {
    if (reservedColumns.has(index)) continue;
    const header = headers[index];
    const normalized = comparable[index];
    if (!header) {
      unknownIndexes.push(index);
      preview.unknownColumns.push(`Column ${index + 1} (no heading)`);
      continue;
    }
    if (IGNORED_HEADERS.has(normalized)) {
      ignoredIndexes.push(index);
      preview.ignoredColumns.push(header);
      continue;
    }
    if (usedHeaders.has(normalized)) {
      unknownIndexes.push(index);
      preview.unknownColumns.push(header);
      preview.warnings.push({
        code: "duplicate_category_column",
        message: `The duplicate column “${header}” will be ignored.`,
        column: header,
      });
      continue;
    }
    const populated = dataRows.map(({ cells }) => cells[index]).filter((cell) => !isEmptyCell(cell));
    const numericValues = populated.filter((cell) => tryParseMoney(cell).ok).length;
    const moneyLikeValues = populated.filter(looksLikeMoney).length;
    if (
      header.length > 80 ||
      (populated.length > 0 && numericValues === 0 && moneyLikeValues === 0) ||
      populated.length === 0
    ) {
      unknownIndexes.push(index);
      preview.unknownColumns.push(header);
      preview.warnings.push({
        code: "unknown_column",
        message: `“${header}” does not look like a balance column and will be ignored.`,
        column: header,
      });
      continue;
    }
    usedHeaders.add(normalized);
    categoryIndexes.push(index);
  }
  void ignoredIndexes;
  void unknownIndexes;

  if (categoryIndexes.length === 0) {
    preview.errors.push({
      code: "missing_category_columns",
      message: "Add at least one category column containing balances.",
    });
  }
  if (categoryIndexes.length > 98) {
    preview.errors.push({
      code: "too_many_categories",
      message: "The file contains too many category columns.",
    });
  }

  const usedCategoryIds = new Set<string>();
  const timestamp = new Date().toISOString();
  const categories = categoryIndexes.map((index, position) => createWebCategory(headers[index], position, {
    id: uniqueCategoryId(headers[index], usedCategoryIds),
    timestamp,
  }));
  preview.categories = categories.map((category) => category.name);

  const validSnapshots: Snapshot[] = [];
  const dateCounts = new Map<string, number>();
  for (const { cells, sourceRow } of dataRows) {
    const rowErrors: string[] = [];
    const date = dateColumns.length === 1
      ? parseDateCell(cells[dateColumns[0]], context.excelDateDecoder)
      : null;
    if (!date) rowErrors.push("Invalid or missing date.");
    const noteValue = noteColumns.length === 1 ? cells[noteColumns[0]] : null;
    const note = isEmptyCell(noteValue) ? null : String(noteValue).trim();
    if (note && note.length > 500) rowErrors.push("The note is longer than 500 characters.");

    const valuesCents: Record<string, number | null> = {};
    const values = categories.map((category, categoryPosition) => {
      const columnIndex = categoryIndexes[categoryPosition];
      const parsed = tryParseMoney(cells[columnIndex]);
      valuesCents[category.name] = parsed.ok ? parsed.cents : null;
      if (!parsed.ok) rowErrors.push(`Invalid amount in “${category.name}”.`);
      return { categoryId: category.id, amountCents: parsed.ok ? parsed.cents : 0 };
    });
    const totalCents = values.reduce((sum, value) => sum + value.amountCents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents > MAX_MONEY_CENTS) {
      rowErrors.push("The snapshot total is outside Prumo's supported range.");
    }
    for (const message of rowErrors) {
      preview.errors.push({ code: "invalid_row", message, row: sourceRow });
    }
    const valid = rowErrors.length === 0 && Boolean(date) && categories.length > 0;
    preview.rows.push({
      sourceRow,
      date,
      valuesCents,
      totalCents: Number.isSafeInteger(totalCents) ? totalCents : null,
      note,
      valid,
      errors: rowErrors,
    });
    if (!valid || !date) continue;
    const recordedAt = `${date}T12:00:00.000Z`;
    validSnapshots.push({
      id: `import-${date}-${sourceRow}`,
      date,
      recordedAt,
      note,
      source: "import",
      revision: 1,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      values,
      totalCents,
    });
    dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
  }

  preview.duplicateDates = [...dateCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();
  for (const date of preview.duplicateDates) {
    preview.warnings.push({
      code: "duplicate_date",
      message: `More than one snapshot uses ${date}; all valid rows will be kept.`,
    });
  }
  preview.snapshotCount = validSnapshots.length;
  preview.skippedRowCount = dataRows.length - validSnapshots.length;
  preview.canImport = validSnapshots.length > 0 && categories.length > 0 && dateColumns.length === 1;

  if (!preview.canImport) return { preview, portfolio: null };
  const portfolio = normalizePortfolio({
    schemaVersion: WEB_PORTFOLIO_SCHEMA_VERSION,
    title: portfolioTitle(context.fileName),
    mode: "personal",
    categories,
    snapshots: validSnapshots,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { preview, portfolio };
}

async function parseCsv(bytes: Uint8Array, fileName: string): Promise<FinancialImportResult> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FinancialFileError(
      "invalid_encoding",
      "Save the CSV as UTF-8, then try again.",
    );
  }
  return matrixToImport(parseCsvText(text), {
    fileName,
    fileType: "csv",
    sheetName: null,
    availableSheets: [],
  });
}

async function parseXlsx(
  bytes: Uint8Array,
  fileName: string,
  requestedSheet?: string,
): Promise<FinancialImportResult> {
  assertSafeXlsxContainer(bytes);
  // Deliberately lazy: visitors exploring the landing or a CSV never download SheetJS.
  const XLSX = await import("xlsx");
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      raw: true,
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
      bookDeps: false,
      bookFiles: false,
      dense: true,
      sheetRows: IMPORT_LIMITS.maxRows + 2,
      WTF: false,
    });
  } catch {
    throw new FinancialFileError("invalid_workbook", "The XLSX workbook could not be read.");
  }
  if (workbook.SheetNames.length === 0) {
    throw new FinancialFileError("invalid_workbook", "The XLSX workbook has no sheets.");
  }
  if (workbook.SheetNames.length > IMPORT_LIMITS.maxSheets) {
    throw new FinancialFileError(
      "too_many_sheets",
      `A workbook can contain at most ${IMPORT_LIMITS.maxSheets} sheets.`,
    );
  }
  const sheetName = requestedSheet ?? workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return Boolean(sheet?.["!ref"]);
  }) ?? workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new FinancialFileError("sheet_not_found", "The selected sheet was not found.");
  }
  const sheet = workbook.Sheets[sheetName];
  const fullReference = sheet?.["!fullref"] ?? sheet?.["!ref"];
  if (fullReference) {
    let range: ReturnType<typeof XLSX.utils.decode_range>;
    try {
      range = XLSX.utils.decode_range(fullReference);
    } catch {
      throw new FinancialFileError("invalid_workbook", "The selected sheet has an invalid range.");
    }
    if (range.e.r - range.s.r > IMPORT_LIMITS.maxRows) {
      throw new FinancialFileError(
        "too_many_rows",
        `A sheet can contain at most ${IMPORT_LIMITS.maxRows.toLocaleString("en")} data rows.`,
      );
    }
    if (range.e.c - range.s.c + 1 > IMPORT_LIMITS.maxColumns) {
      throw new FinancialFileError(
        "too_many_columns",
        `A sheet can contain at most ${IMPORT_LIMITS.maxColumns} columns.`,
      );
    }
  }
  const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
    UTC: true,
  }) as Matrix;
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  return matrixToImport(matrix, {
    fileName,
    fileType: "xlsx",
    sheetName,
    availableSheets: [...workbook.SheetNames],
    excelDateDecoder: (serial) => XLSX.SSF.parse_date_code(serial, { date1904 }),
  });
}

/**
 * Reads the supplied File/Blob only in this JavaScript context. This module has
 * no fetch, XHR, form submission or server endpoint and never uploads bytes.
 */
export async function parseFinancialFile(
  file: FinancialFile,
  sheetName?: string,
): Promise<FinancialImportResult> {
  const kind = fileKindFromName(file.name);
  validateFileEnvelope(file, kind);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > IMPORT_LIMITS.maxFileBytes) {
    throw new FinancialFileError("file_too_large", "The file changed while it was being read.");
  }
  validateMagic(bytes, kind);
  return kind === "csv"
    ? parseCsv(bytes, file.name)
    : parseXlsx(bytes, file.name, sheetName);
}
