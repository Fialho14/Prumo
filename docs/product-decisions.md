# Product decisions

Prumo is designed around four priorities: simplicity, privacy, local ownership, and portability. This document records the choices that protect those priorities and the trade-offs they introduce.

## Why snapshots instead of transactions

Prumo answers “what do I have right now?” rather than “where did every cent go?”

A snapshot contains a date, optional note, and the balances of a small set of categories. A sequence of snapshots is enough to show net worth, distribution, and change over time. It does not require merchants, receipts, transaction descriptions, recurring-payment detection, or expense categorisation.

This intentionally gives up budgeting, cash-flow analysis, and transaction search. Those are useful jobs, but they are different products with a larger data appetite.

## Why local-first

Financial position is sensitive even when it contains no account numbers. Prumo keeps the primary working copy close to the person using it and makes remote infrastructure unnecessary for the core experience.

Local-first does not mean data is magically secure. Device access, browser extensions, unlocked volumes, exported files, and backups still matter. It means the product can work without making remote custody a prerequisite.

## Why spreadsheets are an entry point

Spreadsheets are already understandable, inspectable, and portable. Asking someone to reshape an existing file is a smaller trust and migration cost than asking them to connect a bank or commit to a proprietary database.

Prumo accepts a simple table, previews how its columns will map, and converts it into a normalised internal model. The spreadsheet is not required to behave like a live database. The user can import, work locally, and export again.

## Why client-side processing on the Web

An upload service would make the browser experience easier to implement centrally, but it would contradict the central promise. Prumo Web parses XLSX and CSV files in the browser and has no endpoint that accepts financial files.

This moves computation and validation to the client, makes browser memory and IndexedDB part of the architecture, and requires care with bundle size. Those costs are accepted because the host does not need custody of the data.

The static host still serves normal application assets and therefore receives ordinary web-request metadata. The privacy claim is specifically that financial files and the derived financial model are not uploaded or stored server-side.

## Why SQLite locally

SQLite provides durable, transactional storage in a single user-controlled file. It supports migrations, foreign-key integrity, atomic changes, and local backup workflows without introducing a separate database service.

The trade-off is that Prumo Local needs a small localhost application process and currently targets macOS. That is appropriate for the persistent edition; it is not imposed on someone who only wants to try Prumo in a browser.

## Why no account

An account would create an identity system, recovery flows, secrets, policy obligations, and pressure to associate data with a server-side user record. None of that is required to show a snapshot history.

Without an account, there is no cross-device identity or hosted recovery. Portability and user-managed backups take its place.

## Why no bank integration

Bank connections require broad permissions, third-party providers, regional compatibility work, token storage, and an ongoing stream of transaction data. They would also move Prumo toward automated transaction tracking — a different product.

Manual snapshots and spreadsheets are less automatic, but they are legible and keep the trust boundary small.

## Why data portability matters

Export is not a retention tactic or an advanced setting. It is part of the normal lifecycle of the data.

Prumo Web supports familiar spreadsheet output and a complete structured export. Prumo Local provides a complete, versioned JSON backup and a readable CSV export. A user should be able to stop using Prumo without losing the history created in it.

Portable does not mean every format preserves every detail equally. CSV is the most broadly readable but flatter; JSON is the complete structured copy; XLSX is useful for returning to a spreadsheet workflow. The interface and documentation should make those differences clear.

## Why no cloud sync

Cloud sync would require accounts, conflict resolution, remote storage, encryption and recovery design, operational security, and a much larger threat model. It would turn an optional convenience into the product's defining infrastructure.

Prumo instead offers two explicit forms of persistence: browser-local storage for the Web edition and SQLite with local backups for the Local edition. Users who need cross-device sync can move exported files using a system they already trust; Prumo does not silently become that system.

## Why two editions

The Web and Local editions resolve different adoption costs while sharing one philosophy.

- Web removes installation and lets a person try the model with a demo, template, or existing file.
- Local adds durable SQLite storage, verified backups, restore, and deeper local workflows.

The Web edition is not a funnel into an account, and the Local edition is not a deprecated predecessor. They are two storage choices around the same snapshot model.

## Why the non-goals are explicit

Prumo does not plan to become a budgeting app, transaction tracker, bank aggregator, multi-user platform, subscription service, advertising surface, AI adviser, or cloud-sync product.

Writing those constraints down helps contributors judge proposals by product fit, not only by whether a feature can be built.
