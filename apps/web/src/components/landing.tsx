import {
  ArrowDown,
  ArrowRight,
  Check,
  CloudOff,
  Database,
  FileSpreadsheet,
  Landmark,
  LockKeyhole,
  Play,
  ServerOff,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { DEMO_PORTFOLIO } from "../lib";
import { Dashboard } from "./dashboard";
import { GitHubIcon, PrumoLogo, PrumoMark } from "./brand";
import { SiteHeader } from "./site-header";

const GITHUB_URL = "https://github.com/Fialho14/patrimonio";

export function LandingPage() {
  return (
    <div>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <section className="hero">
          <div className="container hero__copy">
            <p className="eyebrow">Private · local-first · open source</p>
            <h1>Know where you stand. Keep it yours.</h1>
            <p className="hero__lede">
              Prumo is a net worth tracker that asks for less. Open your spreadsheet in the browser—no account, bank connection or financial upload—or run it locally with SQLite.
            </p>
            <div className="hero__actions">
              <a className="button button--primary" href="/app/">
                Open Prumo <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="button button--secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon size={16} /> View on GitHub
              </a>
            </div>
            <ul className="hero__proof" aria-label="Prumo Web privacy properties">
              <li><Check size={13} aria-hidden="true" /> No account</li>
              <li><Check size={13} aria-hidden="true" /> No bank connection</li>
              <li><Check size={13} aria-hidden="true" /> No financial upload</li>
              <li><Check size={13} aria-hidden="true" /> No product analytics</li>
            </ul>
          </div>
        </section>

        <div className="product-stage" role="region" aria-label="Live Prumo demo preview">
          <div className="product-frame">
            <div className="product-frame__chrome">
              <span className="product-frame__dots" aria-hidden="true"><span /><span /><span /></span>
              <span className="product-frame__address"><LockKeyhole size={12} aria-hidden="true" /> Processed in this browser</span>
              <span className="demo-label"><Play size={10} fill="currentColor" aria-hidden="true" /> Demo data</span>
            </div>
            <Dashboard portfolio={DEMO_PORTFOLIO} embedded />
          </div>
        </div>

        <section className="section" id="how-it-works">
          <div className="container snapshot-story">
            <div>
              <p className="eyebrow">A quieter kind of finance app</p>
              <h2>Record snapshots, not every coffee.</h2>
              <p className="section__lede">
                Most finance apps start with transactions. Prumo starts with a simpler question: what do you have right now? Add a snapshot whenever it is useful and let the change become visible over time.
              </p>
              <div className="not-this" role="group" aria-label="Things Prumo does not require">
                <span>Receipts</span>
                <span>Expense categories</span>
                <span>Daily bookkeeping</span>
              </div>
            </div>
            <ol className="snapshot-list" aria-label="Example net worth snapshots">
              <li><time dateTime="2026-01-01">1 Jan</time><strong>€3,400</strong><small>First reference</small></li>
              <li><time dateTime="2026-02-01">1 Feb</time><strong>€3,750</strong><small>+ €350</small></li>
              <li><time dateTime="2026-03-01">1 Mar</time><strong>€3,620</strong><small>− €130</small></li>
            </ol>
          </div>
        </section>

        <section className="section section--tint" id="privacy">
          <div className="container">
            <div className="section__header section__header--center">
              <p className="eyebrow">Prumo Web</p>
              <h2>Your file. Your browser. Your data.</h2>
              <p className="section__lede">
                The public app is a static site. Your file is parsed in this browser, the working copy stays in IndexedDB, and exports are created on your device.
              </p>
            </div>
            <div className="privacy-flow" role="group" aria-label="Client-side data flow">
              <div className="privacy-flow__step">
                <FileSpreadsheet size={27} strokeWidth={1.6} aria-hidden="true" />
                <div><strong>Your spreadsheet</strong><span>XLSX or CSV that you own</span></div>
              </div>
              <ArrowRight className="privacy-flow__arrow" size={19} aria-hidden="true" />
              <div className="privacy-flow__step">
                <Landmark size={27} strokeWidth={1.6} aria-hidden="true" />
                <div><strong>Your browser</strong><span>Parsing, editing and storage happen here</span></div>
              </div>
              <ArrowRight className="privacy-flow__arrow" size={19} aria-hidden="true" />
              <div className="privacy-flow__step">
                <ShieldCheck size={27} strokeWidth={1.6} aria-hidden="true" />
                <div><strong>Your dashboard</strong><span>Portable again as XLSX, CSV or JSON</span></div>
              </div>
            </div>
            <div className="absence-grid" role="group" aria-label="Not part of Prumo Web">
              <span><ServerOff size={14} aria-hidden="true" /> No server upload</span>
              <span><CloudOff size={14} aria-hidden="true" /> No cloud account</span>
              <span><Upload size={14} aria-hidden="true" /> No bank connection</span>
              <span><ShieldCheck size={14} aria-hidden="true" /> No product analytics</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section__header">
              <p className="eyebrow">Start with what you already have</p>
              <h2>Bring your spreadsheet. Leave with clarity.</h2>
              <p className="section__lede">
                There is no migration project hiding behind the first screen. Open the Excel or CSV you already use, start with Prumo’s plain template, or see the product immediately with fictitious demo data.
              </p>
            </div>
            <div className="entry-grid">
              <article className="entry-card">
                <span className="entry-card__icon"><FileSpreadsheet size={21} aria-hidden="true" /></span>
                <h3>Open your file</h3>
                <p>Preview dates, categories, errors and duplicates before anything changes.</p>
                <a className="button button--secondary" href="/app/?intent=open">Choose XLSX or CSV</a>
              </article>
              <article className="entry-card">
                <span className="entry-card__icon"><ArrowDown size={21} aria-hidden="true" /></span>
                <h3>Start with a template</h3>
                <p>Five obvious balance columns, three fictitious rows and notes that explain the format.</p>
                <a className="button button--secondary" href="/app/?intent=template">Use the template</a>
              </article>
              <article className="entry-card">
                <span className="entry-card__icon"><Play size={21} aria-hidden="true" /></span>
                <h3>Explore the demo</h3>
                <p>Plausible rises, a few honest dips and no personal information anywhere.</p>
                <a className="button button--primary" href="/app/?intent=demo">Explore demo</a>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="local">
          <div className="container">
            <div className="local-callout">
              <div>
                <p className="eyebrow">Want a permanent local setup?</p>
                <h2>Same philosophy. More persistence.</h2>
                <p>Run the full Prumo Local app on your own computer. It stays on localhost and stores amounts as integer cents in SQLite.</p>
              </div>
              <div>
                <ul className="local-callout__features">
                  <li><Check size={15} aria-hidden="true" /> SQLite with verified migrations</li>
                  <li><Check size={15} aria-hidden="true" /> Automatic and pre-change backups</li>
                  <li><Check size={15} aria-hidden="true" /> Privacy Mode and command palette</li>
                  <li><Check size={15} aria-hidden="true" /> Encrypted-volume support on macOS</li>
                </ul>
                <a className="button button--secondary" href={`${GITHUB_URL}#run-locally`} target="_blank" rel="noreferrer">
                  <Database size={16} aria-hidden="true" /> Run locally
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="container open-source-grid">
            <div className="section__header">
              <p className="eyebrow">Open source by default</p>
              <h2>Privacy you can inspect.</h2>
              <p className="section__lede">
                Read the data flow, audit the static build, run every test and contribute. Prumo’s privacy model is an engineering decision, not a trust-me badge.
              </p>
              <div className="hero__actions" style={{ justifyContent: "flex-start" }}>
                <a className="button button--primary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GitHubIcon size={16} /> Browse the code
                </a>
                <a className="button button--secondary" href="/privacy/">Read privacy details</a>
              </div>
            </div>
            <div className="code-card" role="region" aria-label="Prumo Web architecture summary">
              <div className="code-card__header"><span>prumo-web/data-flow.txt</span><span>public</span></div>
              <pre><span className="code-accent">prumo.xlsx</span>{"\n"}  ↓ File API{"\n"}<span className="code-accent">browser parser</span>{"\n"}  ↓ validated model{"\n"}<span className="code-accent">IndexedDB</span>{"\n"}  ↓ local edits{"\n"}<span className="code-accent">XLSX · CSV · JSON</span>{"\n\n"}fetch(financialData) <span className="code-accent">{"// never"}</span></pre>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container name-story">
            <PrumoMark className="name-story__mark" />
            <div>
              <p className="eyebrow">Why “Prumo”?</p>
              <blockquote>Know where you stand.</blockquote>
              <p>
                Prumo is Portuguese for a plumb line—a simple reference that shows when something is truly aligned. The product does the same with your net worth: one clear point, then another.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <PrumoLogo />
          <nav className="site-footer__links" aria-label="Footer navigation">
            <a href="/app/">Open Prumo</a>
            <a href="/privacy/">Privacy & security</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <span>MIT licensed</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
