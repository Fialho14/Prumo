const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string): string {
  if (!ISO_DATE.test(value)) throw new Error("Data inválida.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Data inválida.");
  }
  return value;
}

export function todayInLisbon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatDate(value: string, style: "short" | "long" = "short"): string {
  assertIsoDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function daysAgoLabel(value: string, now = new Date()): string {
  const today = todayInLisbon(now);
  const toUtc = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const days = Math.round((toUtc(today) - toUtc(value)) / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days > 1) return `há ${days} dias`;
  return formatDate(value);
}
