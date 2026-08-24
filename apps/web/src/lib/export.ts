import { normalizePortfolio, slugifyCategoryName, type WebPortfolio } from "./data-model";

export type PortfolioExportFormat = "xlsx" | "csv" | "json";

function sanitizeSpreadsheetText(value: string): string {
  // Prevent a user-controlled category/note from becoming a formula when a CSV
  // or workbook is opened in spreadsheet software.
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number): string {
  const text = sanitizeSpreadsheetText(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportRows(portfolio: WebPortfolio): Array<Array<string | number>> {
  const normalized = normalizePortfolio(portfolio);
  const header = [
    "Date",
    ...normalized.categories.map((category) => sanitizeSpreadsheetText(category.name)),
    "Note",
  ];
  const rows = normalized.snapshots.map((snapshot) => {
    const amounts = new Map(snapshot.values.map((value) => [value.categoryId, value.amountCents]));
    return [
      snapshot.date,
      ...normalized.categories.map((category) => (amounts.get(category.id) ?? 0) / 100),
      sanitizeSpreadsheetText(snapshot.note ?? ""),
    ];
  });
  return [header, ...rows];
}

export function serializePortfolioCsv(portfolio: WebPortfolio): string {
  const rows = exportRows(portfolio);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function exportPortfolioCsv(portfolio: WebPortfolio): Blob {
  return new Blob([serializePortfolioCsv(portfolio)], {
    type: "text/csv;charset=utf-8",
  });
}

export function serializePortfolioJson(portfolio: WebPortfolio): string {
  return `${JSON.stringify(normalizePortfolio(portfolio), null, 2)}\n`;
}

export function exportPortfolioJson(portfolio: WebPortfolio): Blob {
  return new Blob([serializePortfolioJson(portfolio)], {
    type: "application/json;charset=utf-8",
  });
}

/** Lazy-loads SheetJS only when the user explicitly asks for an XLSX export. */
export async function exportPortfolioXlsx(portfolio: WebPortfolio): Promise<Blob> {
  const XLSX = await import("xlsx");
  const rows = exportRows(portfolio);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    ...normalizePortfolio(portfolio).categories.map((category) => ({
      wch: Math.max(12, Math.min(28, category.name.length + 2)),
    })),
    { wch: 48 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Snapshots");
  workbook.Props = {
    Title: "Prumo snapshots",
    Subject: "Portable net worth snapshots",
    Author: "Prumo",
    Comments: "Exported locally in the browser.",
  };
  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  });
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function portfolioExportFilename(
  portfolio: WebPortfolio,
  format: PortfolioExportFormat,
): string {
  const base = slugifyCategoryName(portfolio.title.replace(/\s+[—-]\s+(imported|fictitious.*)$/i, ""));
  return `${base || "prumo"}.${format}`;
}

/** Browser-only download helper. Object URLs are revoked immediately after use. */
export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Downloads are only available in a browser.");
  }
  const safeFilename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 180) || "prumo-data";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename;
  anchor.rel = "noopener";
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
