import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { GitHubIcon, PrumoLogo } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const GITHUB_URL = "https://github.com/Fialho14/patrimonio";

export function SiteHeader({ appMode = false }: { appMode?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <a className="site-header__brand" href="/" aria-label="Prumo home">
        <PrumoLogo />
      </a>

      <nav className="site-header__desktop" aria-label="Primary navigation">
        {appMode ? (
          <a href="/privacy/">Privacy</a>
        ) : (
          <>
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#local">Run locally</a>
          </>
        )}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          <GitHubIcon size={16} /> GitHub
        </a>
        <ThemeToggle />
        {appMode ? null : (
          <a className="button button--primary button--compact" href="/app/">
            Open Prumo
          </a>
        )}
      </nav>

      <div className="site-header__mobile-actions">
        <ThemeToggle />
        <button
          className="icon-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        </button>
      </div>

      {menuOpen ? (
        <nav className="site-header__mobile" id="mobile-navigation" aria-label="Mobile navigation">
          {appMode ? (
            <>
              <a href="/">About Prumo</a>
              <a href="/privacy/">Privacy</a>
            </>
          ) : (
            <>
              <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
              <a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
              <a href="#local" onClick={() => setMenuOpen(false)}>Run locally</a>
            </>
          )}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub</a>
          {appMode ? null : <a className="button button--primary" href="/app/">Open Prumo</a>}
        </nav>
      ) : null}
    </header>
  );
}
