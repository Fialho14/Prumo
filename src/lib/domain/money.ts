const EUR_FORMATTER = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER_EUR_FORMATTER = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COMPACT_EUR_FORMATTER = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const MAX_MONEY_CENTS = 9_000_000_000_000;

export function assertValidCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_CENTS) {
    throw new Error("Montante inválido.");
  }
  return value;
}

export function parseMoneyToCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error("Montante inválido.");
    return assertValidCents(Math.round((input + Number.EPSILON) * 100));
  }

  const value = input
    .trim()
    .replace(/[€\s\u00a0\u202f]/g, "")
    .replace(/^\+/, "");

  if (!value || value.includes("-") || /^\(.*\)$/.test(value)) {
    throw new Error("Introduz um montante igual ou superior a zero.");
  }

  if (!/^[0-9.,]+$/.test(value)) {
    throw new Error("Usa apenas números, vírgula ou ponto.");
  }

  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  const separatorIndex = Math.max(comma, dot);
  let whole = value;
  let fraction = "";

  if (separatorIndex >= 0) {
    const candidateFraction = value.slice(separatorIndex + 1);
    const separatorCount = (value.match(/[.,]/g) ?? []).length;
    const isDecimal = candidateFraction.length <= 2 || separatorCount > 1;

    if (isDecimal) {
      whole = value.slice(0, separatorIndex);
      fraction = candidateFraction;
    }
  }

  whole = whole.replace(/[.,]/g, "");
  fraction = fraction.replace(/[.,]/g, "");

  if (!whole) whole = "0";
  if (fraction.length > 2) throw new Error("Usa no máximo duas casas decimais.");

  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return assertValidCents(cents);
}

export function formatCurrency(cents: number, hideZeroCents = true): string {
  assertValidCents(Math.abs(cents));
  const value = cents / 100;
  return hideZeroCents && cents % 100 === 0
    ? INTEGER_EUR_FORMATTER.format(value)
    : EUR_FORMATTER.format(value);
}

export function formatSignedCurrency(cents: number): string {
  if (cents === 0) return formatCurrency(0);
  return `${cents > 0 ? "+" : "−"}${formatCurrency(Math.abs(cents))}`;
}

export function formatCompactCurrency(cents: number): string {
  return COMPACT_EUR_FORMATTER.format(cents / 100);
}

export function formatPercent(value: number, digits = 1): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function centsToInput(cents: number): string {
  assertValidCents(cents);
  const euros = Math.floor(cents / 100);
  const remainder = cents % 100;
  return remainder === 0 ? String(euros) : `${euros},${String(remainder).padStart(2, "0")}`;
}
