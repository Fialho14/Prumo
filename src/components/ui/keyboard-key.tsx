import type { HTMLAttributes } from "react";

export function KeyboardKey({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd className={["ui-kbd", className].filter(Boolean).join(" ")} {...props} />;
}
