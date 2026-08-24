import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  FinancialFileError,
  IMPORT_LIMITS,
  parseCsvText,
  parseFinancialFile,
  type FinancialFile,
} from "./import";

function namedBlob(
  content: BlobPart | BlobPart[],
  name: string,
  type: string,
): FinancialFile {
  const parts = Array.isArray(content) ? content : [content];
  return Object.assign(new Blob(parts, { type }), { name });
}

function firstSignature(bytes: Uint8Array, signature: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error("ZIP signature not found in test fixture.");
}

function minimalWorkbookBytes(): Uint8Array<ArrayBuffer> {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Date", "Everyday"],
    ["2025-01-01", 1200],
  ]), "Snapshots");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CSV import", () => {
  it("previews categories, ignored columns, unknown columns and valid snapshots", async () => {
    const csv = [
      "Date,Everyday,Savings,Note,Total,Label",
      '2025-01-01,"1,200.50",4000,Opening snapshot,5200.50,example',
      '2025-02-01,1300,4250,"A note, with a comma",5550,example',
    ].join("\r\n");
    const result = await parseFinancialFile(namedBlob(csv, "my-prumo.csv", "text/csv"));

    expect(result.preview).toMatchObject({
      categories: ["Everyday", "Savings"],
      snapshotCount: 2,
      totalRowCount: 2,
      skippedRowCount: 0,
      ignoredColumns: ["Total"],
      unknownColumns: ["Label"],
      canImport: true,
    });
    expect(result.preview.rows[0]).toMatchObject({
      date: "2025-01-01",
      totalCents: 520_050,
      valid: true,
    });
    expect(result.portfolio?.snapshots[1].note).toBe("A note, with a comma");
  });

  it("supports semicolon-delimited UTF-8 and reports duplicate and invalid rows", async () => {
    const csv = [
      "Date;Everyday;Savings;Note",
      '01/01/2025;"1.200,50";4000;First',
      '01/01/2025;1250;4100;Duplicate date',
      "2025-02-30;1300;4200;Impossible date",
      "2025-03-01;-20;4300;Negative amount",
    ].join("\n");
    const result = await parseFinancialFile(namedBlob(csv, "snapshots.csv", "text/plain"));

    expect(result.preview.duplicateDates).toEqual(["2025-01-01"]);
    expect(result.preview.snapshotCount).toBe(2);
    expect(result.preview.skippedRowCount).toBe(2);
    expect(result.preview.errors.some((issue) => issue.row === 4)).toBe(true);
    expect(result.preview.errors.some((issue) => issue.row === 5)).toBe(true);
    expect(result.portfolio?.snapshots).toHaveLength(2);
  });

  it("parses escaped quotes and newlines without SheetJS", () => {
    expect(parseCsvText('Date,Note\n2025-01-01,"Line one\nLine ""two"""')).toEqual([
      ["Date", "Note"],
      ["2025-01-01", 'Line one\nLine "two"'],
    ]);
  });
});

describe("XLSX import", () => {
  it("reads a selected workbook sheet locally", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Read me"], ["Fictitious"]]), "About");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "Everyday", "Investments", "Note"],
      ["2025-01-01", 1200.25, 7500, "Opening"],
      ["2025-02-01", 1300, 7700.5, "Updated"],
    ]), "Snapshots");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = namedBlob(
      bytes,
      "prumo.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const result = await parseFinancialFile(file, "Snapshots");

    expect(result.preview.availableSheets).toEqual(["About", "Snapshots"]);
    expect(result.preview.sheetName).toBe("Snapshots");
    expect(result.preview.snapshotCount).toBe(2);
    expect(result.portfolio?.snapshots[0].totalCents).toBe(870_025);
  });

  it("does not use fetch or XMLHttpRequest for CSV or XLSX bytes", async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", class {
      constructor() {
        xhrSpy();
      }
    });

    await parseFinancialFile(namedBlob(
      "Date,Everyday\n2025-01-01,1200",
      "local.csv",
      "text/csv",
    ));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "Everyday"],
      ["2025-01-01", 1200],
    ]), "Snapshots");
    await parseFinancialFile(namedBlob(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
      "local.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it("rejects a truncated ZIP before SheetJS can decompress it", async () => {
    const truncated = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    await expect(parseFinancialFile(namedBlob(
      truncated,
      "truncated.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ))).rejects.toMatchObject({ code: "invalid_workbook" });
  });

  it.each([
    ["encrypted", (view: DataView, central: number) => {
      view.setUint16(central + 8, view.getUint16(central + 8, true) | 0x1, true);
    }],
    ["ZIP64", (view: DataView, central: number) => {
      view.setUint32(central + 24, 0xffffffff, true);
    }],
    ["suspicious compression ratio", (view: DataView, central: number) => {
      view.setUint32(central + 20, 1, true);
      view.setUint32(central + 24, 10 * 1024 * 1024, true);
    }],
  ])("rejects an unsafe %s workbook before parsing", async (_label, mutate) => {
    const bytes = minimalWorkbookBytes();
    const central = firstSignature(bytes, 0x02014b50);
    mutate(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), central);
    await expect(parseFinancialFile(namedBlob(
      bytes,
      "unsafe.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ))).rejects.toMatchObject({ code: "unsafe_workbook" });
  });

  it("rejects a central-directory entry with an invalid local offset", async () => {
    const bytes = minimalWorkbookBytes();
    const central = firstSignature(bytes, 0x02014b50);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      .setUint32(central + 42, bytes.byteLength - 1, true);
    await expect(parseFinancialFile(namedBlob(
      bytes,
      "bad-offset.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ))).rejects.toMatchObject({ code: "invalid_workbook" });
  });
});

describe("file-boundary validation", () => {
  it.each([
    ["data.txt", "text/plain", "Date,Everyday\n2025-01-01,1", "unsupported_extension"],
    ["data.csv", "image/png", "Date,Everyday\n2025-01-01,1", "mime_mismatch"],
    ["data.xlsx", "application/octet-stream", "not a zip", "invalid_signature"],
  ])("rejects %s with %s", async (name, type, content, code) => {
    await expect(parseFinancialFile(namedBlob(content, name, type))).rejects.toMatchObject({ code });
  });

  it("rejects a file before reading when its declared size exceeds 10 MB", async () => {
    let read = false;
    const file: FinancialFile = {
      name: "large.csv",
      type: "text/csv",
      size: IMPORT_LIMITS.maxFileBytes + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    };
    await expect(parseFinancialFile(file)).rejects.toMatchObject({ code: "file_too_large" });
    expect(read).toBe(false);
  });

  it("rejects invalid UTF-8 and excessive rows", async () => {
    await expect(parseFinancialFile(namedBlob(
      new Uint8Array([0xc3, 0x28]),
      "bad.csv",
      "text/csv",
    ))).rejects.toMatchObject({ code: "invalid_encoding" });

    const tooManyRows = [
      "Date,Everyday",
      ...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, index) =>
        `2025-01-01,${index}`),
    ].join("\n");
    await expect(parseFinancialFile(namedBlob(
      tooManyRows,
      "large.csv",
      "text/csv",
    ))).rejects.toBeInstanceOf(FinancialFileError);
    await expect(parseFinancialFile(namedBlob(
      tooManyRows,
      "large.csv",
      "text/csv",
    ))).rejects.toMatchObject({ code: "too_many_rows" });
  });
});
