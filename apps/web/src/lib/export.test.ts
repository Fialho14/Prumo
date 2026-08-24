import { describe, expect, it } from "vitest";
import { createDemoPortfolio } from "./demo";
import {
  exportPortfolioCsv,
  exportPortfolioJson,
  exportPortfolioXlsx,
  portfolioExportFilename,
  serializePortfolioCsv,
  triggerDownload,
} from "./export";
import { parseFinancialFile, type FinancialFile } from "./import";

function asFile(blob: Blob, name: string): FinancialFile {
  return Object.assign(blob, { name });
}

describe("portable exports", () => {
  it("exports complete JSON and readable CSV", async () => {
    const portfolio = createDemoPortfolio();
    const json = JSON.parse(await exportPortfolioJson(portfolio).text());
    expect(json.schemaVersion).toBe(1);
    expect(json.categories).toHaveLength(portfolio.categories.length);
    expect(json.snapshots).toHaveLength(portfolio.snapshots.length);

    const csv = serializePortfolioCsv(portfolio);
    expect(csv).toContain("Date,Everyday,Emergency Fund,Savings,Investments,Other,Note");
    const reimported = await parseFinancialFile(asFile(exportPortfolioCsv(portfolio), "export.csv"));
    expect(reimported.preview.snapshotCount).toBe(portfolio.snapshots.length);
    expect(reimported.portfolio?.snapshots.at(-1)?.totalCents)
      .toBe(portfolio.snapshots.at(-1)?.totalCents);
  });

  it("exports an XLSX that the same local parser can read", async () => {
    const portfolio = createDemoPortfolio();
    const blob = await exportPortfolioXlsx(portfolio);
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    const reimported = await parseFinancialFile(asFile(blob, "export.xlsx"));
    expect(reimported.preview.categories).toEqual(portfolio.categories.map((category) => category.name));
    expect(reimported.preview.snapshotCount).toBe(portfolio.snapshots.length);
  });

  it("guards CSV cells against spreadsheet formulas", () => {
    const portfolio = createDemoPortfolio();
    portfolio.snapshots[0].note = "=1+1";
    expect(serializePortfolioCsv(portfolio)).toContain("'=1+1");
  });

  it("creates safe filenames and keeps downloads browser-only", () => {
    const portfolio = createDemoPortfolio();
    expect(portfolioExportFilename(portfolio, "xlsx")).toBe("prumo-demo.xlsx");
    expect(() => triggerDownload(new Blob(["x"]), "x.txt")).toThrow(/browser/i);
  });
});

