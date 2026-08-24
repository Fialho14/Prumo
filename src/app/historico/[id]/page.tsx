import { notFound } from "next/navigation";
import { DatabaseState } from "@/components/finance/database-state";
import { SnapshotEditor } from "@/components/finance/snapshot-editor";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { todayInLisbon } from "@/lib/domain/dates";
import { FinanceError } from "@/lib/domain/errors";
import { listCategories } from "@/lib/services/categories";
import { getSnapshot, listSnapshots } from "@/lib/services/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditSnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  const status = await inspectDatabaseStatus();
  if (status.code !== "ready") return <DatabaseState status={status} />;
  const { id } = await params;
  let snapshot;
  let allCategories;
  let snapshots;
  try {
    [snapshot, allCategories, snapshots] = await Promise.all([
      getSnapshot(id),
      listCategories({ includeArchived: true }),
      listSnapshots("DESC"),
    ]);
  } catch (error) {
    if (error instanceof FinanceError && error.code === "snapshot_not_found") notFound();
    throw error;
  }
  const used = new Set(snapshot.values.map((value) => value.categoryId));
  const categories = allCategories.filter((category) => !category.archivedAt || used.has(category.id));
  return (
    <SnapshotEditor
      categories={categories}
      latest={snapshots[0] ?? null}
      editing={snapshot}
      defaultDate={todayInLisbon()}
    />
  );
}
