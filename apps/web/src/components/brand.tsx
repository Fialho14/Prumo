type LogoProps = {
  compact?: boolean;
  className?: string;
};

export function PrumoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="42" height="42" rx="13" fill="currentColor" />
      <path d="M22 8.5V25" stroke="var(--mark-cut, white)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="9" r="2.4" fill="var(--mark-cut, white)" />
      <path d="M16.8 27.2 22 19.8l5.2 7.4L22 35.5l-5.2-8.3Z" fill="var(--mark-cut, white)" />
      <path d="M19.2 27.2h5.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".52" />
    </svg>
  );
}

export function PrumoLogo({ compact = false, className }: LogoProps) {
  return (
    <span className={["brand", className].filter(Boolean).join(" ")}>
      <PrumoMark className="brand__mark" />
      {compact ? null : <span className="brand__word">Prumo</span>}
    </span>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.55 9.55 0 0 1 12 6.84c.85 0 1.71.11 2.51.33 1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
