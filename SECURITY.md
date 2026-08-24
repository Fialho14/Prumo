# Security policy

Prumo handles sensitive financial context even though it does not connect to banks or collect account credentials. Security and privacy reports are welcome.

## Supported code

Security fixes target the latest released version. Before the first public release, reports should be evaluated against the current default branch and the prepared `v0.1.0` scope.

Older snapshots, forks, modified deployments, and unmaintained branches may not receive fixes.

## Report privately

Use **Security → Report a vulnerability** in this GitHub repository to open a private security advisory.

If private advisories are unavailable, open a public issue containing only a request for a private reporting channel. Do not include the vulnerability, proof of concept, affected data, or identifying details in that issue.

Please include, using synthetic data only:

- the affected edition: Prumo Web, Prumo Local, documentation, or build tooling;
- the affected commit or release;
- the security or privacy impact;
- the smallest safe reproduction;
- whether user interaction is required;
- any suggested mitigation.

Do not send real financial files, databases, backups, exports, screenshots, paths, tokens, or logs.

## Particularly relevant reports

Examples include:

- a Prumo Web request containing selected file bytes, category names, notes, balances, or derived snapshots;
- an upload or server-side storage path reachable from Prumo Web;
- cross-site scripting or spreadsheet-formula injection;
- unsafe parsing, resource-exhaustion, or file-validation bypasses;
- IndexedDB data exposed across an unexpected origin boundary;
- a Local host/origin check bypass or unintended non-loopback binding;
- path traversal, unsafe backup replacement, restore-validation bypass, or SQLite corruption risk;
- financial values written to logs or error-reporting services;
- secrets or personal financial artifacts committed to the repository or its history;
- a dependency or build-chain compromise with a practical impact on Prumo.

General product bugs, accessibility issues, and non-sensitive hardening suggestions can use the public issue templates.

## Scope and security boundaries

### Prumo Web

Prumo Web is designed as a static client-side application. Financial files should be parsed in the browser, stored only in browser-local state, and exported by the user. The host still serves public assets and can receive normal web-request metadata. Prumo does not claim protection from a compromised device, browser, extension, host, or dependency supply chain.

### Prumo Local

Prumo Local runs a server on the user's machine, bound to `127.0.0.1`, and stores financial data in a local SQLite file. Local processes with sufficient user privileges may be able to read that file. Optional encrypted-volume protection is supplied by macOS, not by Prumo. Privacy Mode hides rendered values but does not encrypt stored data.

The detailed model and limitations are in [docs/privacy-and-security.md](docs/privacy-and-security.md).

## Disclosure process

Maintainers will review private reports, ask for clarification where necessary, and coordinate a fix and disclosure appropriate to the impact. Please allow that process to complete before publishing details that could put users or their data at risk.

No bounty or response-time commitment is implied by this policy.
