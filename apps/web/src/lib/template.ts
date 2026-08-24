import type { Category, Snapshot } from "@/lib/domain/types";
import {
  WEB_PORTFOLIO_SCHEMA_VERSION,
  createWebCategory,
  normalizePortfolio,
  type WebPortfolio,
} from "./data-model";

const TEMPLATE_TIMESTAMP = "2025-01-01T12:00:00.000Z";

const TEMPLATE_CATEGORIES: Category[] = [
  createWebCategory("Everyday", 0, {
    id: "everyday",
    type: "available",
    timestamp: TEMPLATE_TIMESTAMP,
  }),
  createWebCategory("Savings", 1, {
    id: "savings",
    type: "savings",
    timestamp: TEMPLATE_TIMESTAMP,
  }),
  createWebCategory("Investments", 2, {
    id: "investments",
    type: "investment",
    timestamp: TEMPLATE_TIMESTAMP,
  }),
  createWebCategory("Emergency Fund", 3, {
    id: "emergency-fund",
    type: "reserved",
    timestamp: TEMPLATE_TIMESTAMP,
  }),
  createWebCategory("Other", 4, {
    id: "other",
    type: "other",
    timestamp: TEMPLATE_TIMESTAMP,
  }),
];

const TEMPLATE_ROWS = [
  ["2025-01-01", [1_250, 4_000, 7_500, 3_000, 500], "Example row — replace these fictitious values."],
  ["2025-02-01", [1_400, 4_250, 7_800, 3_100, 500], "Add one row whenever you want a new snapshot."],
  ["2025-03-01", [1_300, 4_500, 8_050, 3_200, 450], "Notes are optional."],
] as const;

function templateSnapshot(row: (typeof TEMPLATE_ROWS)[number], index: number): Snapshot {
  const [date, amounts, note] = row;
  const values = TEMPLATE_CATEGORIES.map((category, categoryIndex) => ({
    categoryId: category.id,
    amountCents: amounts[categoryIndex] * 100,
  }));
  const timestamp = `${date}T12:00:00.000Z`;
  return {
    id: `template-snapshot-${index + 1}`,
    date,
    recordedAt: timestamp,
    note,
    source: "import",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    values,
    totalCents: values.reduce((sum, value) => sum + value.amountCents, 0),
  };
}

/** The workbook template intentionally contains only Date, category and Note columns. */
export const TEMPLATE_PORTFOLIO: WebPortfolio = normalizePortfolio({
  schemaVersion: WEB_PORTFOLIO_SCHEMA_VERSION,
  title: "Prumo template — fictitious example data",
  mode: "template",
  categories: TEMPLATE_CATEGORIES,
  snapshots: TEMPLATE_ROWS.map(templateSnapshot),
  createdAt: TEMPLATE_TIMESTAMP,
  updatedAt: "2025-03-01T12:00:00.000Z",
});

export function createTemplatePortfolio(): WebPortfolio {
  return structuredClone(TEMPLATE_PORTFOLIO);
}
