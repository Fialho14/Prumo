import Link from "next/link";
import styles from "@/components/finance/finance.module.css";

export default function NotFound() {
  return (
    <main className={styles.emptyState}>
      <h1>Esta página não existe.</h1>
      <p>O teu património continua onde o deixaste.</p>
      <div className={styles.stateActions}>
        <Link className={styles.primaryButton} href="/">Voltar à visão geral</Link>
      </div>
    </main>
  );
}
