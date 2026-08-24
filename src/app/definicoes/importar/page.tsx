import { DatabaseState } from "@/components/finance/database-state";
import { ImportView } from "@/components/finance/import-view";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { listCategories } from "@/lib/services/categories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ImportPage() {
  const status = await inspectDatabaseStatus();
  if (status.code !== "ready") return <DatabaseState status={status} />;
  return <ImportView categories={await listCategories({ includeArchived: true })} />;
}
