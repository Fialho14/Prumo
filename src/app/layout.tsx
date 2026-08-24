import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { AppProviders } from "@/components/shell/providers";
import { inspectDatabaseStatus } from "@/lib/db/client";
import { getMeta } from "@/lib/services/meta";

import "./globals.css";

const themeBootScript = `
  (() => {
    try {
      const raw = localStorage.getItem("prumo:theme");
      const parsed = raw ? JSON.parse(raw) : null;
      const preference = parsed && parsed.version === 1 ? parsed.value : "system";
      const valid = preference === "light" || preference === "dark" || preference === "system";
      const selected = valid ? preference : "system";
      const resolved = selected === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : selected;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = selected;
    } catch {
      document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.themePreference = "system";
    }
  })();
`;

export const metadata: Metadata = {
  title: {
    default: "Prumo — Património pessoal",
    template: "%s · Prumo",
  },
  description: "Uma visão local, privada e clara do teu património.",
  applicationName: "Prumo",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f0d" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let demoMode = false;
  try {
    const status = await inspectDatabaseStatus();
    if (status.code === "ready") {
      demoMode = (await getMeta("data_mode", "personal")) === "demo";
    }
  } catch {
    // As páginas apresentam o estado detalhado da base de dados. O layout nunca
    // deve impedir essa recuperação por causa de uma preferência opcional.
  }
  return (
    <html lang="pt-PT" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <AppProviders>
          <AppShell demoMode={demoMode}>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
