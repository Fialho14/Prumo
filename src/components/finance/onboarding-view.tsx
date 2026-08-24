"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSpreadsheet, FlaskConical, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { completeEmptyOnboardingAction, seedDemoDataAction } from "@/app/actions";
import styles from "./finance.module.css";

export function OnboardingView() {
  const router = useRouter();
  const [busy, setBusy] = useState<"demo" | "empty" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choiceInFlightRef = useRef(false);

  const chooseDemo = async () => {
    if (choiceInFlightRef.current) return;
    choiceInFlightRef.current = true;
    setBusy("demo");
    setError(null);
    try {
      const result = await seedDemoDataAction();
      if (!result.ok) return setError(result.error.message);
      router.push("/");
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a preparação da demonstração. Atualiza a página antes de repetir para verificar o estado local.",
      );
    } finally {
      choiceInFlightRef.current = false;
      setBusy(null);
    }
  };

  const chooseEmpty = async () => {
    if (choiceInFlightRef.current) return;
    choiceInFlightRef.current = true;
    setBusy("empty");
    setError(null);
    try {
      const result = await completeEmptyOnboardingAction();
      if (!result.ok) return setError(result.error.message);
      router.push("/categorias");
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a inicialização. Atualiza a página antes de repetir para verificar o estado local.",
      );
    } finally {
      choiceInFlightRef.current = false;
      setBusy(null);
    }
  };

  return (
    <main className={styles.onboarding}>
      <header className={styles.onboardingHeader}>
        <p className={styles.eyebrow}>Bem-vindo ao Prumo</p>
        <h1>O teu dinheiro, finalmente num só lugar.</h1>
        <p>Escolhe um ponto de partida. Nada sai deste Mac e podes mudar tudo depois.</p>
      </header>
      <div className={styles.onboardingChoices}>
        <Link className={styles.onboardingChoice} href="/definicoes/importar">
          <FileSpreadsheet aria-hidden="true" size={22} />
          <strong>Importar Excel ou CSV</strong>
          <span>Migra o histórico existente com preview antes de confirmar.</span>
          <ArrowRight aria-hidden="true" size={16} style={{ marginTop: "auto" }} />
        </Link>
        <button className={styles.onboardingChoice} disabled={busy !== null} onClick={() => void chooseDemo()} type="button">
          <FlaskConical aria-hidden="true" size={22} />
          <strong>{busy === "demo" ? "A preparar…" : "Explorar com demonstração"}</strong>
          <span>Cria dados claramente fictícios, separados dos teus dados reais.</span>
          <ArrowRight aria-hidden="true" size={16} style={{ marginTop: "auto" }} />
        </button>
        <button className={styles.onboardingChoice} disabled={busy !== null} onClick={() => void chooseEmpty()} type="button">
          <Sparkles aria-hidden="true" size={22} />
          <strong>{busy === "empty" ? "A preparar…" : "Começar do zero"}</strong>
          <span>Define as categorias e regista o património atual.</span>
          <ArrowRight aria-hidden="true" size={16} style={{ marginTop: "auto" }} />
        </button>
      </div>
      {error && <p className={styles.formError} role="alert">{error}</p>}
    </main>
  );
}
