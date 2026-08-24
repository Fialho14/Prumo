# Prumo Web financial-data network audit

> **v0.1.0 release-candidate result: PASS.** The production static build did not send financial data during the tested browser flows. A shorter repeat against the final public origin remains a release gate because hosting infrastructure is outside this local build audit.

## Claim under test

Selecting, previewing, importing, persisting, reloading, editing, and exporting a financial file in Prumo Web must not create a request containing the source file, category names, notes, balances, snapshots, or derived financial model.

Normal requests for public HTML, JavaScript, CSS, and icons are expected. The audit distinguishes those static assets from financial-data transmission.

## Build under test

| Field | Result |
| --- | --- |
| Release | `v0.1.0` release-candidate working tree |
| Date | 2026-08-24 |
| Build command | `npm run web:build` |
| Served artifact | `apps/web/dist` through Vite production preview |
| Browser | Headless Chromium 151.0.0.0 |
| Capture tool | agent-browser 0.34.0 |
| Operating system | macOS, Chromium platform `MacIntel` |
| Origin | `http://127.0.0.1:4173` |
| Auditor | Prumo contributors |

The local origin and ephemeral ports are part of the test environment, not production architecture. Record the final tagged commit and repeat the capture against the reviewed public origin before publishing the release.

## Synthetic fixtures

No personal file was used. The fixtures were created solely for this audit and kept outside the repository.

| Fixture | Purpose | SHA-256 |
| --- | --- | --- |
| `prumo-network-audit.csv` | CSV import, update, reload, and export | `76dbb8fdd8169c464c4367589b2291663cc376ce9639640e2af33434d2e88091` |
| `prumo-export-audit.xlsx` | Cold and continuous XLSX import/export | `1feebccefe13313ea907e7d013424a3b461021c52a26c32988188b731b62b5cb` |

The fixtures contain the unique note marker `PRUMO_NETWORK_AUDIT_7F3A9C` and synthetic amounts `11666.65`, `12172.79`, and `12400`. The machine-readable summary is in [`network-audit-evidence.json`](network-audit-evidence.json).

## Browser scenarios completed

1. Loaded the production Web app from a blank browser session.
2. Imported the synthetic XLSX and reviewed dates, categories, totals, notes, unknown columns, and row status before confirmation.
3. Confirmed the import into IndexedDB, exported XLSX, CSV, and JSON, then reloaded and confirmed that the dashboard returned from browser storage.
4. Repeated a cold XLSX import with the initial page assets excluded to isolate lazy parser loading.
5. Imported the synthetic CSV, confirmed it, added a browser-local snapshot, reloaded, and exported all three formats.
6. Opened the fictional demo, created the template, exercised Privacy Mode, and cycled system/light/dark themes.
7. Ran automated invalid-file, duplicate, conflicting-date, unknown-column, oversized-file, persistence, and export checks.

File System Access API integration is not part of v0.1.0; manual local selection and download are the cross-browser baseline.

## Observed requests

The continuous production run covered initial load, XLSX preview, confirmation, all exports, and reload:

- **9 requests total**;
- **9 same-origin `GET` requests**;
- **0 requests with a body or `postData`**;
- **0 cross-origin requests**;
- **0 WebSocket entries**;
- only the document, main JavaScript, stylesheet, favicon, and lazy XLSX parser chunk were requested;
- neither the unique fixture marker nor any audited amount appeared anywhere in the HAR.

The isolated cold XLSX run produced one request: a same-origin `GET` for the lazy XLSX JavaScript chunk, with no request body. The isolated CSV flow produced zero runtime requests after the public application assets had loaded.

Downloads were browser-created object URLs. IndexedDB survived reload without a server request carrying state.

## Automated controls

The Web data-layer suite has 24 tests across four files. [`apps/web/src/lib/import.test.ts`](../apps/web/src/lib/import.test.ts) replaces `fetch` and `XMLHttpRequest`, parses synthetic CSV and XLSX files, and asserts that neither transport is called. Related tests cover the normalised model, IndexedDB adapter, input limits, and client-generated exports.

Source review found no executable financial `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or API URL. The static build contains no `api` directory, SQLite code, backup code, Server Action, or financial backend. XLSX is emitted as a lazy chunk, keeping it outside the initial application bundle.

The deployment configuration adds `connect-src 'none'` as defence in depth. The audit result does not rely on that header: the captured requests and request bodies are the primary browser evidence.

## Result and limits

The release-candidate build passes the claim under test for the scenarios above. It is accurate to say that Prumo Web processes the audited financial files locally, persists the working copy in IndexedDB, and creates exports in the browser without uploading financial data.

This result does not claim that a static host receives no infrastructure metadata. A hosting provider can still log ordinary asset requests, including IP address, user agent, time, path, and status. It also does not audit browser extensions or a future hosting configuration.

## Repeat procedure and release rule

Repeat this audit after any change to networking, dependencies, import/export, persistence, workers, external assets, hosting configuration, or analytics policy. For a public release:

1. build the exact tagged commit;
2. start capture before opening the public origin;
3. repeat XLSX and CSV import, persistence, reload, editing, and all exports with new synthetic markers;
4. inspect URLs, methods, request bodies, beacons, sockets, workers, and external origins;
5. search the capture for marker text, encoded variants, amounts, serialised model fragments, and fixture hashes;
6. fail the release if any outgoing request is unexplained.

Do not publish Prumo Web or the `v0.1.0` release until the final-origin repeat passes.
