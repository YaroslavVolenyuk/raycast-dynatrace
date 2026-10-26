# Dynatrace

Dynatrace brings your Dynatrace environment into Raycast: manage multiple
tenants, search Grail logs with DQL, and browse distributed traces, all
without leaving your keyboard.

This is an independent, community-built extension. It is not an official
Dynatrace product and is not affiliated with or endorsed by Dynatrace LLC.

## Commands

### Manage Tenants

Add, edit, test, and switch between multiple Dynatrace tenants. Each tenant
is defined by its environment URL and an OAuth client (client ID and
secret). Use this command to verify a tenant's credentials before relying on
it, and to switch the active tenant used by the other commands.

### Search Logs

Search Grail logs using DQL. Filter by:

- timeframe presets from 15 minutes to 7 days
- status level: error, warn, info, or none
- result limit: 50 to 500

Selecting a log entry opens a detail view with its fields rendered as
markdown, plus a deep link that opens the matching log in the Dynatrace
web UI.

### Search Traces

Search Grail spans. Filter by timeframe, span status, or trace ID. Selecting
a span opens a detail view, with a deep link into the Dynatrace Distributed
Tracing explorer for the corresponding trace.

### Run DQL

Run any DQL query against the active (or a chosen) tenant, as in the
Dynatrace Logs/Notebooks editor. Pick a timeframe from the same presets as
the Dynatrace picker or a custom range — a `from:` / `to:` inside the query
takes precedence. Like Dynatrace, results are capped at 1,000 records; add
`| limit` to the query for fewer. Results are listed with a
title column picked from the data, a filter over all fields, a details panel
(⌘D), and copy actions for one record (JSON) or all records (JSON or CSV).
The last query and timeframe are restored the next time the command opens. From a log
detail, ⌘⇧D opens its DQL filter in Run DQL.

Run DQL needs `storage:buckets:read` plus the read scope for whatever the
query fetches (for example `storage:logs:read` for `fetch logs`).

## Setup

1. In Dynatrace, go to **Account Management → Identity & access management →
   OAuth clients** and create a new OAuth client.
2. Grant the client these scopes:
   - `storage:buckets:read` (required for all searches — without it Dynatrace
     returns empty results instead of an error)
   - `storage:logs:read` (required for Search Logs)
   - `storage:spans:read` (required for Search Traces)
   - `storage:events:read` (optional, only for Problems in Menu Bar, macOS)
3. In Raycast, run **Manage Tenants** and add a tenant. The scope field is
   pre-filled with the three required scopes. If you use Problems in Menu
   Bar, add `storage:events:read` there as well — a scope granted to the
   OAuth client is only requested when it is listed in the tenant. You'll need:
   - the environment URL, in the form `https://<environment-id>.apps.dynatrace.com`
   - the OAuth client ID and client secret from step 1
4. Use **Test** in Manage Tenants to confirm the credentials work before
   using Search Logs or Search Traces.

If you work with more than one Dynatrace environment, add each as a
separate tenant and switch the active tenant from the Manage Tenants
command at any time.

Authentication uses OAuth 2.0 client-credentials against Dynatrace SSO. The
SSO endpoint defaults to `sso.dynatrace.com` and can be overridden per tenant
(advanced). Long-running
Grail queries are polled automatically via the `query:poll` API, so results
appear once the query completes without any extra action.

## Security

Tenant configuration, including the OAuth client secret, is stored in
Raycast's LocalStorage, which is Raycast's encrypted local database. It stays
on this machine and is not synced anywhere. Access tokens obtained from Dynatrace SSO are held in
memory only for the lifetime of the Raycast process and are never
persisted.

## Architecture

The codebase is split into three layers with a hard, lint-enforced
boundary:

- `src/sdk` — a standalone Dynatrace client: OAuth authentication, Grail DQL
  execution, and resource modules with Zod schemas. It has no
  Raycast or React imports.
- `src/services` — application logic. No `fetch` calls, no JSX.
- `src/ui` — Raycast presentation: commands, hooks, and rendering.

The boundary is enforced by an ESLint `no-restricted-imports` rule and a CI
grep, so a PR that crosses layers fails automatically.

## Development

Requires Node 22 or newer.

```bash
npm install
npm run dev         # ray develop
npm run build       # ray build
npm run lint        # eslint, including the layer-boundary rules
npm run typecheck   # tsc --noEmit
npm test            # jest
npm run knip        # unused files/exports/dependencies
```

To send a sample trace to a tenant for manual testing of Search Traces, set
`DT_TENANT_URL` and `DT_API_TOKEN` (a token with the
`openTelemetryTrace.ingest` scope) in a local `.env` file (gitignored), then
run:

```bash
node --env-file=.env scripts/ingest-test-spans.mjs
```

## License

MIT — see [LICENSE](./LICENSE).

Dynatrace is a trademark of Dynatrace LLC. This project is not affiliated
with, endorsed by, or sponsored by Dynatrace LLC.
