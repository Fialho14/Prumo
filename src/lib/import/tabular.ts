import { createHash } from "node:crypto";
import path from "node:path";
import * as XLSX from "xlsx";
import { FinanceError } from "@/lib/domain/errors";

export const IMPORT_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  xlsxUncompressedBytes: 100 * 1024 * 1024,
  xlsxEntryBytes: 50 * 1024 * 1024,
  xlsxEntries: 10_000,
  rows: 25_000,
  columns: 250,
  cells: 500_000,
  sheets: 100,
});

export type TabularCell = string | number | boolean | Date | null;

export type ParsedTabularFile = {
  fileName: string;
  fileSha256: string;
  fileSize: number;
  sheetName: string;
  sheetNames: string[];
  rows: TabularCell[][];
  date1904: boolean;
};

export type ImportFileInput = {
  data: Buffer | Uint8Array | ArrayBuffer;
  fileName: string;
  mimeType?: string;
};

function asBuffer(data: ImportFileInput["data"]): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function cleanFileName(value: string): string {
  const name = path.basename(value.replace(/[\0-\x1f\x7f]/g, "")).trim();
  if (!name || name.length > 255) {
    throw new FinanceError("invalid_import_file_name", "O nome do ficheiro não é válido.");
  }
  return name;
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new FinanceError(
      "invalid_csv_encoding",
      "O CSV tem de estar guardado em UTF-8.",
    );
  }
}

function delimiterFromHeader(text: string): ";" | "," | "\t" {
  const counts = new Map<";" | "," | "\t", number>([
    [";", 0],
    [",", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (character === "\r" || character === "\n")) break;
    if (!quoted && counts.has(character as ";" | "," | "\t")) {
      const delimiter = character as ";" | "," | "\t";
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }

  const priority: Array<";" | "\t" | ","> = [";", "\t", ","];
  return priority.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

function trimMatrix(rows: TabularCell[][]): TabularCell[][] {
  const normalized = rows.map((row) => {
    const copy = row.map((cell) => (cell === undefined ? null : cell));
    while (copy.length > 0 && (copy.at(-1) === null || copy.at(-1) === "")) copy.pop();
    return copy;
  });
  while (normalized.length > 0 && normalized.at(-1)?.length === 0) normalized.pop();
  return normalized;
}

function assertMatrixLimits(rows: TabularCell[][]) {
  if (rows.length > IMPORT_LIMITS.rows) {
    throw new FinanceError(
      "import_too_many_rows",
      `O ficheiro excede o limite de ${IMPORT_LIMITS.rows.toLocaleString("pt-PT")} linhas.`,
    );
  }
  let cells = 0;
  for (const row of rows) {
    if (row.length > IMPORT_LIMITS.columns) {
      throw new FinanceError(
        "import_too_many_columns",
        `O ficheiro excede o limite de ${IMPORT_LIMITS.columns} colunas.`,
      );
    }
    cells += row.length;
    if (cells > IMPORT_LIMITS.cells) {
      throw new FinanceError(
        "import_too_many_cells",
        `O ficheiro excede o limite de ${IMPORT_LIMITS.cells.toLocaleString("pt-PT")} células.`,
      );
    }
  }
}

function parseCsv(text: string): TabularCell[][] {
  if (text.includes("\0")) {
    throw new FinanceError("invalid_csv", "O CSV contém caracteres inválidos.");
  }
  const delimiter = delimiterFromHeader(text);
  const rows: TabularCell[][] = [];
  let row: TabularCell[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  let cellCount = 0;

  const pushField = () => {
    row.push(field);
    cellCount += 1;
    field = "";
    fieldStarted = false;
    if (row.length > IMPORT_LIMITS.columns) {
      throw new FinanceError(
        "import_too_many_columns",
        `O CSV excede o limite de ${IMPORT_LIMITS.columns} colunas.`,
      );
    }
    if (cellCount > IMPORT_LIMITS.cells) {
      throw new FinanceError(
        "import_too_many_cells",
        `O CSV excede o limite de ${IMPORT_LIMITS.cells.toLocaleString("pt-PT")} células.`,
      );
    }
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > IMPORT_LIMITS.rows) {
      throw new FinanceError(
        "import_too_many_rows",
        `O CSV excede o limite de ${IMPORT_LIMITS.rows.toLocaleString("pt-PT")} linhas.`,
      );
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      field += character;
      fieldStarted = true;
    }
  }
  if (quoted) throw new FinanceError("invalid_csv", "O CSV tem uma célula sem aspas de fecho.");
  if (field.length > 0 || row.length > 0 || fieldStarted) pushRow();

  const result = trimMatrix(rows);
  assertMatrixLimits(result);
  return result;
}

function rangeSize(reference: string | undefined): { rows: number; columns: number } | null {
  if (!reference) return null;
  try {
    const range = XLSX.utils.decode_range(reference);
    return {
      rows: range.e.r - range.s.r + 1,
      columns: range.e.c - range.s.c + 1,
    };
  } catch {
    throw new FinanceError("invalid_xlsx", "A folha de cálculo tem dimensões inválidas.");
  }
}

function assertSafeXlsxContainer(bytes: Buffer) {
  // XLSX é um ZIP. Validar o diretório central antes de o descomprimir limita
  // zip bombs e ficheiros encriptados sem depender de caminhos internos do pacote.
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const searchStart = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.length) {
    throw new FinanceError("invalid_xlsx", "O ficheiro XLSX não tem uma estrutura ZIP válida.");
  }
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entries !== entriesOnDisk ||
    entries === 0xffff ||
    entries > IMPORT_LIMITS.xlsxEntries ||
    centralOffset + centralSize > eocd
  ) {
    throw new FinanceError("invalid_xlsx", "O contentor XLSX excede os limites suportados.");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== centralSignature) {
      throw new FinanceError("invalid_xlsx", "O diretório do ficheiro XLSX está danificado.");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    if (
      (flags & 0x1) !== 0 ||
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      uncompressed > IMPORT_LIMITS.xlsxEntryBytes ||
      (compressed === 0 && uncompressed > 0) ||
      uncompressed > compressed * 200 + 1024 * 1024
    ) {
      throw new FinanceError(
        "unsafe_xlsx",
        "O ficheiro XLSX está encriptado ou excede os limites de descompressão.",
      );
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > IMPORT_LIMITS.xlsxUncompressedBytes) {
      throw new FinanceError("unsafe_xlsx", "O ficheiro XLSX é demasiado grande depois de descomprimido.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset > centralOffset + centralSize) {
    throw new FinanceError("invalid_xlsx", "O diretório do ficheiro XLSX tem dimensões inválidas.");
  }
}

function parseXlsx(bytes: Buffer, requestedSheet?: string) {
  assertSafeXlsxContainer(bytes);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "buffer",
      dense: true,
      raw: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellText: false,
      bookDeps: false,
      bookFiles: false,
      sheetRows: IMPORT_LIMITS.rows + 1,
    });
  } catch {
    throw new FinanceError(
      "invalid_xlsx",
      "Não foi possível ler o ficheiro XLSX. Confirma que não está protegido por password.",
    );
  }

  if (workbook.SheetNames.length === 0 || workbook.SheetNames.length > IMPORT_LIMITS.sheets) {
    throw new FinanceError("invalid_xlsx", "O livro não contém um conjunto válido de folhas.");
  }
  if (requestedSheet && !workbook.SheetNames.includes(requestedSheet)) {
    throw new FinanceError("sheet_not_found", "A folha selecionada já não existe no ficheiro.", 409);
  }

  const sheetName =
    requestedSheet ??
    workbook.SheetNames.find((name) => Boolean(workbook.Sheets[name]?.["!ref"])) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const fullReference = (sheet as XLSX.WorkSheet & { "!fullref"?: string })["!fullref"];
  const dimensions = rangeSize(fullReference ?? sheet["!ref"]);
  if (dimensions && dimensions.rows > IMPORT_LIMITS.rows) {
    throw new FinanceError(
      "import_too_many_rows",
      `A folha excede o limite de ${IMPORT_LIMITS.rows.toLocaleString("pt-PT")} linhas.`,
    );
  }
  if (dimensions && dimensions.columns > IMPORT_LIMITS.columns) {
    throw new FinanceError(
      "import_too_many_columns",
      `A folha excede o limite de ${IMPORT_LIMITS.columns} colunas.`,
    );
  }
  if (dimensions && dimensions.rows * dimensions.columns > IMPORT_LIMITS.cells) {
    throw new FinanceError(
      "import_too_many_cells",
      `A folha excede o limite de ${IMPORT_LIMITS.cells.toLocaleString("pt-PT")} células.`,
    );
  }

  let rows: TabularCell[][];
  try {
    rows = XLSX.utils.sheet_to_json<TabularCell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
      UTC: true,
    });
  } catch {
    throw new FinanceError("invalid_xlsx", "Não foi possível ler as células da folha selecionada.");
  }
  rows = trimMatrix(rows);
  assertMatrixLimits(rows);
  return {
    rows,
    sheetName,
    sheetNames: workbook.SheetNames,
    date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
  };
}

export function parseTabularFile(
  input: ImportFileInput,
  options: { sheetName?: string } = {},
): ParsedTabularFile {
  const bytes = asBuffer(input.data);
  if (bytes.byteLength === 0) throw new FinanceError("empty_import_file", "O ficheiro está vazio.");
  if (bytes.byteLength > IMPORT_LIMITS.fileBytes) {
    throw new FinanceError(
      "import_file_too_large",
      `O ficheiro excede o limite de ${IMPORT_LIMITS.fileBytes / 1024 / 1024} MB.`,
      413,
    );
  }

  const fileName = cleanFileName(input.fileName);
  const extension = path.extname(fileName).toLocaleLowerCase("pt-PT");
  const isCsv = extension === ".csv" || input.mimeType?.toLocaleLowerCase().includes("csv");
  const isXlsx =
    extension === ".xlsx" ||
    input.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!isCsv && !isXlsx) {
    throw new FinanceError("unsupported_import_file", "Escolhe um ficheiro CSV ou XLSX.");
  }

  const parsed = isCsv
    ? {
        rows: parseCsv(decodeUtf8(bytes)),
        sheetName: "CSV",
        sheetNames: ["CSV"],
        date1904: false,
      }
    : parseXlsx(bytes, options.sheetName);
  if (parsed.rows.length === 0) {
    throw new FinanceError("empty_import_sheet", "A folha selecionada não contém dados.");
  }

  return {
    ...parsed,
    fileName,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    fileSize: bytes.byteLength,
  };
}

const PORTUGUESE_MONTHS = new Map<string, number>([
  ["jan", 1],
  ["janeiro", 1],
  ["fev", 2],
  ["fevereiro", 2],
  ["mar", 3],
  ["marco", 3],
  ["abr", 4],
  ["abril", 4],
  ["mai", 5],
  ["maio", 5],
  ["jun", 6],
  ["junho", 6],
  ["jul", 7],
  ["julho", 7],
  ["ago", 8],
  ["agosto", 8],
  ["set", 9],
  ["setembro", 9],
  ["out", 10],
  ["outubro", 10],
  ["nov", 11],
  ["novembro", 11],
  ["dez", 12],
  ["dezembro", 12],
]);

function isoDate(year: number, month: number, day: number): string {
  if (year >= 0 && year < 100) year += year <= 69 ? 2000 : 1900;
  if (year < 1900 || year > 9999) throw new Error("date range");
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("invalid date");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function excelSerialToDate(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial) || serial < 0) throw new Error("invalid serial");
  const days = Math.floor(serial);
  if (!date1904 && days === 60) throw new Error("Excel leap-year bug");
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const adjustedDays = !date1904 && days > 60 ? days - 1 : days;
  const date = new Date(epoch + adjustedDays * 86_400_000);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function parseImportDate(value: TabularCell, date1904 = false): string {
  try {
    if (value instanceof Date) {
      return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    if (typeof value === "number") return excelSerialToDate(value, date1904);
    if (typeof value !== "string") throw new Error("unsupported date");
    const text = value.trim();
    if (!text) throw new Error("empty date");

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
    if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    const portuguese = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:[T\s].*)?$/.exec(text);
    if (portuguese) {
      return isoDate(Number(portuguese[3]), Number(portuguese[2]), Number(portuguese[1]));
    }

    const yearFirst = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:[T\s].*)?$/.exec(text);
    if (yearFirst) return isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

    const named = /^(\d{1,2})\s+([\p{L}.]+)\s+(\d{2}|\d{4})$/u.exec(text);
    if (named) {
      const key = named[2]
        .replace(/\.$/, "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("pt-PT");
      const month = PORTUGUESE_MONTHS.get(key);
      if (!month) throw new Error("unknown month");
      return isoDate(Number(named[3]), month, Number(named[1]));
    }

    if (/^\d+(?:[.,]\d+)?$/.test(text)) {
      return excelSerialToDate(Number(text.replace(",", ".")), date1904);
    }
    throw new Error("unrecognized date");
  } catch {
    throw new FinanceError(
      "invalid_import_date",
      "Data inválida. Usa uma data Excel ou o formato DD/MM/AAAA.",
    );
  }
}
