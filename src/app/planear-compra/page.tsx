import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseState } from "@/components/finance/database-state";
import {
  PurchasePlanner,
  type PurchasePlannerCategory,
} from "@/components/finance/purchase-planner";
import { initializeDatabaseFile, inspectDatabaseStatus } from "@/lib/db/client";
import { getOnboardingState } from "@/lib/services/meta";
import { getDashboardData } from "@/lib/services/snapshots";
import styles from "@/components/finance/finance.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Planear uma compra",
};

export default async function PlanPurchasePage() {
  let status = await inspectDatabaseStatus();
  if (status.code === "not_initialized" && !status.configured) {
    await initializeDatabaseFile();
    status = await inspectDatabaseStatus();
  }
  if (status.code !== "ready") return <DatabaseState status={status} />;

  const onboarding = await getOnboardingState();
  if (onboarding.required) redirect("/onboarding");

  const data = await getDashboardData();
  if (!data.latest) {
    return (
      <main className={styles.emptyState}>
        <h1>A simulação precisa de um ponto de partida.</h1>
        <p>Cria o primeiro snapshot e o Prumo mostra como uma compra afetaria cada categoria.</p>
        <div className={styles.stateActions}>
          <Link className={styles.primaryButton} href="/registos/novo">Criar primeiro snapshot</Link>
          <Link className={styles.secondaryButton} href="/">Voltar</Link>
        </div>
      </main>
    );
  }

  return (
    <PurchasePlanner
      categories={data.categories.map<PurchasePlannerCategory>((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        color: category.color,
        icon: category.icon,
        position: category.position,
        archivedAt: category.archivedAt,
        amountCents: category.amountCents,
      }))}
      currentTotalCents={data.stats.totalCents}
      snapshotDate={data.latest.date}
    />
  );
}
