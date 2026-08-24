# Privacy and security

Prumo has two editions with different storage boundaries. This page explains what each edition does, what it does not do, and which protections remain the user's responsibility.

## Claims at a glance

| Claim | Prumo Web | Prumo Local |
| --- | --- | --- |
| Account required | No | No |
| Bank connection | No | No |
| Analytics or telemetry | No | No |
| Financial data sent to Prumo-operated storage | No | No |
| Primary storage | IndexedDB in the browser | SQLite at a local path |
| Financial-file processing | Client-side browser code | Localhost application on the same Mac |
| Export | XLSX, CSV, and JSON | CSV and complete JSON backup |
| Encryption supplied by Prumo | No | No; an encrypted macOS volume is optional |

These statements describe the project as shipped. If an implementation change would make one false, the implementation or the claim must change before release.

## Prumo Web

### What happens when a file is opened

1. The browser's file picker gives Prumo Web access to the file the user selected.
2. Client-side code validates its extension, reported media type, size, and tabular structure.
3. XLSX or CSV bytes are parsed in browser memory.
4. Dates, values, mappings, invalid rows, duplicates, conflicts, and unknown columns are shown in a preview.
5. After confirmation, the normalised snapshot model can be kept in IndexedDB for that browser profile and origin.
6. Export is initiated by the user and produces a local download.

There is no multipart upload, document-conversion service, financial-data API, or server-side financial database in this flow. The parser is application code running in the browser, not a remote spreadsheet service.

### What the host can observe

Prumo Web still has to be delivered like any static website. The hosting provider can receive ordinary requests for HTML, JavaScript, CSS, fonts, icons, and other public assets. Depending on the host, ordinary infrastructure logs may contain request metadata such as time, IP address, user agent, requested path, and response status.

Those asset requests do not need to contain the selected file, category names, balances, notes, snapshots, or exported data. Prumo includes no product analytics or telemetry that records product use.

Links that leave Prumo, such as a link to GitHub, create a normal request to the destination only when followed. Financial data is not attached to those links.

### Browser storage

IndexedDB is scoped to the site's origin and the browser profile. Prumo uses it for financial state because it is more appropriate than local storage for structured datasets. Local storage is limited to small interface preferences such as theme and visual Privacy Mode.

Prumo does not encrypt IndexedDB itself. Someone with access to the device, browser profile, developer tools, a privileged extension, or a compromised browser may be able to read it. Clearing site data or using private-browsing behaviour may remove the browser copy. Regular exports remain important.

### File System Access API

Prumo v0.1.0 does not retain a browser file handle. A future version may offer a more direct open or save experience where the browser supports it, but the browser would control permission prompts and handles. This can only be progressive enhancement; manually choosing a file and downloading a new export remains the compatible path.

Prumo must not imply that a future permission would persist on every browser or that it could write a file without the browser and user allowing it.

### Privacy Mode

Privacy Mode obscures financial values in the rendered interface. It is useful when sharing a screen or using the product near other people. It does not encrypt browser storage, source files, exports, memory, or the device.

## Prumo Local

### Application boundary

Prumo Local runs a Next.js application and SQLite database on the user's Mac. The server binds explicitly to `127.0.0.1`; it does not listen on the local network by default. Requests are checked for local hosts and, for state-changing requests, local origins.

The Local import interface sends the selected file to a route on that localhost application so it can be validated and committed to local SQLite. That is local processing on the same machine, but it is different from Prumo Web's in-browser processing. The file is not sent to an Internet service.

### SQLite and paths

Money is stored as integer cents. SQLite foreign keys and integrity checks are enabled. A database path can be configured explicitly. If the parent directory or private volume is unavailable, Prumo does not silently create a replacement database elsewhere.

Without a configured path, the documented development database is `data/finance.db` inside the project. Users should treat that file as financial data.

### Backups

Prumo can create complete, versioned JSON backups with a checksum and readable CSV exports. Recognised local backups are written atomically, read back, and validated. Migrations, edits, deletions, and restore operations use the documented safety copies.

A backup stored beside the database protects against some accidental changes but not the loss of the physical volume. A second local encrypted volume provides a separate failure boundary without requiring Prumo cloud storage.

### Encrypted volumes

Prumo can place SQLite and backups on a macOS encrypted volume chosen and unlocked by the user. Prumo does not receive, store, or manage that volume's password. The operating system provides encryption at rest.

Once the volume is unlocked, processes and people with sufficient access to the Mac may be able to read it. Locking the volume after use remains an operational step.

### Local logs and interface paths

Prumo is designed not to write financial values deliberately to server logs. Error reports and screenshots can still reveal file names, configured paths, dates, categories, notes, or balances if a user includes them. Sanitise all material before sharing it publicly.

Privacy Mode has the same visual-only boundary in Prumo Local as it does in Prumo Web.

## What Prumo does not claim

Prumo does not claim “military-grade” privacy, anonymity, end-to-end encryption, protection from a compromised device, protection from malicious browser extensions, or secure deletion from flash storage.

The project also does not claim that a public static host receives zero network traffic. It claims that the Web architecture does not need to upload or store financial data.

## Data lifecycle

### Prumo Web

- **Input:** a user-selected file, template, or fictional demo;
- **working state:** browser memory and, after user action, IndexedDB;
- **preferences:** small non-financial settings in local storage;
- **output:** user-initiated XLSX, CSV, or JSON export;
- **deletion:** clear the dataset in Prumo and, if needed, remove site data through browser settings;
- **recovery:** use a previous export; Prumo has no server copy to restore.

### Prumo Local

- **input:** manual snapshots, a local import, or a fictional demo;
- **working state:** the configured SQLite file;
- **output:** CSV and complete JSON backups;
- **deletion:** user actions in the app and user-managed deletion of database/export files;
- **recovery:** validated JSON restore and the documented recovery flow.

## Verification expectations

A public Web release is not complete until automated tests and a browser network audit confirm that importing distinctive test values causes no request containing file bytes, category names, notes, or amounts. The audit should cover XLSX and CSV, preview, confirmation, reload, export, and interactions with the hosted build.

Audit evidence belongs in the repository and must use synthetic data only. The protocol and release status are recorded in [network-audit.md](network-audit.md). A passing audit supports a specific release; it is not a permanent substitute for reviewing future network or dependency changes.

## Reporting a problem

Do not open a public issue containing a real file, database, backup, value, path, screenshot, or log. Follow [SECURITY.md](../SECURITY.md) for private vulnerability reporting. Ordinary product bugs can use the issue templates with synthetic reproduction data.
