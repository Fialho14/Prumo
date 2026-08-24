import { assertValidCents } from "@/lib/domain/money";
import { CATEGORY_TYPES, type CategoryType } from "@/lib/domain/types";

export type PurchaseCategory = {
  id: string;
  type: CategoryType;
  position: number;
  amountCents: number;
};

export type PurchaseAllocation = {
  categoryId: string;
  categoryType: CategoryType;
  availableCents: number;
  allocatedCents: number;
  remainingCents: number;
};

export type PurchaseSimulation = {
  allocations: PurchaseAllocation[];
  capacityCents: number;
  coveredCents: number;
  shortfallCents: number;
  remainingTotalCents: number;
  protectedTotalCents: number;
  fullyFunded: boolean;
};

export type SimulatePurchaseInput = {
  costCents: number;
  categories: readonly PurchaseCategory[];
  /**
   * `undefined` applies the safe default: positive balances whose type is
   * `available`. An empty array deliberately selects no source.
   */
  selectedCategoryIds?: readonly string[];
};

const PURCHASE_TYPE_PRIORITY: Readonly<Record<CategoryType, number>> = {
  available: 0,
  reserved: 1,
  other: 2,
  savings: 3,
  investment: 4,
  asset: 5,
};

function addCents(total: number, amount: number): number {
  return assertValidCents(total + amount);
}

function assertValidCategory(category: PurchaseCategory): void {
  if (!category.id.trim()) throw new Error("A categoria precisa de um identificador.");
  if (!CATEGORY_TYPES.includes(category.type)) {
    throw new Error(`Tipo de categoria inválido: ${category.type}.`);
  }
  if (!Number.isSafeInteger(category.position) || category.position < 0) {
    throw new Error("A posição da categoria tem de ser um inteiro não negativo.");
  }
  assertValidCents(category.amountCents);
}

function byPurchasePriority(a: PurchaseCategory, b: PurchaseCategory): number {
  return (
    PURCHASE_TYPE_PRIORITY[a.type] - PURCHASE_TYPE_PRIORITY[b.type] ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

export function defaultPurchaseSourceIds(
  categories: readonly PurchaseCategory[],
): string[] {
  validateCategories(categories);

  return categories
    .filter(({ amountCents, type }) => type === "available" && amountCents > 0)
    .slice()
    .sort(byPurchasePriority)
    .map(({ id }) => id);
}

function validateCategories(categories: readonly PurchaseCategory[]): void {
  const ids = new Set<string>();

  for (const category of categories) {
    assertValidCategory(category);
    if (ids.has(category.id)) {
      throw new Error(`Categoria duplicada: ${category.id}.`);
    }
    ids.add(category.id);
  }
}

export function simulatePurchase({
  costCents,
  categories,
  selectedCategoryIds,
}: SimulatePurchaseInput): PurchaseSimulation {
  assertValidCents(costCents);
  validateCategories(categories);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const selectedIds = new Set(
    selectedCategoryIds ?? defaultPurchaseSourceIds(categories),
  );

  if (selectedCategoryIds) {
    for (const id of selectedIds) {
      if (!categoryById.has(id)) throw new Error(`Categoria desconhecida: ${id}.`);
    }
  }

  const selectedCategories = categories
    .filter(({ id, amountCents }) => selectedIds.has(id) && amountCents > 0)
    .slice()
    .sort(byPurchasePriority);

  const totalCents = categories.reduce(
    (total, { amountCents }) => addCents(total, amountCents),
    0,
  );
  const capacityCents = selectedCategories.reduce(
    (total, { amountCents }) => addCents(total, amountCents),
    0,
  );
  const protectedTotalCents = categories.reduce(
    (total, category) =>
      selectedIds.has(category.id)
        ? total
        : addCents(total, category.amountCents),
    0,
  );

  let amountLeftCents = costCents;
  const allocations: PurchaseAllocation[] = [];

  for (const category of selectedCategories) {
    if (amountLeftCents === 0) break;

    const allocatedCents = Math.min(category.amountCents, amountLeftCents);
    amountLeftCents -= allocatedCents;
    allocations.push({
      categoryId: category.id,
      categoryType: category.type,
      availableCents: category.amountCents,
      allocatedCents,
      remainingCents: category.amountCents - allocatedCents,
    });
  }

  const coveredCents = costCents - amountLeftCents;

  return {
    allocations,
    capacityCents,
    coveredCents,
    shortfallCents: amountLeftCents,
    remainingTotalCents: totalCents - coveredCents,
    protectedTotalCents,
    fullyFunded: amountLeftCents === 0,
  };
}
