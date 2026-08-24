"use client";

import {
  ArchiveRestore,
  EyeOff,
  FolderCog,
  History,
  Landmark,
  Palette,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { usePrivacy } from "@/components/shell/privacy-provider";
import { useTheme } from "@/components/shell/theme-provider";
import { KeyboardKey } from "@/components/ui/keyboard-key";

type CommandPaletteContextValue = {
  isOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
};

type CommandAction = {
  id: string;
  label: string;
  meta?: string;
  keywords: string;
  icon: LucideIcon;
  run: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT")
    .trim();
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openCommandPalette = useCallback(() => setIsOpen(true), []);
  const closeCommandPalette = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (event.repeat) return;
        setIsOpen((current) => !current);
      }
    };

    const handleExternalOpen = () => setIsOpen(true);
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("prumo:open-command-palette", handleExternalOpen);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("prumo:open-command-palette", handleExternalOpen);
    };
  }, []);

  const contextValue = useMemo(
    () => ({ isOpen, openCommandPalette, closeCommandPalette }),
    [closeCommandPalette, isOpen, openCommandPalette],
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette tem de ser usado dentro de CommandPaletteProvider.");
  }
  return context;
}

export function openCommandPalette(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("prumo:open-command-palette"));
  }
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { theme, cycleTheme } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "update",
        label: "Atualizar património",
        meta: "Novo snapshot",
        keywords: "atualizar novo snapshot registo patrimonio",
        icon: Plus,
        run: () => go("/registos/novo"),
      },
      {
        id: "plan-purchase",
        label: "Simular uma compra grande",
        meta: "Nada é guardado",
        keywords: "compra grande gastar sobra simular cenario dinheiro fontes",
        icon: ShoppingBag,
        run: () => go("/planear-compra"),
      },
      {
        id: "overview",
        label: "Ir para visão geral",
        keywords: "inicio home dashboard patrimonio",
        icon: Landmark,
        run: () => go("/"),
      },
      {
        id: "history",
        label: "Ver histórico",
        keywords: "snapshots registos timeline evolucao",
        icon: History,
        run: () => go("/historico"),
      },
      {
        id: "categories",
        label: "Gerir categorias",
        keywords: "categorias contas ordem cores icones",
        icon: FolderCog,
        run: () => go("/categorias"),
      },
      {
        id: "backup",
        label: "Criar backup",
        meta: "JSON completo",
        keywords: "exportar copia seguranca dados json csv",
        icon: ArchiveRestore,
        run: () => go("/definicoes/backups?acao=criar"),
      },
      {
        id: "privacy",
        label: isPrivacyMode ? "Mostrar valores" : "Ocultar valores",
        meta: "⌘ ⇧ P",
        keywords: "privacidade esconder ocultar mostrar montantes",
        icon: EyeOff,
        run: () => {
          togglePrivacyMode();
          onOpenChange(false);
        },
      },
      {
        id: "theme",
        label: "Mudar tema",
        meta: theme === "system" ? "Sistema" : theme === "light" ? "Claro" : "Escuro",
        keywords: "tema aparencia claro escuro sistema",
        icon: Palette,
        run: () => {
          cycleTheme();
          onOpenChange(false);
        },
      },
      {
        id: "settings",
        label: "Ir para definições",
        keywords: "configuracao base dados importar exportar",
        icon: Settings,
        run: () => go("/definicoes"),
      },
    ],
    [cycleTheme, go, isPrivacyMode, onOpenChange, theme, togglePrivacyMode],
  );

  const normalizedQuery = normalizeSearch(query);
  const filteredActions = useMemo(() => {
    if (!normalizedQuery) return actions;
    return actions.filter((action) =>
      normalizeSearch(`${action.label} ${action.keywords}`).includes(normalizedQuery),
    );
  }, [actions, normalizedQuery]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      setQuery("");
      setSelectedIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const activeIndex = selectedIndex < filteredActions.length ? selectedIndex : 0;

  const runSelectedAction = () => {
    filteredActions[activeIndex]?.run();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % Math.max(filteredActions.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(
        (current) => (current - 1 + Math.max(filteredActions.length, 1)) % Math.max(filteredActions.length, 1),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSelectedAction();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="command-palette"
      aria-labelledby="command-palette-title"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <h2 id="command-palette-title" className="sr-only">
        Comandos rápidos
      </h2>
      <div className="command-palette__search">
        <Search size={19} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={inputRef}
          className="command-palette__input"
          type="search"
          value={query}
          placeholder="Procurar uma ação…"
          aria-label="Procurar uma ação"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="command-results"
          aria-activedescendant={filteredActions[activeIndex]?.id}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
        />
        <KeyboardKey>esc</KeyboardKey>
      </div>

      <ul id="command-results" className="command-palette__results" role="listbox">
        {filteredActions.length > 0 ? (
          <>
            <li className="command-palette__section-label" role="presentation" aria-hidden="true">
              Ações
            </li>
            {filteredActions.map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <li key={action.id} role="presentation">
                  <button
                    id={action.id}
                    type="button"
                    className="command-palette__item"
                    role="option"
                    aria-selected={activeIndex === index}
                    tabIndex={-1}
                    onMouseMove={() => setSelectedIndex(index)}
                    onClick={action.run}
                  >
                    <span className="command-palette__item-icon" aria-hidden="true">
                      <ActionIcon size={16} strokeWidth={1.8} />
                    </span>
                    <span>{action.label}</span>
                    {action.meta ? (
                      <span className="command-palette__item-meta">{action.meta}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </>
        ) : (
          <li className="command-palette__empty">Nenhuma ação encontrada.</li>
        )}
      </ul>

      <div className="command-palette__footer" aria-hidden="true">
        <span className="command-palette__hint">
          <KeyboardKey>↑</KeyboardKey>
          <KeyboardKey>↓</KeyboardKey>
          navegar
        </span>
        <span className="command-palette__hint">
          <KeyboardKey>↵</KeyboardKey>
          abrir
        </span>
      </div>
    </dialog>
  );
}
