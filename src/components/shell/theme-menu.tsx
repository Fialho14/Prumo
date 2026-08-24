"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useTheme, type ThemePreference } from "@/components/shell/theme-provider";
import { IconButton } from "@/components/ui/button";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

export function ThemeMenu() {
  const { theme, resolvedTheme, isReady, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const ActiveIcon = !isReady || theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  useEffect(() => {
    if (!isOpen) return;

    const selectedIndex = Math.max(0, OPTIONS.findIndex((option) => option.value === theme));
    const focusIndex = pendingFocusIndexRef.current ?? selectedIndex;
    pendingFocusIndexRef.current = null;
    const focusFrame = window.requestAnimationFrame(() => optionRefs.current[focusIndex]?.focus());

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, theme]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1 + OPTIONS.length) % OPTIONS.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex <= 0 ? OPTIONS.length : currentIndex) - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = OPTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="theme-menu" ref={containerRef}>
      <IconButton
        ref={triggerRef}
        aria-label="Escolher tema"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "theme-menu-options" : undefined}
        onClick={() => {
          if (isOpen) pendingFocusIndexRef.current = null;
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (isOpen) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            pendingFocusIndexRef.current = event.key === "ArrowDown" ? 0 : OPTIONS.length - 1;
            setIsOpen(true);
          } else if (event.key === "Enter" || event.key === " ") {
            pendingFocusIndexRef.current = 0;
          }
        }}
      >
        <ActiveIcon size={18} strokeWidth={1.8} aria-hidden="true" />
      </IconButton>

      {isOpen ? (
        <div
          className="theme-menu__popover"
          id="theme-menu-options"
          role="menu"
          aria-label="Tema da aplicação"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="theme-menu__label" aria-hidden="true">Aparência</div>
          {OPTIONS.map((option, index) => {
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className="theme-menu__option"
                role="menuitemradio"
                aria-checked={theme === option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                tabIndex={theme === option.value ? 0 : -1}
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <OptionIcon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{option.label}</span>
                {theme === option.value ? (
                  <Check className="theme-menu__check" size={15} strokeWidth={2} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
