import { DatabaseState } from "@/components/finance/database-state";
import { HistoryView } from "@/components/finance/history-view";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { todayInLisbon } from "@/lib/domain/dates";
import { listCategories } from "@/lib/services/categories";
import { listSnapshots } from "@/lib/services/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HistoryPage() {
  const status = await inspectDatabaseStatus();
  if (status.code !== "ready") return <DatabaseState status={status} />;
  const [snapshots, categories] = await Promise.all([
    listSnapshots("DESC"),
    listCategories({ includeArchived: true }),
  ]);
  return <HistoryView snapshots={snapshots} categories={categories} today={todayInLisbon()} />;
}
