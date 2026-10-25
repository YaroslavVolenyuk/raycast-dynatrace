# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Initial Version] - {PR_MERGE_DATE}

Initial release of the Dynatrace extension, with four commands for
working with a Dynatrace environment from Raycast.

### Added

- **Manage Tenants** — add, edit, test, and switch between multiple
  Dynatrace tenants, each authenticated via its own OAuth client.
- **Search Logs** — search Grail logs with DQL, filter by timeframe
  (15m–7d), status level (error/warn/info/none), and result limit
  (50–500), and open a detail view with a deep link to the matching log.
- **Search Traces** — search Grail spans, filter by timeframe, span status,
  and trace ID, and open a detail view with a deep link into the
  Dynatrace Distributed Tracing explorer.
- **Problems in Menu Bar** (macOS) — show the number of open Davis problems
  in the menu bar and open any of them in the Dynatrace Problems app.
  Configurable refresh interval (30 min / 1 h), look-back window and an
  optional extra DQL filter. A failed fetch is never shown as "no problems".
- OAuth 2.0 client-credentials authentication against Dynatrace SSO, with
  the required `storage:buckets:read`, `storage:logs:read` and
  `storage:spans:read` scopes pre-filled when adding a tenant. The optional
  `storage:events:read` scope for Problems in Menu Bar is added by hand.
- Automatic polling of long-running Grail queries via the `query:poll` API.
- A layered `src/sdk | services | ui` architecture with lint-enforced
  boundaries, project tooling (TypeScript, ESLint, Prettier, Jest), and a
  CI pipeline (lint, typecheck, tests, gitleaks secret scanning).
