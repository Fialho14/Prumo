import type { Category, Snapshot } from "@/lib/domain/types";
import {
  WEB_PORTFOLIO_SCHEMA_VERSION,
  createWebCategory,
  normalizePortfolio,
  type WebPortfolio,
} from "./data-model";

const DEMO_TIMESTAMP = "2026-01-01T12:00:00.000Z";

const DEMO_CATEGORIES: Category[] = [
  createWebCategory("Everyday", 0, {
    id: "demo-everyday",
    type: "available",
    timestamp: DEMO_TIMESTAMP,
  }),
  createWebCategory("Emergency Fund", 1, {
    id: "demo-emergency-fund",
    type: "reserved",
    timestamp: DEMO_TIMESTAMP,
  }),
  createWebCategory("Savings", 2, {
    id: "demo-savings",
    type: "savings",
    timestamp: DEMO_TIMESTAMP,
  }),
  createWebCategory("Investments", 3, {
    id: "demo-investments",
    type: "investment",
    timestamp: DEMO_TIMESTAMP,
  }),
  createWebCategory("Other", 4, {
    id: "demo-other",
    type: "other",
    timestamp: DEMO_TIMESTAMP,
  }),
];

type DemoRow = readonly [
  date: string,
  everydayEuros: number,
  emergencyEuros: number,
  savingsEuros: number,
  investmentsEuros: number,
  otherEuros: number,
  note: string | null,
];

const DEMO_ROWS: readonly DemoRow[] = [
  ["2025-01-01", 2_400, 6_200, 8_900, 16_000, 1_100, "A simple baseline for the year."],
  ["2025-02-01", 2_250, 6_300, 9_300, 16_500, 1_100, null],
  ["2025-03-01", 2_800, 6_400, 9_500, 15_800, 1_100, "Markets dipped; the snapshot stays honest."],
  ["2025-04-01", 1_500, 6_400, 9_700, 15_300, 1_000, "Yearly insurance payment."],
  ["2025-05-01", 2_100, 6_700, 10_000, 16_100, 1_000, null],
  ["2025-06-01", 2_350, 7_000, 10_400, 16_900, 1_000, "Emergency-fund target reached."],
  ["2025-07-01", 2_050, 7_000, 10_900, 17_650, 950, null],
  ["2025-08-01", 1_900, 7_000, 11_150, 17_100, 950, "Summer costs made this month flatter."],
  ["2025-09-01", 2_300, 7_000, 11_500, 18_400, 950, null],
  ["2025-10-01", 2_550, 7_000, 11_900, 19_250, 900, "Moved a little more into investments."],
  ["2025-11-01", 2_200, 7_000, 12_300, 18_700, 900, "A small market pullback."],
  ["2025-12-01", 2_750, 7_000, 12_800, 20_100, 900, "End-of-year snapshot."],
];

function demoSnapshot(row: DemoRow, index: number): Snapshot {
  const [date, ...rest] = row;
  const amounts = rest.slice(0, 5) as number[];
  const note = rest[5] as string | null;
  const values = DEMO_CATEGORIES.map((category, categoryIndex) => ({
    categoryId: category.id,
    amountCents: amounts[categoryIndex] * 100,
  }));
  const timestamp = `${date}T12:00:00.000Z`;
  return {
    id: `demo-snapshot-${String(index + 1).padStart(2, "0")}`,
    date,
    recordedAt: timestamp,
    note,
    source: "demo",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    values,
    totalCents: values.reduce((sum, value) => sum + value.amountCents, 0),
  };
}

/** Clearly labelled, deterministic and entirely fictitious public demo data. */
export const DEMO_PORTFOLIO: WebPortfolio = normalizePortfolio({
  schemaVersion: WEB_PORTFOLIO_SCHEMA_VERSION,
  title: "Prumo demo — fictitious data",
  mode: "demo",
  categories: DEMO_CATEGORIES,
  snapshots: DEMO_ROWS.map(demoSnapshot),
  createdAt: DEMO_TIMESTAMP,
  updatedAt: "2025-12-01T12:00:00.000Z",
});

export function createDemoPortfolio(): WebPortfolio {
  return structuredClone(DEMO_PORTFOLIO);
}

