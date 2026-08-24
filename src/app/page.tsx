import { redirect } from "next/navigation";
import { DashboardView } from "@/components/finance/dashboard-view";
import { DatabaseState } from "@/components/finance/database-state";
import { initializeDatabaseFile, inspectDatabaseStatus } from "@/lib/db/client";
import { todayInLisbon } from "@/lib/domain/dates";
import { getOnboardingState } from "@/lib/services/meta";
import { getDashboardData } from "@/lib/services/snapshots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  let status = await inspectDatabaseStatus();
  if (status.code === "not_initialized" && !status.configured) {
    await initializeDatabaseFile();
    status = await inspectDatabaseStatus();
  }
  if (status.code !== "ready") return <DatabaseState status={status} />;

  const onboarding = await getOnboardingState();
  if (onboarding.required) redirect("/onboarding");

  const data = await getDashboardData();
  return <DashboardView data={data} today={todayInLisbon()} />;
}
