"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { usePrivacy } from "@/components/shell/privacy-provider";
import { formatCurrency, formatSignedCurrency } from "@/lib/domain/money";

type SharedProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  mask?: string;
  hiddenLabel?: string;
};

type CentsProps = SharedProps & {
  amountCents: number;
  children?: never;
  hideZeroCents?: boolean;
  showSign?: boolean;
};

type ContentProps = SharedProps & {
  amountCents?: never;
  children: ReactNode;
  hideZeroCents?: never;
  showSign?: never;
};

export type PrivateAmountProps = CentsProps | ContentProps;

export function PrivateAmount({
  amountCents,
  children,
  hideZeroCents = true,
  showSign = false,
  mask = "•••• €",
  hiddenLabel = "Valor oculto pelo modo de privacidade",
  className,
  ...props
}: PrivateAmountProps) {
  const { isPrivacyMode } = usePrivacy();
  const content =
    amountCents === undefined
      ? children
      : showSign
        ? hideZeroCents
          ? formatSignedCurrency(amountCents)
          : amountCents === 0
            ? formatCurrency(0, false)
            : `${amountCents > 0 ? "+" : "−"}${formatCurrency(Math.abs(amountCents), false)}`
        : formatCurrency(amountCents, hideZeroCents);

  if (isPrivacyMode) {
    return (
      <span
        {...props}
        className={["numeric", className].filter(Boolean).join(" ")}
        aria-label={hiddenLabel}
      >
        <span aria-hidden="true">{mask}</span>
      </span>
    );
  }

  return (
    <span className={["numeric", className].filter(Boolean).join(" ")} {...props}>
      {content}
    </span>
  );
}
