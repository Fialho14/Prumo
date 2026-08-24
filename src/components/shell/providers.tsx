"use client";

import type { ReactNode } from "react";

import { CommandPaletteProvider } from "@/components/shell/command-palette";
import { PrivacyProvider } from "@/components/shell/privacy-provider";
import { ThemeProvider } from "@/components/shell/theme-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
