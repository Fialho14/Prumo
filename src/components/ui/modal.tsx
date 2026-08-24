"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

type ModalProps = {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  dismissDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy: string;
  onDismiss: () => void;
  open: boolean;
  role?: "dialog" | "alertdialog";
};

/**
 * Modal local assente no elemento nativo <dialog>.
 *
 * showModal() fornece o focus trap e torna o resto da página inerte. O fecho
 * continua controlado por React para que Escape e o backdrop possam ser
 * bloqueados enquanto uma operação destrutiva está em curso.
 */
export function Modal({
  children,
  className,
  describedBy,
  dismissDisabled = false,
  initialFocusRef,
  labelledBy,
  onDismiss,
  open,
  role = "dialog",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    const activeElement = document.activeElement;
    previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;

    if (!dialog.open) dialog.showModal();

    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef?.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (dialog.open) dialog.close();

      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [initialFocusRef, open]);

  const requestDismiss = () => {
    if (!dismissDisabled) onDismiss();
  };

  return (
    <dialog
      aria-busy={dismissDisabled || undefined}
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        requestDismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) requestDismiss();
      }}
      ref={dialogRef}
      role={role}
    >
      {children}
    </dialog>
  );
}
