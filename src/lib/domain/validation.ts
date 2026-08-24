import { z } from "zod";
import { CATEGORY_TYPES, type CategoryType } from "@/lib/domain/types";
import { MAX_MONEY_CENTS } from "@/lib/domain/money";

export const CATEGORY_ICON_KEYS = [
  "wallet",
  "shield",
  "globe",
  "chart",
  "gem",
  "piggy-bank",
  "landmark",
  "coins",
  "briefcase",
  "home",
  "vault",
  "sparkles",
] as const;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CATEGORY_TYPES).default("other" as CategoryType),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.enum(CATEGORY_ICON_KEYS),
});

export const snapshotValueSchema = z.object({
  categoryId: z.string().min(1).max(100),
  amountCents: z.number().int().min(0).max(MAX_MONEY_CENTS),
});

export const snapshotInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).nullable().optional(),
  values: z.array(snapshotValueSchema).max(250),
  source: z.enum(["manual", "quick_edit", "import", "demo"]).default("manual"),
  allowSameDate: z.boolean().default(false),
});
