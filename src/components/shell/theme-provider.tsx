"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isReady: boolean;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
};

const STORAGE_KEY = "prumo:theme";
const STORAGE_VERSION = 1;
const CHANGE_EVENT = "prumo:theme-change";
const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
let memoryTheme: ThemePreference = "system";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredTheme(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryTheme;
    const parsed = JSON.parse(raw) as { version?: unknown; value?: unknown };
    return parsed.version === STORAGE_VERSION && isTheme(parsed.value) ? parsed.value : memoryTheme;
  } catch {
    return memoryTheme;
  }
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

function writeStoredTheme(theme: ThemePreference): void {
  memoryTheme = theme;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, value: theme }),
    );
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeToColourScheme(onStoreChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

function resolveTheme(theme: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (theme !== "system") return theme;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribeToTheme,
    readStoredTheme,
    () => "system",
  );
  const prefersDark = useSyncExternalStore(subscribeToColourScheme, getPrefersDark, () => false);
  const isReady = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useEffect(() => {
    if (!isReady) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = theme;
  }, [isReady, resolvedTheme, theme]);

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    writeStoredTheme(nextTheme);
  }, []);

  const cycleTheme = useCallback(() => {
    const index = THEME_ORDER.indexOf(theme);
    writeStoredTheme(THEME_ORDER[(index + 1) % THEME_ORDER.length]);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, isReady, setTheme, cycleTheme }),
    [cycleTheme, isReady, resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme tem de ser usado dentro de ThemeProvider.");
  return context;
}
