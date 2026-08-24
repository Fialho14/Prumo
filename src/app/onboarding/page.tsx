import { redirect } from "next/navigation";
import { DatabaseState } from "@/components/finance/database-state";
import { OnboardingView } from "@/components/finance/onboarding-view";
import { initializeDatabaseFile, inspectDatabaseStatus } from "@/lib/db/client";
import { getOnboardingState } from "@/lib/services/meta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  let status = await inspectDatabaseStatus();
  if (status.code === "not_initialized" && !status.configured) {
    await initializeDatabaseFile();
    status = await inspectDatabaseStatus();
  }
  if (status.code !== "ready") return <DatabaseState status={status} />;
  if (!(await getOnboardingState()).required) redirect("/");
  return <OnboardingView />;
}
