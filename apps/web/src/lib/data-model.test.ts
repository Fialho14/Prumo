import { describe, expect, it } from "vitest";
import {
  createEmptyPortfolio,
  createWebCategory,
  portfolioToDashboardData,
  recordSnapshot,
  updateSnapshot,
} from "./data-model";
import { createDemoPortfolio, DEMO_PORTFOLIO } from "./demo";
import { TEMPLATE_PORTFOLIO } from "./template";

describe("public portfolio fixtures", () => {
  it("ships a clearly fictitious demo with gains, dips and notes", () => {
    expect(DEMO_PORTFOLIO.mode).toBe("demo");
    expect(DEMO_PORTFOLIO.title.toLowerCase()).toContain("fictitious");
    expect(DEMO_PORTFOLIO.snapshots).toHaveLength(12);
    expect(DEMO_PORTFOLIO.snapshots.every((snapshot) => snapshot.source === "demo")).toBe(true);
    expect(DEMO_PORTFOLIO.snapshots.some((snapshot) => snapshot.note)).toBe(true);

    const totals = DEMO_PORTFOLIO.snapshots.map((snapshot) => snapshot.totalCents);
    const changes = totals.slice(1).map((total, index) => total - totals[index]);
    expect(changes.some((change) => change > 0)).toBe(true);
    expect(changes.some((change) => change < 0)).toBe(true);

    const copy = createDemoPortfolio();
    copy.title = "Changed locally";
    expect(DEMO_PORTFOLIO.title).not.toBe(copy.title);
  });

  it("keeps the template immediately understandable", () => {
    expect(TEMPLATE_PORTFOLIO.mode).toBe("template");
    expect(TEMPLATE_PORTFOLIO.categories.map((category) => category.name)).toEqual([
      "Everyday",
      "Savings",
      "Investments",
      "Emergency Fund",
      "Other",
    ]);
    expect(TEMPLATE_PORTFOLIO.snapshots).toHaveLength(3);
    expect(TEMPLATE_PORTFOLIO.snapshots[0].note).toContain("fictitious");
  });
});

describe("browser portfolio model", () => {
  it("records and updates snapshots immutably, then calculates dashboard data", () => {
    const createdAt = "2025-01-01T12:00:00.000Z";
    const everyday = createWebCategory("Everyday", 0, { timestamp: createdAt });
    const savings = createWebCategory("Savings", 1, { timestamp: createdAt });
    const empty = {
      ...createEmptyPortfolio({ createdAt, updatedAt: createdAt }),
      categories: [everyday, savings],
    };
    const january = recordSnapshot(empty, {
      id: "january",
      date: "2025-01-01",
      recordedAt: createdAt,
      amountsCents: { [everyday.id]: 100_00, [savings.id]: 500_00 },
    });
    const february = recordSnapshot(january, {
      id: "february",
      date: "2025-02-01",
      recordedAt: "2025-02-01T12:00:00.000Z",
      amountsCents: { [everyday.id]: 120_00, [savings.id]: 540_00 },
    });

    expect(empty.snapshots).toEqual([]);
    expect(portfolioToDashboardData(february).stats).toMatchObject({
      totalCents: 660_00,
      deltaCents: 60_00,
      growthCents: 60_00,
      savingsCents: 540_00,
      liquidCents: 120_00,
    });

    const updated = updateSnapshot(february, "february", {
      date: "2025-02-02",
      note: "Updated in this browser",
      amountsCents: { [everyday.id]: 125_00, [savings.id]: 550_00 },
    });
    expect(updated.snapshots.at(-1)).toMatchObject({
      date: "2025-02-02",
      note: "Updated in this browser",
      totalCents: 675_00,
      revision: 2,
    });
    expect(february.snapshots.at(-1)?.date).toBe("2025-02-01");
  });
});

