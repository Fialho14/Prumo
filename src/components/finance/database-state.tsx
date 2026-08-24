"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { initializeDatabaseAction } from "@/app/actions";
import type { DatabaseStatus } from "@/lib/domain/types";
import styles from "./finance.module.css";

export function DatabaseState({ status }: { status: DatabaseStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializeInFlightRef = useRef(false);
  const canInitialize = status.code === "not_initialized";
  const canRestore = status.code === "corrupt";
  const copy = (() => {
    switch (status.code) {
      case "not_initialized":
        return {
          title: "Base de dados por inicializar",
          message: "O diretório privado está disponível, mas ainda não existe uma base de dados. A criação só acontece depois da tua confirmação.",
        };
      case "corrupt":
        return {
          title: "A base de dados precisa de restauro",
          message: "O ficheiro não passou a verificação de integridade. Podes validar e restaurar um backup sem apagar a versão danificada.",
        };
      case "permission_denied":
        return {
          title: "Sem permissão para abrir a base de dados",
          message: "O volume está disponível, mas o macOS não permitiu ler e escrever neste ficheiro. Revê as permissões e tenta novamente.",
        };
      case "invalid_path":
        return {
          title: "Caminho da base de dados inválido",
          message: "FINANCE_DB_PATH tem de apontar para um caminho absoluto. Corrige .env.local e reinicia a aplicação.",
        };
      case "migration_failed":
        return {
          title: "Não foi possível atualizar a base de dados",
          message: "A migração foi interrompida sem substituir silenciosamente os dados. Consulta a documentação e o backup pré-migração.",
        };
      default:
        return {
          title: "Base de dados privada não disponível",
          message: "Certifica-te de que o volume está desbloqueado e montado. Não foi criada nenhuma base de dados alternativa.",
        };
    }
  })();

  const initialize = async () => {
    if (initializeInFlightRef.current) return;
    initializeInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await initializeDatabaseAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a inicialização. Atualiza a página para verificar o estado da base de dados antes de repetir.",
      );
      router.refresh();
    } finally {
      initializeInFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className={styles.databaseState}>
      <span className={styles.stateIcon}><DatabaseZap aria-hidden="true" size={25} /></span>
      <h1>{copy.title}</h1>
      <p>{copy.message}</p>
      <code className={styles.pathBox} title={status.displayPath}>{status.displayPath}</code>
      {error && <p className={styles.formError} role="alert">{error}</p>}
      <div className={styles.stateActions}>
        {canInitialize ? (
          <button className={styles.primaryButton} disabled={busy} onClick={() => void initialize()} type="button">
            {busy ? "A inicializar…" : "Inicializar neste caminho"}
          </button>
        ) : canRestore ? (
          <Link className={styles.primaryButton} href="/definicoes/backups">
            Restaurar backup
          </Link>
        ) : (
          <button className={styles.primaryButton} onClick={() => router.refresh()} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Tentar novamente
          </button>
        )}
        <Link className={styles.secondaryButton} href="/definicoes">Ver configuração</Link>
      </div>
    </main>
  );
}
