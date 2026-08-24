import { CategoryManager } from "@/components/finance/category-manager";
import { DatabaseState } from "@/components/finance/database-state";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { listCategories } from "@/lib/services/categories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoriesPage() {
  const status = await inspectDatabaseStatus();
  if (status.code !== "ready") return <DatabaseState status={status} />;
  return <CategoryManager initialCategories={await listCategories({ includeArchived: true })} />;
}
