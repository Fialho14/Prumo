# Contributing to Prumo

Thank you for helping improve Prumo. Contributions should reinforce the product's four priorities: simplicity, privacy, local ownership, and portability.

## Start with product fit

Prumo is a snapshot-based net worth tracker with a browser-local Web edition and a localhost SQLite edition. It is intentionally not a budgeting app, transaction ledger, bank aggregator, cloud-sync service, multi-user product, subscription, advertising surface, or AI adviser.

Before proposing a large feature, read [the product decisions](docs/product-decisions.md). An implementation can be technically sound and still be outside Prumo's scope.

Good contributions include:

- import, validation, export, or portability improvements;
- clear fixes to snapshot calculations and presentation;
- browser compatibility and progressive enhancement;
- accessibility, responsive behaviour, and visual consistency;
- privacy or security hardening;
- tests and documentation that make existing behaviour easier to verify;
- careful reduction of duplication between Web and Local.

## Never use real financial data

Use only synthetic fixtures and the clearly labelled demo dataset.

Do not commit or attach:

- personal XLSX, CSV, JSON, SQLite, backup, or export files;
- real balances, categories, notes, dates, account names, or file hashes;
- personal names, email addresses, paths, volume names, browser history, or screenshots;
- logs or recordings that may reveal any of the above.

The repository ignores common financial-file formats as a safety net. That is not a substitute for reviewing `git status`, staged changes, generated artifacts, and commit history.

If a bug needs a fixture, reduce it to the smallest synthetic example. Use values and names that are unmistakably fictional.

## Development setup

Prumo currently requires Node.js 22 or later.

```sh
npm install
```

### Prumo Web

```sh
npm run web:dev
```

Before submitting a Web change:

```sh
npm run web:test
npm run web:build
```

### Prumo Local

The complete operational setup is documented in [docs/local-setup.md](docs/local-setup.md). Start the Local edition with:

```sh
npm run finance
```

Run all existing Local checks before submitting a change:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Do not point a development branch or test command at a database containing personal data. Use temporary test databases and synthetic seeds.

## Architecture boundaries

Keep domain logic independent of its storage adapter where practical.

- shared code may define types, validation, money/date formatting, snapshot calculations, chart logic, import/export rules, and UI primitives;
- Web-specific code owns browser file access and IndexedDB;
- Local-specific code owns SQLite, filesystem backups, localhost routes, and macOS launcher behaviour;
- the public Web app must not gain a route that accepts financial files;
- File System Access APIs must remain progressive enhancement, not a requirement;
- local storage is for small non-financial preferences, not financial datasets.

Avoid moving files into a new monorepo layer only for visual symmetry. Refactors should reduce a demonstrated duplication or clarify a real runtime boundary.

## Privacy review

Any change that adds or modifies a request, third-party script, dependency, service worker, error reporter, external asset, or persistence mechanism needs an explicit privacy review.

For Prumo Web, verify with synthetic distinctive values that file bytes, category names, notes, balances, and derived snapshots do not appear in requests. Document the hosted-build network audit before release.

Do not add analytics, telemetry, advertising, authentication, cloud storage, bank APIs, or remote financial processing.

The `xlsx` dependency is pinned to SheetJS's official tarball with an integrity hash in the lockfile. Registry-based Dependabot updates may not cover that source completely. Review its upstream releases and security notices manually before changing the URL or integrity entry.

## Accessibility and interface review

Interface changes should preserve:

- semantic headings, labels, tables, lists, and buttons;
- complete keyboard operation and visible focus;
- appropriate names, descriptions, live regions, and error messages;
- light and dark contrast;
- reduced-motion behaviour;
- layouts designed for mobile rather than merely compressed;
- Privacy Mode without accidental value disclosure during hydration.

Use the actual application with fictional demo data for visual review. Public screenshots must follow [the screenshot policy](docs/screenshots/README.md).

## Pull requests

Keep pull requests focused. Explain the product reason, the runtime boundary affected, and how the change was verified. Include screenshots only for visible changes and only with reviewed demo data.

Before opening a pull request:

1. review the diff and `git status` for personal or generated files;
2. run the relevant Web and Local checks;
3. test light, dark, keyboard, and responsive behaviour when the UI changes;
4. repeat the no-upload audit when network behaviour changes;
5. update documentation when a privacy claim, format, or limitation changes.

Use the pull request template as the final checklist.

## Security reports

Do not disclose a vulnerability or real data in a public issue. Follow [SECURITY.md](SECURITY.md) for private reporting.
