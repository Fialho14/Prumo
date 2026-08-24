import { DatabaseState } from "@/components/finance/database-state";
import { SnapshotEditor } from "@/components/finance/snapshot-editor";
import { initializeDatabaseFile, inspectDatabaseStatus } from "@/lib/db/client";
import { todayInLisbon } from "@/lib/domain/dates";
import { listCategories } from "@/lib/services/categories";
import { listSnapshots } from "@/lib/services/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewSnapshotPage() {
  let status = await inspectDatabaseStatus();
  if (status.code === "not_initialized" && !status.configured) {
    await initializeDatabaseFile();
    status = await inspectDatabaseStatus();
  }
  if (status.code !== "ready") return <DatabaseState status={status} />;
  const [allCategories, snapshots] = await Promise.all([
    listCategories({ includeArchived: true }),
    listSnapshots("DESC"),
  ]);
  const latest = snapshots[0] ?? null;
  const latestValues = new Map(latest?.values.map((value) => [value.categoryId, value.amountCents]));
  const categories = allCategories.filter(
    (category) => !category.archivedAt || (latestValues.get(category.id) ?? 0) > 0,
  );
  return <SnapshotEditor categories={categories} latest={latest} defaultDate={todayInLisbon()} />;
}
