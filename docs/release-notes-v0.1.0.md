# Prumo v0.1.0 release notes

> **Release status:** prepared, not published.

## Know where you stand. Keep it yours.

Prumo v0.1.0 introduces one product philosophy in two forms: a browser edition for the easiest private trial and a localhost edition for durable SQLite storage.

No account, bank connection, transaction feed, or cloud financial database is required.

## Prumo Web

- open XLSX and CSV files with client-side processing;
- preview dates, categories, snapshots, invalid rows, exact duplicates, date conflicts, and unknown columns before accepting an import;
- start from a simple Prumo spreadsheet template;
- explore a clearly labelled fictional demo;
- keep working data in IndexedDB rather than local storage;
- export XLSX, CSV, and complete JSON;
- use manual open and download as the compatible baseline, without retaining a browser file handle;
- switch between light and dark themes and hide values with visual Privacy Mode;
- use responsive layouts across desktop, laptop, tablet, and mobile.

Prumo Web is a static client-side application. It has no route that accepts financial files and no server-side financial store.

## Prumo Local

The existing Local edition remains intact and continues to provide:

- SQLite storage with integer-cent values and referential integrity;
- explicit localhost binding and local host/origin checks;
- XLSX and CSV import with preview and transactional commit;
- snapshot quick edit and full history editing;
- verified JSON backups, readable CSV export, automatic backup scheduling, and validated restore;
- pre-migration and pre-destructive-change safety copies;
- private-volume availability checks without a silent fallback database;
- Privacy Mode, themes, keyboard navigation, and a command palette;
- a temporary large-purchase simulator that does not write to SQLite.

## Privacy

Prumo Web processes financial files in the browser. The public host serves application assets but does not need to receive the file, derived balances, notes, or snapshot model. There is no account, bank connection, product analytics, telemetry, or server-side financial storage.

Prumo Local processes imports through the localhost application and stores data at local user-controlled paths. Optional macOS encrypted-volume storage protects data at rest when the volume is locked. Privacy Mode is visual concealment, not encryption.

See [privacy and security](privacy-and-security.md) for the full boundaries and limitations.

## Quick start

### Web

```sh
npm install
npm run web:dev
```

Then choose **Open your file**, **Start with a template**, or **Explore demo**.

To verify the static production build:

```sh
npm run web:test
npm run web:build
```

### Local

Prumo Local currently requires macOS and Node.js 22 or later.

```sh
npm run finance
```

Open `http://127.0.0.1:3000` if the launcher does not open it automatically. Read the [complete Local setup guide](local-setup.md) before configuring a private volume or restoring a backup.

## Screenshots

Release screenshots live in [`docs/screenshots/`](screenshots/) and use only the labelled fictional demo dataset or the dedicated synthetic import fixture. The v0.1.0 set includes:

- Web dashboard;
- Local dashboard;
- light and dark themes;
- import preview;
- simulator;
- mobile layout;
- Privacy Mode;
- file selection.

Screenshots are release artifacts, not evidence of real user data or adoption.

## Known limitations

- Prumo Web has no cloud sync, account-based recovery, or multi-device state. Browser data belongs to one origin and browser profile.
- Clearing browser site data can remove the IndexedDB working copy. Exported files are the portable recovery path.
- Persistent file handles are not implemented in v0.1.0; manual selection and download are the supported flow.
- Spreadsheet import intentionally accepts a small tabular snapshot model, not arbitrary workbook formulas, formatting, macros, or transaction ledgers.
- Prumo Local currently targets macOS and requires a local Node.js process while it is open.
- Local backups are user-managed files. A backup on the same physical volume does not protect against loss of that volume.
- Privacy Mode does not encrypt stored data in either edition.
- The public deployment and release tag are not created by this document and require explicit approval.

## Before publishing

- confirm the public build and all Local checks are green;
- complete and commit the Web network-audit evidence using synthetic values;
- verify that the live host has no financial upload endpoint and no analytics;
- capture and review all listed screenshots from the fictional demo;
- audit the working tree and Git history for personal data, files, paths, screenshots, and secrets;
- confirm package and release metadata consistently use `0.1.0`;
- review external links, repository metadata, GitHub topics, and the deployment URL;
- create the release tag and publish these notes only after approval.
