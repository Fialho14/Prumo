import type { CategoryType } from "@/lib/domain/types";

export const DEMO_CATEGORIES = [
  { id: "demo-daily", name: "Disponível", type: "available" as CategoryType, color: "#28A889", icon: "wallet" },
  { id: "demo-reserve", name: "Reserva", type: "reserved" as CategoryType, color: "#D69A3A", icon: "shield" },
  { id: "demo-invest", name: "Investimentos", type: "investment" as CategoryType, color: "#8D72E1", icon: "chart" },
  { id: "demo-savings", name: "Poupança", type: "savings" as CategoryType, color: "#597E52", icon: "piggy-bank" },
] as const;

export const DEMO_HISTORY = [
  ["2025-02-01", [65000, 120000, 80000, 150000]],
  ["2025-04-01", [72000, 125000, 92000, 160000]],
  ["2025-06-01", [58000, 130000, 110000, 175000]],
  ["2025-08-01", [81000, 130000, 123000, 185000]],
  ["2025-10-01", [74000, 140000, 138000, 195000]],
  ["2025-12-01", [90000, 145000, 151000, 210000]],
  ["2026-02-01", [86000, 150000, 165000, 225000]],
  ["2026-04-01", [99000, 155000, 182000, 240000]],
] as const;
