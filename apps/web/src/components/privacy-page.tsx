import { Check, Info } from "lucide-react";
import { GitHubIcon, PrumoLogo } from "./brand";
import { SiteHeader } from "./site-header";

const GITHUB_URL = "https://github.com/Fialho14/patrimonio";

function PrivacyItem({ children }: { children: React.ReactNode }) {
  return <li><Check size={15} strokeWidth={2} aria-hidden="true" /><span>{children}</span></li>;
}

export function PrivacyPage() {
  return (
    <div>
      <a className="skip-link" href="#privacy-content">Skip to content</a>
      <SiteHeader />
      <main className="privacy-page" id="privacy-content">
        <div className="container">
          <header className="privacy-page__header">
            <p className="eyebrow">Privacy & security</p>
            <h1>Plain facts, not vague promises.</h1>
            <p className="privacy-page__lede">
              Prumo has two modes with different storage architectures. Both avoid accounts and bank connections, but “local” means something specific in each one.
            </p>
            <p className="privacy-page__updated">Architecture statement for Prumo v0.1.0 · 24 August 2026</p>
          </header>

          <div className="privacy-mode-grid">
            <article className="privacy-mode-card">
              <p className="eyebrow">Prumo Web</p>
              <h2>Inside your browser</h2>
              <p>The hosted experience is a static React application. It has no financial API route and no server-side financial storage.</p>
              <ul className="plain-list">
                <PrivacyItem>XLSX and CSV files are read with the browser File API; their contents are not submitted to the host.</PrivacyItem>
                <PrivacyItem>The workbook parser is loaded only when you import or export a spreadsheet.</PrivacyItem>
                <PrivacyItem>The working portfolio is stored in IndexedDB on this browser and origin—not in localStorage.</PrivacyItem>
                <PrivacyItem>Theme and Privacy Mode are the only small preferences stored in localStorage.</PrivacyItem>
                <PrivacyItem>XLSX, CSV and complete JSON exports are generated on the device.</PrivacyItem>
                <PrivacyItem>There is no account, bank connection, product analytics SDK or telemetry in the Web app.</PrivacyItem>
              </ul>
            </article>

            <article className="privacy-mode-card">
              <p className="eyebrow">Prumo Local</p>
              <h2>On your computer</h2>
              <p>The full application runs as a Next.js server bound explicitly to <code>127.0.0.1</code> and stores the portfolio in SQLite.</p>
              <ul className="plain-list">
                <PrivacyItem>Imports are posted only to the local Prumo process, then validated before a confirmed write.</PrivacyItem>
                <PrivacyItem>SQLite uses foreign keys, durable writes, integrity checks and integer cents.</PrivacyItem>
                <PrivacyItem>Automatic, pre-change and pre-migration backups stay in a local directory you choose.</PrivacyItem>
                <PrivacyItem>Host and Origin checks reject non-local requests; security headers deny framing and unnecessary device capabilities.</PrivacyItem>
                <PrivacyItem>On macOS, the database and backups can live on an encrypted volume that Prumo never unlocks or receives a password for.</PrivacyItem>
                <PrivacyItem>No account, cloud sync, bank API, product analytics or external financial service is required.</PrivacyItem>
              </ul>
            </article>
          </div>

          <div className="privacy-note">
            <strong>What Privacy Mode does—and does not do.</strong><br />
            Privacy Mode hides amounts on screen. It is useful when someone can see your display, but it is not encryption, access control or a substitute for locking your device and storage volume.
          </div>

          <section className="section" style={{ paddingBottom: 0 }}>
            <div className="section__header">
              <p className="eyebrow">Boundaries worth knowing</p>
              <h2>Your browser and host still exist.</h2>
              <p className="section__lede">
                A static host can keep ordinary access logs for requests to HTML, CSS and JavaScript. Those requests do not contain your imported file or portfolio values. Browser extensions, malware, an unlocked device or a compromised browser can still access what you can access; Prumo cannot protect against a compromised environment.
              </p>
            </div>
            <div className="privacy-note">
              <Info size={16} aria-hidden="true" /> Clearing site data in your browser removes Prumo Web’s IndexedDB copy. Export first if it is the only copy you want to keep.
            </div>
          </section>

          <section className="section" style={{ paddingBottom: 0 }}>
            <div className="section__header">
              <p className="eyebrow">Verify it</p>
              <h2>The implementation is public.</h2>
              <p className="section__lede">
                The repository documents its data flow, build boundary, browser network audit and responsible disclosure process. Security reports should follow SECURITY.md rather than a public issue.
              </p>
              <div className="hero__actions" style={{ justifyContent: "flex-start" }}>
                <a className="button button--primary" href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubIcon size={16} /> Inspect the code</a>
                <a className="button button--secondary" href="/app/">Open Prumo Web</a>
              </div>
            </div>
          </section>
        </div>
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <PrumoLogo />
          <nav className="site-footer__links" aria-label="Footer navigation">
            <a href="/">Product</a>
            <a href="/app/">Open Prumo</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
