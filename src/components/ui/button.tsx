import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "default" | "compact";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export function buttonClassName({
  variant = "primary",
  size = "default",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return [
    "ui-button",
    `ui-button--${variant}`,
    size === "compact" ? "ui-button--compact" : "",
    fullWidth ? "ui-button--full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleOptions;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});

export type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  ButtonStyleOptions;

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant, size, fullWidth, className, ...props },
  ref,
) {
  return (
    <Link
      ref={ref}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={["ui-icon-button", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
});
