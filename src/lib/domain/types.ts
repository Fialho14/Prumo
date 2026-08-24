export const CATEGORY_TYPES = [
  "available",
  "reserved",
  "investment",
  "asset",
  "savings",
  "other",
] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  position: number;
  archivedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotValue = {
  categoryId: string;
  amountCents: number;
};

export type Snapshot = {
  id: string;
  date: string;
  recordedAt: string;
  note: string | null;
  source: "manual" | "quick_edit" | "import" | "demo";
  revision: number;
  createdAt: string;
  updatedAt: string;
  values: SnapshotValue[];
  totalCents: number;
};

export type CategoryBalance = Category & {
  amountCents: number;
  previousAmountCents: number;
  deltaCents: number;
  percentage: number;
};

export type ChartPoint = {
  id: string;
  date: string;
  totalCents: number;
  note: string | null;
  values: SnapshotValue[];
};

export type DashboardData = {
  latest: Snapshot | null;
  previous: Snapshot | null;
  first: Snapshot | null;
  categories: CategoryBalance[];
  chartCategories: Category[];
  chart: ChartPoint[];
  record: ChartPoint | null;
  stats: {
    totalCents: number;
    deltaCents: number;
    growthCents: number;
    growthPercentage: number | null;
    investedCents: number;
    liquidCents: number;
    savingsCents: number;
  };
};

export type DatabaseStatusCode =
  | "ready"
  | "not_initialized"
  | "volume_unavailable"
  | "permission_denied"
  | "corrupt"
  | "migration_failed"
  | "invalid_path";

export type DatabaseStatus = {
  code: DatabaseStatusCode;
  configured: boolean;
  displayPath: string;
  detail?: string;
};
