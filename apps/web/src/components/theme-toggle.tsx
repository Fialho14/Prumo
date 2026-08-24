import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "prumo:web-theme:v1";
const THEMES: ThemePreference[] = ["system", "light", "dark"];

function storedTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: ThemePreference) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
}

export function initialiseTheme() {
  applyTheme(storedTheme());
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(() => storedTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The theme still works for the current tab when preferences cannot persist.
    }

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  const label = theme === "system" ? "System theme" : theme === "light" ? "Light theme" : "Dark theme";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <button
      className="icon-button"
      type="button"
      aria-label={`${label}. Change theme.`}
      title={`${label}. Change theme.`}
      onClick={() => setTheme((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length])}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
