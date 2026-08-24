"use client";

import {
  Eye,
  EyeOff,
  FolderCog,
  History,
  Home,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { convertDemoToPersonalAction, resetDemoDataAction } from "@/app/actions";
import { useCommandPalette } from "@/components/shell/command-palette";
import { usePrivacy } from "@/components/shell/privacy-provider";
import { ThemeMenu } from "@/components/shell/theme-menu";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { KeyboardKey } from "@/components/ui/keyboard-key";

const PRIMARY_LINKS = [
  { href: "/", label: "Visão geral" },
  { href: "/historico", label: "Histórico" },
  { href: "/categorias", label: "Categorias" },
] as const;

const MOBILE_LINKS = [
  { href: "/", label: "Visão geral", icon: Home },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/categorias", label: "Categorias", icon: FolderCog },
  { href: "/registos/novo", label: "Atualizar", icon: Plus, action: true },
] as const;

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PrivacyButton() {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const label = isPrivacyMode ? "Mostrar valores" : "Ocultar valores";

  return (
    <IconButton
      aria-label={`${label}. Atalho Comando Shift P`}
      aria-pressed={isPrivacyMode}
      title={label}
      onClick={togglePrivacyMode}
    >
      {isPrivacyMode ? (
        <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Eye size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
    </IconButton>
  );
}

function PrimaryNav({ pathname }: { pathname: string }) {
  return (
    <nav className="primary-nav" aria-label="Navegação principal">
      {PRIMARY_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="primary-nav__link"
          aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileDock({ pathname }: { pathname: string }) {
  return (
    <nav className="mobile-dock" aria-label="Navegação móvel">
      <div className="mobile-dock__inner">
        {MOBILE_LINKS.map((link) => {
          const LinkIcon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "mobile-dock__link",
                "action" in link && link.action ? "mobile-dock__link--action" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}
            >
              <LinkIcon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DemoBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState<"reset" | "convert" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationInFlightRef = useRef(false);

  const reset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy("reset");
    setError(null);
    try {
      const result = await resetDemoDataAction();
      if (!result.ok) return setError(result.error.message);
      router.push("/categorias");
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a remoção dos dados de demonstração. Atualiza a página antes de repetir para verificar o estado local.",
      );
      router.refresh();
    } finally {
      mutationInFlightRef.current = false;
      setBusy(null);
    }
  };

  const convert = async () => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy("convert");
    setError(null);
    try {
      const result = await convertDemoToPersonalAction();
      if (!result.ok) return setError(result.error.message);
      router.refresh();
    } catch {
      setError(
        "Não foi possível confirmar a conversão. Atualiza a página antes de repetir para verificar se os dados já ficaram pessoais.",
      );
      router.refresh();
    } finally {
      mutationInFlightRef.current = false;
      setBusy(null);
    }
  };

  return (
    <aside className="demo-banner" aria-label="Dados de demonstração">
      <div>
        <strong>Demonstração · só leitura</strong>
        <span>Estes valores são fictícios e estão marcados separadamente dos teus dados.</span>
        {error ? <span className="demo-banner__error" role="alert">{error}</span> : null}
      </div>
      <div className="demo-banner__actions">
        {confirmReset ? (
          <button disabled={busy !== null} onClick={() => setConfirmReset(false)} type="button">
            Cancelar
          </button>
        ) : null}
        <button disabled={busy !== null} onClick={() => void reset()} type="button">
          {busy === "reset" ? "A limpar…" : confirmReset ? "Confirmar e apagar demo" : "Apagar demo e começar"}
        </button>
        <button disabled={busy !== null} onClick={() => void convert()} type="button">
          {busy === "convert" ? "A converter…" : "Manter como base pessoal"}
        </button>
      </div>
    </aside>
  );
}

export function AppShell({ children, demoMode = false }: { children: ReactNode; demoMode?: boolean }) {
  const pathname = usePathname();
  const { openCommandPalette } = useCommandPalette();
  const isOnboarding = pathname.startsWith("/onboarding");

  if (isOnboarding) {
    return (
      <div className="app-shell">
        <a className="skip-link" href="#conteudo">
          Saltar para o conteúdo
        </a>
        <div id="conteudo" className="app-main" tabIndex={-1}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Saltar para o conteúdo
      </a>

      <header className="app-header">
        <div className="app-header__inner">
          <Link className="wordmark" href="/" aria-label="Prumo — visão geral">
            <span className="wordmark__mark" aria-hidden="true" />
            <span>Prumo</span>
          </Link>

          <PrimaryNav pathname={pathname} />

          <div className="app-header__actions">
            <PrivacyButton />
            <ThemeMenu />
            <button
              type="button"
              className="command-trigger"
              aria-label="Abrir comandos rápidos. Atalho Comando K"
              onClick={openCommandPalette}
            >
              <Search size={16} strokeWidth={1.8} aria-hidden="true" />
              <KeyboardKey>⌘ K</KeyboardKey>
            </button>
            <ButtonLink href="/registos/novo">
              <Plus size={17} strokeWidth={2} aria-hidden="true" />
              <span className="ui-button__label">Atualizar património</span>
            </ButtonLink>
          </div>

          <div className="mobile-header-actions">
            <PrivacyButton />
            <IconButton
              aria-label="Abrir comandos rápidos. Atalho Comando K"
              onClick={openCommandPalette}
            >
              <Search size={18} strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </header>

      {demoMode ? <DemoBanner /> : null}

      <div id="conteudo" className="app-main" tabIndex={-1}>
        {children}
      </div>

      <MobileDock pathname={pathname} />
    </div>
  );
}
