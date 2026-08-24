import { assertIsoDate } from "@/lib/domain/dates";
import { MAX_MONEY_CENTS, assertValidCents } from "@/lib/domain/money";
import {
  CATEGORY_TYPES,
  type Category,
  type CategoryType,
  type DashboardData,
  type Snapshot,
  type SnapshotValue,
} from "@/lib/domain/types";

export const WEB_PORTFOLIO_SCHEMA_VERSION = 1 as const;
export const MAX_WEB_CATEGORIES = 100;
export const MAX_WEB_SNAPSHOTS = 5_000;

export type PortfolioMode = "personal" | "demo" | "template";
export type WebCategory = Category;
export type WebSnapshot = Snapshot;

/**
 * The complete, portable document used by Prumo Web. It contains no storage
 * handles or server identifiers, so the same object can be exported as JSON.
 */
export type WebPortfolio = {
  schemaVersion: typeof WEB_PORTFOLIO_SCHEMA_VERSION;
  title: string;
  mode: PortfolioMode;
  categories: Category[];
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
};

export type RecordSnapshotInput = {
  id?: string;
  date: string;
  note?: string | null;
  amountsCents: Record<string, number>;
  source?: Snapshot["source"];
  recordedAt?: string;
};

const CATEGORY_COLORS = [
  "#0F766E",
  "#2563EB",
  "#7C3AED",
  "#B45309",
  "#BE123C",
  "#0369A1",
  "#4D7C0F",
  "#A21CAF",
] as const;

const ICON_BY_TYPE: Record<CategoryType, string> = {
  available: "wallet",
  reserved: "shield",
  investment: "chart",
  asset: "home",
  savings: "piggy-bank",
  other: "coins",
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function slugifyCategoryName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "category";
}

export function inferCategoryType(name: string): CategoryType {
  const normalized = name.normalize("NFKD").toLocaleLowerCase("en");
  if (/invest|index|fund|stock|share|etf|crypto/.test(normalized)) return "investment";
  if (/emergency|reserve|reserved/.test(normalized)) return "reserved";
  if (/saving|deposit|poupan|objetivo|goal/.test(normalized)) return "savings";
  if (/home|house|property|car|asset|imovel|imóvel/.test(normalized)) return "asset";
  if (/everyday|current|checking|cash|wallet|available|corrente/.test(normalized)) {
    return "available";
  }
  return "other";
}

export function createWebCategory(
  name: string,
  position: number,
  options: Partial<Pick<Category, "id" | "type" | "color" | "icon">> & {
    timestamp?: string;
  } = {},
): Category {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) {
    throw new Error("Category names must contain between 1 and 80 characters.");
  }
  const timestamp = options.timestamp ?? nowIso();
  const type = options.type ?? inferCategoryType(cleanName);
  return {
    id: options.id ?? slugifyCategoryName(cleanName),
    name: cleanName,
    type,
    color: options.color ?? CATEGORY_COLORS[position % CATEGORY_COLORS.length],
    icon: options.icon ?? ICON_BY_TYPE[type],
    position,
    archivedAt: null,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyPortfolio(
  options: Partial<Pick<WebPortfolio, "title" | "mode" | "createdAt" | "updatedAt">> = {},
): WebPortfolio {
  const timestamp = options.createdAt ?? nowIso();
  return {
    schemaVersion: WEB_PORTFOLIO_SCHEMA_VERSION,
    title: options.title?.trim() || "My Prumo",
    mode: options.mode ?? "personal",
    categories: [],
    snapshots: [],
    createdAt: timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

function sumValues(values: SnapshotValue[]): number {
  const total = values.reduce((sum, value) => sum + assertValidCents(value.amountCents), 0);
  if (!Number.isSafeInteger(total) || total > MAX_MONEY_CENTS) {
    throw new Error("The snapshot total is outside Prumo's supported range.");
  }
  return total;
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label} is invalid.`);
  }
}

function normalizedValues(
  categories: Category[],
  amountsCents: Record<string, number>,
): SnapshotValue[] {
  const knownIds = new Set(categories.map((category) => category.id));
  const unknownId = Object.keys(amountsCents).find((id) => !knownIds.has(id));
  if (unknownId) throw new Error(`Unknown category: ${unknownId}`);
  return categories.map((category) => ({
    categoryId: category.id,
    amountCents: assertValidCents(amountsCents[category.id] ?? 0),
  }));
}

export function recordSnapshot(
  portfolio: WebPortfolio,
  input: RecordSnapshotInput,
): WebPortfolio {
  const date = assertIsoDate(input.date);
  const timestamp = input.recordedAt ?? nowIso();
  const values = normalizedValues(portfolio.categories, input.amountsCents);
  const snapshot: Snapshot = {
    id: input.id ?? createId("snapshot"),
    date,
    recordedAt: timestamp,
    note: input.note?.trim().slice(0, 500) || null,
    source: input.source ?? "manual",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    values,
    totalCents: sumValues(values),
  };
  return normalizePortfolio({
    ...portfolio,
    mode: portfolio.mode === "template" ? "personal" : portfolio.mode,
    snapshots: [...portfolio.snapshots, snapshot],
    updatedAt: timestamp,
  });
}

export function updateSnapshot(
  portfolio: WebPortfolio,
  snapshotId: string,
  input: Omit<RecordSnapshotInput, "id" | "source" | "recordedAt">,
): WebPortfolio {
  let found = false;
  const timestamp = nowIso();
  const values = normalizedValues(portfolio.categories, input.amountsCents);
  const snapshots = portfolio.snapshots.map((snapshot) => {
    if (snapshot.id !== snapshotId) return snapshot;
    found = true;
    return {
      ...snapshot,
      date: assertIsoDate(input.date),
      note: input.note?.trim().slice(0, 500) || null,
      values,
      totalCents: sumValues(values),
      revision: snapshot.revision + 1,
      updatedAt: timestamp,
    };
  });
  if (!found) throw new Error("Snapshot not found.");
  return normalizePortfolio({ ...portfolio, snapshots, updatedAt: timestamp });
}

export function removeSnapshot(portfolio: WebPortfolio, snapshotId: string): WebPortfolio {
  const snapshots = portfolio.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  if (snapshots.length === portfolio.snapshots.length) throw new Error("Snapshot not found.");
  return { ...portfolio, snapshots, updatedAt: nowIso() };
}

export function normalizePortfolio(portfolio: WebPortfolio): WebPortfolio {
  if (portfolio.schemaVersion !== WEB_PORTFOLIO_SCHEMA_VERSION) {
    throw new Error("Unsupported Prumo Web data version.");
  }
  if (typeof portfolio.title !== "string" || !portfolio.title.trim() || portfolio.title.length > 120) {
    throw new Error("The portfolio title is invalid.");
  }
  if (!["personal", "demo", "template"].includes(portfolio.mode)) {
    throw new Error("The portfolio mode is invalid.");
  }
  assertTimestamp(portfolio.createdAt, "The portfolio creation time");
  assertTimestamp(portfolio.updatedAt, "The portfolio update time");
  if (!Array.isArray(portfolio.categories) || !Array.isArray(portfolio.snapshots)) {
    throw new Error("The portfolio must contain category and snapshot lists.");
  }
  if (portfolio.categories.length > MAX_WEB_CATEGORIES) {
    throw new Error(`A portfolio can contain at most ${MAX_WEB_CATEGORIES} categories.`);
  }
  if (portfolio.snapshots.length > MAX_WEB_SNAPSHOTS) {
    throw new Error(`A portfolio can contain at most ${MAX_WEB_SNAPSHOTS} snapshots.`);
  }

  const categoryIds = new Set<string>();
  const categories = [...portfolio.categories]
    .sort((a, b) => a.position - b.position)
    .map((category, position) => {
      if (
        !category ||
        typeof category !== "object" ||
        typeof category.id !== "string" ||
        !category.id ||
        category.id.length > 100 ||
        categoryIds.has(category.id)
      ) {
        throw new Error("Category IDs must be valid and unique.");
      }
      if (
        typeof category.name !== "string" ||
        !category.name.trim() ||
        category.name.length > 80
      ) {
        throw new Error("A category name is invalid.");
      }
      if (!CATEGORY_TYPES.includes(category.type)) throw new Error("A category type is invalid.");
      if (typeof category.color !== "string" || !/^#[0-9a-f]{6}$/i.test(category.color)) {
        throw new Error("A category color is invalid.");
      }
      if (typeof category.icon !== "string" || !category.icon || category.icon.length > 80) {
        throw new Error("A category icon is invalid.");
      }
      if (!Number.isSafeInteger(category.revision) || category.revision < 1) {
        throw new Error("A category revision is invalid.");
      }
      assertTimestamp(category.createdAt, "A category creation time");
      assertTimestamp(category.updatedAt, "A category update time");
      if (category.archivedAt !== null) {
        assertTimestamp(category.archivedAt, "A category archive time");
      }
      categoryIds.add(category.id);
      return { ...category, position };
    });

  const snapshotIds = new Set<string>();
  const snapshots = portfolio.snapshots
    .map((snapshot) => {
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        typeof snapshot.id !== "string" ||
        !snapshot.id ||
        snapshot.id.length > 100 ||
        snapshotIds.has(snapshot.id)
      ) {
        throw new Error("Snapshot IDs must be valid and unique.");
      }
      snapshotIds.add(snapshot.id);
      if (typeof snapshot.date !== "string") throw new Error("A snapshot date is invalid.");
      assertIsoDate(snapshot.date);
      if (snapshot.note !== null && typeof snapshot.note !== "string") {
        throw new Error("A snapshot note is invalid.");
      }
      if (snapshot.note && snapshot.note.length > 500) throw new Error("A snapshot note is too long.");
      if (!["manual", "quick_edit", "import", "demo"].includes(snapshot.source)) {
        throw new Error("A snapshot source is invalid.");
      }
      if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
        throw new Error("A snapshot revision is invalid.");
      }
      assertTimestamp(snapshot.recordedAt, "A snapshot recording time");
      assertTimestamp(snapshot.createdAt, "A snapshot creation time");
      assertTimestamp(snapshot.updatedAt, "A snapshot update time");
      if (!Array.isArray(snapshot.values) || snapshot.values.length > MAX_WEB_CATEGORIES) {
        throw new Error("A snapshot value list is invalid.");
      }
      const seenValues = new Set<string>();
      const inputValues = new Map(snapshot.values.map((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.categoryId !== "string" ||
          !categoryIds.has(value.categoryId) ||
          seenValues.has(value.categoryId)
        ) {
          throw new Error("A snapshot contains an invalid category reference.");
        }
        seenValues.add(value.categoryId);
        return [value.categoryId, assertValidCents(value.amountCents)] as const;
      }));
      const values = categories.map((category) => ({
        categoryId: category.id,
        amountCents: inputValues.get(category.id) ?? 0,
      }));
      return { ...snapshot, values, totalCents: sumValues(values) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt));

  return {
    ...portfolio,
    title: portfolio.title.trim(),
    categories,
    snapshots,
  };
}

/** Returns false instead of throwing, useful at browser-storage trust boundaries. */
export function isWebPortfolio(value: unknown): value is WebPortfolio {
  if (!value || typeof value !== "object") return false;
  try {
    normalizePortfolio(value as WebPortfolio);
    return true;
  } catch {
    return false;
  }
}

/** Mirrors the Local dashboard calculation while staying entirely browser-safe. */
export function portfolioToDashboardData(input: WebPortfolio): DashboardData {
  const portfolio = normalizePortfolio(input);
  const { categories, snapshots } = portfolio;
  const latest = snapshots.at(-1) ?? null;
  const previous = snapshots.at(-2) ?? null;
  const first = snapshots[0] ?? null;
  const latestValues = new Map(latest?.values.map((value) => [value.categoryId, value.amountCents]));
  const previousValues = new Map(previous?.values.map((value) => [value.categoryId, value.amountCents]));
  const total = latest?.totalCents ?? 0;
  const categoryBalances = categories.flatMap((category) => {
    const amountCents = latestValues.get(category.id) ?? 0;
    if (category.archivedAt && amountCents === 0) return [];
    const previousAmountCents = previousValues.get(category.id) ?? 0;
    return [{
      ...category,
      amountCents,
      previousAmountCents,
      deltaCents: amountCents - previousAmountCents,
      percentage: total > 0 ? amountCents / total : 0,
    }];
  });
  const byDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot]));
  const chart = [...byDate.values()].map((snapshot) => ({
    id: snapshot.id,
    date: snapshot.date,
    totalCents: snapshot.totalCents,
    note: snapshot.note,
    values: snapshot.values,
  }));
  const record = chart.reduce<(typeof chart)[number] | null>(
    (best, point) => (!best || point.totalCents > best.totalCents ? point : best),
    null,
  );
  const sumType = (types: CategoryType[]) => categoryBalances
    .filter((category) => types.includes(category.type))
    .reduce((sum, category) => sum + category.amountCents, 0);
  const growthCents = total - (first?.totalCents ?? total);
  return {
    latest,
    previous,
    first,
    categories: categoryBalances,
    chartCategories: categories,
    chart,
    record,
    stats: {
      totalCents: total,
      deltaCents: total - (previous?.totalCents ?? total),
      growthCents,
      growthPercentage: first?.totalCents ? growthCents / first.totalCents : null,
      investedCents: sumType(["investment"]),
      liquidCents: sumType(["available", "reserved"]),
      savingsCents: sumType(["savings"]),
    },
  };
}
