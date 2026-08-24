import { createHash } from "node:crypto";
import type { SnapshotValue } from "@/lib/domain/types";

export function normalizeName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("pt-PT");
}

export function snapshotContentHash(input: {
  date: string;
  note?: string | null;
  values: SnapshotValue[];
}): string {
  const canonical = JSON.stringify({
    date: input.date,
    note: input.note?.trim() || null,
    values: [...input.values]
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
      .map((value) => [value.categoryId, value.amountCents]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
