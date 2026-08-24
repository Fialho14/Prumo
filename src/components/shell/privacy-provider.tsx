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

type PrivacyContextValue = {
  isPrivacyMode: boolean;
  isReady: boolean;
  setPrivacyMode: (enabled: boolean) => void;
  togglePrivacyMode: () => void;
};

const STORAGE_KEY = "prumo:privacy";
const STORAGE_VERSION = 1;
const CHANGE_EVENT = "prumo:privacy-change";
const PrivacyContext = createContext<PrivacyContextValue | null>(null);
let memoryPreference = false;

function readStoredPrivacy(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryPreference;
    const parsed = JSON.parse(raw) as { version?: unknown; enabled?: unknown };
    return parsed.version === STORAGE_VERSION && typeof parsed.enabled === "boolean"
      ? parsed.enabled
      : memoryPreference;
  } catch {
    return memoryPreference;
  }
}

function subscribeToPrivacy(onStoreChange: () => void): () => void {
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

function writeStoredPrivacy(enabled: boolean): void {
  memoryPreference = enabled;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, enabled }),
    );
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribeToPrivacy, readStoredPrivacy, () => true);
  // React uses the server snapshot during hydration and switches after it is safe to reveal data.
  const isReady = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  const setPrivacyMode = useCallback((nextEnabled: boolean) => {
    writeStoredPrivacy(nextEnabled);
  }, []);

  const togglePrivacyMode = useCallback(() => {
    writeStoredPrivacy(!readStoredPrivacy());
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (event.repeat) return;
        togglePrivacyMode();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [togglePrivacyMode]);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      isPrivacyMode: !isReady || enabled,
      isReady,
      setPrivacyMode,
      togglePrivacyMode,
    }),
    [enabled, isReady, setPrivacyMode, togglePrivacyMode],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error("usePrivacy tem de ser usado dentro de PrivacyProvider.");
  return context;
}
