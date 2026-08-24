"use client";

import { RotateCcw } from "lucide-react";
import styles from "@/components/finance/finance.module.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.databaseState}>
      <h1>Algo interrompeu esta vista.</h1>
      <p>Os dados não foram alterados. Tenta carregar novamente.</p>
      <div className={styles.stateActions}>
        <button className={styles.primaryButton} onClick={reset} type="button">
          <RotateCcw aria-hidden="true" size={15} /> Tentar novamente
        </button>
      </div>
    </main>
  );
}
