# Changelog

All notable changes to Prumo will be documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and intends to use [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for public releases.

## [Unreleased]

### Changed

- Public release preparation and review continue without publishing a tag or deployment from this changelog.

## [0.1.0] - Unreleased

### Added

- Prumo Web, a static browser edition with client-side XLSX and CSV import.
- Import preview for mappings, invalid rows, exact duplicates, date conflicts, and unknown columns.
- A public spreadsheet template and clearly labelled fictional demo.
- Browser-local persistence using IndexedDB.
- XLSX, CSV, and complete JSON export from Prumo Web.
- Public landing experience, two-mode privacy explanation, product decisions, case study, and contribution documentation.
- MIT license, issue and pull request templates, dependency updates, and continuous integration.

### Included from Prumo Local

- Snapshot-based dashboard, category distribution, history, and chart filters.
- SQLite persistence with integer-cent values and referential integrity.
- Quick edit, Privacy Mode, light and dark themes, and command palette.
- Temporary large-purchase simulator that does not write to the database.
- XLSX and CSV import with preview and transactional commit.
- Verified JSON backups, CSV export, automatic backup scheduling, validated restore, and recovery safeguards.
- Explicit `127.0.0.1` binding, local host/origin checks, and optional encrypted-volume storage.

### Security

- Prumo Web has no financial-file upload endpoint, analytics, telemetry, bank integration, account system, or server-side financial store.
- Privacy and security claims are documented separately for Web and Local, including their limitations.
- The production static build passed a browser network audit with synthetic financial values; the exact public origin must be rechecked before release.

### Known limitations

- See the prepared [v0.1.0 release notes](docs/release-notes-v0.1.0.md#known-limitations).
