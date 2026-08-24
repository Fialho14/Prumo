# Prumo: designing a finance product that asks for less

## Problem

Personal finance software often begins by asking for broad access: create an account, connect a bank, import every transaction, and keep sending financial activity to a remote service.

That model can be useful, but it is disproportionate for a simpler job: understanding how much someone has, where it is, and how that position changes over time. It also turns adoption into a trust decision before the product has provided any value.

## Insight

Many people do not need a ledger of every purchase. They need a reliable answer to a periodic question:

> What do I have right now?

A sequence of dated snapshots can answer that question. Each snapshot records balances across a small set of user-defined categories. The resulting history shows direction, distribution, setbacks, and progress without reconstructing a person's financial life transaction by transaction.

This reduces both product complexity and the amount of data the product needs.

## Solution

Prumo is a private, local-first net worth tracker built around snapshots.

The dashboard gives the latest total, its distribution, change since the previous snapshot, and a chart of the selected categories over time. A snapshot can be updated directly, reviewed in history, or used as the basis for a temporary purchase simulation.

The product has two modes:

- **Prumo Web** is the low-friction entry point. It opens XLSX and CSV files in the browser, offers a template and a fictional demo, persists data in browser-local storage, and exports it again.
- **Prumo Local** is the persistent edition. It runs on localhost, stores data in SQLite, and adds verified backups and restore, quick edit, a temporary simulator, and a command palette.

Neither mode requires an account or bank connection.

## Web architecture

Prumo Web is a static client-side application. A selected financial file crosses the browser's file-picker boundary into client-side code, not into an upload request.

```text
XLSX / CSV
    ↓
browser parser
    ↓
normalised snapshot model
    ↓
dashboard ↔ IndexedDB
    ↓
XLSX / CSV / JSON export
```

Import is intentionally staged. The browser validates the file type and size, workbook or CSV structure, dates, values, duplicate rows, date conflicts, and columns it cannot map. The user sees a human-readable preview before accepting the result.

The spreadsheet is not treated as a permanent database. It is an understandable entry and exit format around a small internal model. File System Access APIs can improve reopening and saving in browsers that support them, but they are not a requirement.

The XLSX parser is kept out of the initial path where practical and loaded only when an Excel file needs it. There is no financial upload route and no server-side financial store.

## Local architecture

Prumo Local uses the same product concepts with a different storage boundary:

```text
browser
    ↓
localhost-only Next.js application
    ↓
domain and service layer
    ↓
SQLite → verified local JSON backups
```

Money is stored as integer cents. SQLite foreign keys and integrity checks are active. Migrations run at startup and create a verified backup before changing an existing schema. Destructive snapshot operations also create a backup first.

The server binds explicitly to `127.0.0.1`, validates local hosts and origins, and does not silently fall back to a different database when a configured private volume is unavailable.

## Privacy

Privacy is an architectural property rather than a visual promise.

For Prumo Web, financial data is processed in browser memory and browser-local storage. The host serves application assets but does not receive the selected file or the resulting financial model. There is no account, analytics SDK, bank integration, financial-data upload endpoint, or server-side storage.

For Prumo Local, the application server and SQLite database run on the user's machine. Backups stay at paths the user controls. An encrypted macOS volume can protect data at rest. Privacy Mode only hides numbers on screen and is described as such; it is not presented as encryption.

The project also states its limits. Browser extensions, a compromised device, exported files, and an unlocked local volume remain part of the user's security environment. A static Web host still receives ordinary requests for application assets, but those requests do not need to contain financial data.

## Product decisions

Several deliberate constraints define the product:

- snapshots instead of transactions;
- user-owned files instead of a proprietary import funnel;
- client-side processing instead of a financial-data backend;
- browser-local persistence for the easiest trial;
- SQLite and local backups for the persistent edition;
- no account, bank integration, cloud sync, budgeting, or multi-user model;
- export as a primary capability rather than an escape hatch.

These choices keep the interface focused and make the privacy story easier to verify. The full rationale is recorded in [product-decisions.md](product-decisions.md).

## Engineering decisions

The engineering work follows the same restraint:

- one normalised snapshot model across import, charting, editing, and export;
- shared calculations, validation, formatting, and UI primitives where runtime boundaries allow;
- explicit adapters for browser storage and SQLite rather than storage assumptions inside domain logic;
- validation before mutation and clear handling of duplicates and date conflicts;
- progressive enhancement for browser-specific file APIs;
- keyboard, focus, contrast, reduced-motion, mobile, light-theme, and dark-theme behaviour treated as release requirements;
- tests that cover imports, invalid files, persistence, export, and Local regression risk;
- a network audit that verifies imported financial values do not appear in outgoing requests.

## Result

Prumo presents a coherent alternative to finance products that collect more information than the task requires. Someone can understand the snapshot model, open a fictional demo, bring a spreadsheet, and inspect the implementation without first creating an identity or granting access to an institution.

The Web and Local editions form a clear progression rather than competing products:

```text
Try in the browser
        ↓
Use a spreadsheet you own
        ↓
Run locally for SQLite and verified backups
```

No adoption figures or performance claims are used to validate the result. The evidence is the working product, its test suite, its documented boundaries, and the portability of its data.

## Next steps

The near-term work is intentionally narrow:

- keep the public Web and Local experiences visually consistent;
- maintain browser compatibility and the no-upload network guarantee;
- keep import and export formats documented and tested;
- improve documentation and contribution paths as the architecture evolves;
- consider offline support only if it remains simple and does not weaken update or security behaviour.

Cloud accounts, bank connections, transaction tracking, budgeting, subscriptions, and sync are not implied future milestones.
