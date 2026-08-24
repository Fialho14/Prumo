import { describe, expect, it } from "vitest";
import {
  defaultPurchaseSourceIds,
  simulatePurchase,
  type PurchaseCategory,
} from "@/lib/domain/purchase";

const CATEGORIES: readonly PurchaseCategory[] = [
  { id: "cash", type: "available", position: 0, amountCents: 30_000 },
  { id: "reserved", type: "reserved", position: 1, amountCents: 50_000 },
  { id: "wallet", type: "available", position: 2, amountCents: 20_000 },
  { id: "fund", type: "investment", position: 3, amountCents: 90_000 },
  { id: "valuable", type: "asset", position: 4, amountCents: 25_000 },
  { id: "emergency", type: "savings", position: 5, amountCents: 110_000 },
] as const;

describe("large purchase simulation", () => {
  it("reconcilia o património atual sem alterar os dados de origem", () => {
    const original = structuredClone(CATEGORIES);
    const result = simulatePurchase({ costCents: 40_000, categories: CATEGORIES });

    expect(result).toEqual({
      allocations: [
        {
          categoryId: "cash",
          categoryType: "available",
          availableCents: 30_000,
          allocatedCents: 30_000,
          remainingCents: 0,
        },
        {
          categoryId: "wallet",
          categoryType: "available",
          availableCents: 20_000,
          allocatedCents: 10_000,
          remainingCents: 10_000,
        },
      ],
      capacityCents: 50_000,
      coveredCents: 40_000,
      shortfallCents: 0,
      remainingTotalCents: 285_000,
      protectedTotalCents: 275_000,
      fullyFunded: true,
    });
    expect(CATEGORIES).toEqual(original);
  });

  it("seleciona por omissão apenas saldos disponíveis positivos", () => {
    expect(defaultPurchaseSourceIds(CATEGORIES)).toEqual(["cash", "wallet"]);
    expect(
      defaultPurchaseSourceIds([
        ...CATEGORIES,
        { id: "empty", type: "available", position: 1, amountCents: 0 },
      ]),
    ).toEqual(["cash", "wallet"]);
  });

  it("permite incluir poupança e investimento, aplicando a prioridade conceptual", () => {
    const result = simulatePurchase({
      costCents: 150_000,
      categories: CATEGORIES,
      selectedCategoryIds: ["fund", "emergency"],
    });

    expect(result.allocations.map(({ categoryId, allocatedCents }) => [
      categoryId,
      allocatedCents,
    ])).toEqual([
      ["emergency", 110_000],
      ["fund", 40_000],
    ]);
    expect(result.capacityCents).toBe(200_000);
    expect(result.remainingTotalCents).toBe(175_000);
    expect(result.protectedTotalCents).toBe(125_000);
    expect(result.fullyFunded).toBe(true);
  });

  it("expõe o défice quando as fontes escolhidas não chegam", () => {
    const result = simulatePurchase({ costCents: 100_000, categories: CATEGORIES });

    expect(result.coveredCents).toBe(50_000);
    expect(result.shortfallCents).toBe(50_000);
    expect(result.remainingTotalCents).toBe(275_000);
    expect(result.allocations.map(({ remainingCents }) => remainingCents)).toEqual([
      0,
      0,
    ]);
    expect(result.fullyFunded).toBe(false);
  });

  it("trata uma compra de custo zero como financiada sem criar alocações", () => {
    const result = simulatePurchase({ costCents: 0, categories: CATEGORIES });

    expect(result).toMatchObject({
      allocations: [],
      capacityCents: 50_000,
      coveredCents: 0,
      shortfallCents: 0,
      remainingTotalCents: 325_000,
      protectedTotalCents: 275_000,
      fullyFunded: true,
    });
  });

  it("ordena por tipo e posição e nunca retira mais do que o necessário", () => {
    const categories: PurchaseCategory[] = [
      { id: "asset", type: "asset", position: 0, amountCents: 1_000 },
      { id: "reserved-later", type: "reserved", position: 3, amountCents: 1_000 },
      { id: "other", type: "other", position: 0, amountCents: 1_000 },
      { id: "available", type: "available", position: 9, amountCents: 1_000 },
      { id: "reserved-first", type: "reserved", position: 1, amountCents: 1_000 },
      { id: "investment", type: "investment", position: 0, amountCents: 1_000 },
      { id: "savings", type: "savings", position: 0, amountCents: 1_000 },
    ];
    const result = simulatePurchase({
      costCents: 3_250,
      categories,
      selectedCategoryIds: categories.map(({ id }) => id),
    });

    expect(result.allocations.map(({ categoryId, allocatedCents }) => [
      categoryId,
      allocatedCents,
    ])).toEqual([
      ["available", 1_000],
      ["reserved-first", 1_000],
      ["reserved-later", 1_000],
      ["other", 250],
    ]);
    expect(result.coveredCents).toBe(3_250);
    expect(result.shortfallCents).toBe(0);
  });

  it("rejeita valores negativos, posições inválidas e fontes desconhecidas", () => {
    expect(() => simulatePurchase({ costCents: -1, categories: CATEGORIES })).toThrow(
      "Montante inválido",
    );
    expect(() =>
      simulatePurchase({
        costCents: 100,
        categories: [{ id: "bad", type: "available", position: 0, amountCents: -1 }],
      }),
    ).toThrow("Montante inválido");
    expect(() =>
      simulatePurchase({
        costCents: 100,
        categories: [{ id: "bad", type: "available", position: -1, amountCents: 100 }],
      }),
    ).toThrow("posição");
    expect(() =>
      simulatePurchase({
        costCents: 100,
        categories: CATEGORIES,
        selectedCategoryIds: ["missing"],
      }),
    ).toThrow("Categoria desconhecida");
  });
});
