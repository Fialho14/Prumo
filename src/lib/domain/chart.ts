import type { Category, ChartPoint } from "@/lib/domain/types";

export type ChartRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

const MONTHS: Record<Exclude<ChartRange, "ALL">, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
};

const DEFAULT_EXCLUDED_TYPES = new Set<Category["type"]>(["investment", "savings"]);

export function defaultChartCategoryIds(
  categories: Pick<Category, "id" | "type">[],
): string[] {
  return categories
    .filter((category) => !DEFAULT_EXCLUDED_TYPES.has(category.type))
    .map((category) => category.id);
}

export function aggregateChartPoints(
  points: ChartPoint[],
  categoryIds: Iterable<string>,
): ChartPoint[] {
  const selected = new Set(categoryIds);
  return points.map((point) => ({
    ...point,
    totalCents: point.values.reduce(
      (sum, value) => sum + (selected.has(value.categoryId) ? value.amountCents : 0),
      0,
    ),
  }));
}

function isoToUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function subtractUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function filterChartPoints(points: ChartPoint[], range: ChartRange): ChartPoint[] {
  if (range === "ALL" || points.length === 0) return points;
  const end = isoToUtc(points.at(-1)!.date);
  const start = subtractUtcMonths(end, MONTHS[range]);
  return points.filter((point) => isoToUtc(point.date) >= start);
}

export function filterPreviousChartPoints(
  points: ChartPoint[],
  range: ChartRange,
): ChartPoint[] {
  if (range === "ALL" || points.length === 0) return [];
  const currentEnd = isoToUtc(points.at(-1)!.date);
  const previousEnd = subtractUtcMonths(currentEnd, MONTHS[range]);
  const previousStart = subtractUtcMonths(previousEnd, MONTHS[range]);
  return points.filter((point) => {
    const date = isoToUtc(point.date);
    return date >= previousStart && date < previousEnd;
  });
}

export function calculateChartStats(points: ChartPoint[]) {
  if (points.length === 0) {
    return { minCents: 0, maxCents: 0, growthCents: 0, growthPercentage: null as number | null };
  }
  const values = points.map((point) => point.totalCents);
  const first = values[0];
  const last = values.at(-1)!;
  return {
    minCents: Math.min(...values),
    maxCents: Math.max(...values),
    growthCents: last - first,
    growthPercentage: first > 0 ? (last - first) / first : null,
  };
}

export type ChartCoordinate = ChartPoint & { x: number; y: number };

export type ChartDomain = {
  minCents: number;
  maxCents: number;
};

export function calculateChartDomain(points: ChartPoint[]): ChartDomain {
  if (points.length === 0) return { minCents: 0, maxCents: 100 };

  const values = points.map((point) => point.totalCents);
  const actualMin = Math.min(...values);
  const actualMax = Math.max(...values);
  const spread = actualMax - actualMin;
  const padding =
    spread > 0
      ? spread * 0.12
      : Math.max(actualMax * 0.05, 100);
  const minCents = Math.max(0, actualMin - padding);
  const maxCents = Math.max(actualMax + padding, minCents + 1);

  return { minCents, maxCents };
}

export function chartCoordinates(
  points: ChartPoint[],
  width = 1000,
  height = 280,
  padding = { top: 18, right: 12, bottom: 28, left: 12 },
): ChartCoordinate[] {
  if (points.length === 0) return [];
  const domain = calculateChartDomain(points);
  const visualSpread = domain.maxCents - domain.minCents;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return points.map((point, index) => ({
    ...point,
    x: padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
    y: padding.top + ((domain.maxCents - point.totalCents) / visualSpread) * innerHeight,
  }));
}

export function linePath(coordinates: ChartCoordinate[]): string {
  if (coordinates.length === 0) return "";
  if (coordinates.length === 1) return `M ${coordinates[0].x} ${coordinates[0].y}`;
  return coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export function areaPath(coordinates: ChartCoordinate[], baseline = 252): string {
  if (coordinates.length === 0) return "";
  const line = linePath(coordinates);
  return `${line} L ${coordinates.at(-1)!.x.toFixed(2)} ${baseline} L ${coordinates[0].x.toFixed(2)} ${baseline} Z`;
}
