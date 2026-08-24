import styles from "@/components/finance/finance.module.css";

export default function Loading() {
  return (
    <main className={styles.page} aria-label="A carregar o património">
      <div className={styles.heroGrid} style={{ marginTop: "3rem" }}>
        <div className={styles.worthHero}>
          <span className={styles.skeleton} style={{ width: 120, height: 13 }} />
          <span className={styles.skeleton} style={{ width: "72%", height: 92, marginTop: 32 }} />
          <span className={styles.skeleton} style={{ width: 220, height: 15, marginTop: 28 }} />
        </div>
        <div className={styles.allocationPanel}>
          <span className={styles.skeleton} style={{ display: "block", width: 90, height: 13 }} />
          <span className={styles.skeleton} style={{ display: "block", width: "100%", height: 13, marginTop: 24 }} />
        </div>
      </div>
    </main>
  );
}
