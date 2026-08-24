import { Download, Eye, EyeOff, FileJson, FileSpreadsheet, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDemoPortfolio,
  createTemplatePortfolio,
  deletePortfolioDatabase,
  exportPortfolioCsv,
  exportPortfolioJson,
  exportPortfolioXlsx,
  loadPortfolio,
  parseFinancialFile,
  portfolioExportFilename,
  savePortfolio,
  triggerDownload,
  type FinancialFile,
  type FinancialImportResult,
  type WebPortfolio,
} from "./lib";
import { Dashboard } from "./components/dashboard";
import { ImportDialog } from "./components/import-dialog";
import { LandingPage } from "./components/landing";
import { PrivacyPage } from "./components/privacy-page";
import { SiteHeader } from "./components/site-header";
import { SnapshotDialog } from "./components/snapshot-dialog";
import { Welcome, type WelcomeIntent } from "./components/welcome";

const PRIVACY_KEY = "prumo:web-privacy:v1";

function initialPrivacyMode() {
  try {
    return window.localStorage.getItem(PRIVACY_KEY) === "true";
  } catch {
    return false;
  }
}

function currentIntent(): WelcomeIntent {
  const value = new URLSearchParams(window.location.search).get("intent");
  return value === "open" || value === "template" || value === "demo" ? value : null;
}

function WebExperience() {
  const [portfolio, setPortfolio] = useState<WebPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [importState, setImportState] = useState<{ file: FinancialFile; result: FinancialImportResult } | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [privateMode, setPrivateMode] = useState(initialPrivacyMode);
  const [welcomeIntent] = useState<WelcomeIntent>(currentIntent);
  const appliedIntent = useRef(false);

  const persist = useCallback(async (nextPortfolio: WebPortfolio) => {
    setPortfolio(nextPortfolio);
    try {
      await savePortfolio(nextPortfolio);
      setStorageWarning(null);
    } catch (storageError) {
      setStorageWarning(
        `${storageError instanceof Error ? storageError.message : "Browser storage is unavailable."} The current tab still works; export before closing it.`,
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadPortfolio()
      .then(async (stored) => {
        if (!active) return;
        if (!stored && (welcomeIntent === "demo" || welcomeIntent === "template")) {
          appliedIntent.current = true;
          const next = welcomeIntent === "demo" ? createDemoPortfolio() : createTemplatePortfolio();
          await persist(next);
          window.history.replaceState(null, "", "/app/");
          return;
        }
        setPortfolio(stored);
      })
      .catch((loadError) => {
        if (!active) return;
        setStorageWarning(loadError instanceof Error ? loadError.message : "Browser storage could not be read.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [persist, welcomeIntent]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRIVACY_KEY, String(privateMode));
    } catch {
      // Privacy Mode still works for this tab if interface preferences cannot persist.
    }
  }, [privateMode]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLocaleLowerCase("en") === "p") {
        event.preventDefault();
        setPrivateMode((current) => !current);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const chooseFile = async (file: FinancialFile) => {
    setBusy(true);
    setError(null);
    try {
      const result = await parseFinancialFile(file);
      setImportState({ file, result });
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "This file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const template = createTemplatePortfolio();
      triggerDownload(await exportPortfolioXlsx(template), "prumo-template.xlsx");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The template could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const exportData = async (format: "xlsx" | "csv" | "json") => {
    if (!portfolio) return;
    setBusy(true);
    setError(null);
    try {
      const blob = format === "xlsx"
        ? await exportPortfolioXlsx(portfolio)
        : format === "csv"
          ? exportPortfolioCsv(portfolio)
          : exportPortfolioJson(portfolio);
      triggerDownload(blob, portfolioExportFilename(portfolio, format));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The export could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const clearData = async () => {
    if (!window.confirm("Remove Prumo Web data from this browser? Export first if this is your only copy.")) return;
    setBusy(true);
    setError(null);
    try {
      await deletePortfolioDatabase();
      setPortfolio(null);
      setStorageWarning(null);
      appliedIntent.current = true;
      window.history.replaceState(null, "", "/app/");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Browser data could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="web-app">
        <SiteHeader appMode />
        <main className="loading-screen" aria-live="polite">Opening browser-local data…</main>
      </div>
    );
  }

  return (
    <div className="web-app">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader appMode />
      {portfolio ? (
        <main className="workspace" id="main-content">
          {storageWarning ? <div className="error-banner" role="alert">{storageWarning}</div> : null}
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          <div className="workspace__toolbar">
            <div className="workspace__status">
              <span className="local-status"><ShieldCheck size={14} aria-hidden="true" /> {storageWarning ? "Current tab only" : "Stored in this browser"}</span>
              <span className="demo-label">{portfolio.mode === "personal" ? "Your data" : portfolio.mode === "demo" ? "Demo" : "Template"}</span>
            </div>
            <div className="workspace__actions">
              <button
                className="icon-button"
                type="button"
                aria-label={privateMode ? "Show financial values" : "Hide financial values"}
                aria-pressed={privateMode}
                onClick={() => setPrivateMode((current) => !current)}
              >
                {privateMode ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
              </button>
              <button className="button button--secondary button--compact" type="button" disabled={busy} onClick={() => void exportData("xlsx")}>
                <FileSpreadsheet size={14} aria-hidden="true" /> XLSX
              </button>
              <button className="button button--secondary button--compact" type="button" disabled={busy} onClick={() => void exportData("csv")}>
                <Download size={14} aria-hidden="true" /> CSV
              </button>
              <button className="button button--secondary button--compact" type="button" disabled={busy} onClick={() => void exportData("json")}>
                <FileJson size={14} aria-hidden="true" /> JSON
              </button>
              <button className="button button--ghost button--compact" type="button" disabled={busy} onClick={() => void clearData()}>
                <RotateCcw size={14} aria-hidden="true" /> Change data
              </button>
            </div>
          </div>
          <Dashboard
            portfolio={portfolio}
            privateMode={privateMode}
            onTogglePrivacy={() => setPrivateMode((current) => !current)}
            onUpdate={() => setSnapshotOpen(true)}
          />
        </main>
      ) : (
        <Welcome
          intent={welcomeIntent}
          busy={busy}
          error={error}
          onChooseFile={(file) => void chooseFile(file)}
          onStartTemplate={() => void persist(createTemplatePortfolio())}
          onDownloadTemplate={() => void downloadTemplate()}
          onStartDemo={() => void persist(createDemoPortfolio())}
          onStartEmpty={() => {
            const empty = createTemplatePortfolio();
            void persist({ ...empty, title: "My Prumo", mode: "personal", snapshots: [] });
          }}
        />
      )}

      {importState ? (
        <ImportDialog
          file={importState.file}
          initialResult={importState.result}
          onClose={() => setImportState(null)}
          onImport={persist}
        />
      ) : null}
      {snapshotOpen && portfolio ? (
        <SnapshotDialog portfolio={portfolio} onClose={() => setSnapshotOpen(false)} onSave={persist} />
      ) : null}
    </div>
  );
}

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") return <WebExperience />;
  if (path === "/privacy") return <PrivacyPage />;
  return <LandingPage />;
}
