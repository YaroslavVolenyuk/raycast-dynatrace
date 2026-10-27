# Dynatrace

Run DQL, search logs and traces, and watch open Davis problems in the menu
bar — across multiple Dynatrace tenants, without leaving your keyboard.
Exact DQL with syntax checks and autocomplete, results in seconds, no AI
subscription needed.

This is an independent, community-built extension. It is not an official
Dynatrace product and is not affiliated with or endorsed by Dynatrace LLC.

## Commands

### Manage Tenants

The one place where Dynatrace environments are set up. Each tenant has an
environment URL and either a platform token or an OAuth client (client ID
and secret). Test a tenant's credentials before relying on it, and switch the
active tenant used by the other commands.

Search Logs, Search Traces and Run DQL open the same list from their action
panel (**Manage Tenants…**, ⌘⇧M), and Search Logs and Search Traces switch
the active tenant with **Switch Tenant** (⌘⇧E), so setup never requires
leaving the command you are in.

### Search Logs

Search Grail logs. The search text is matched in Dynatrace (log content and
service name, case-insensitive) across the whole timeframe, not only in the
logs already loaded. Each search runs a billable DQL query, so it waits until
you stop typing. Also:

- status level (error, warn, info, none) in the dropdown next to the search bar
- timeframe presets from 15 minutes to 7 days (⌘⇧T, or the command argument)
- 100 logs at a time; ⌘L loads more, up to 1,000

Selecting a log entry opens a detail view with its fields rendered as
markdown. When the log carries a trace ID, the detail view links to that
trace in Distributed Traces and in Search Traces.

### Search Traces

Search Grail spans. Filter by timeframe, span status, or trace ID. Both
search commands show the active tenant in the title, and say so when some
records could not be read instead of hiding them. Selecting
a span opens a detail view, with a deep link into the Dynatrace Distributed
Tracing explorer for the corresponding trace.

### Run DQL

Run any DQL query against the active (or a chosen) tenant, as in the
Dynatrace Logs/Notebooks editor. Pick a timeframe from the same presets as
the Dynatrace picker or a custom range — a `from:` / `to:` inside the query
takes precedence. Like Dynatrace, results are capped at 1,000 records (and
1 MB); add `| limit` to the query for fewer. When Grail reports that a result
was truncated or a scan limit was hit, the result list says so. Every run is a
billable query: a query still running after 3 minutes, or one you leave by
closing the view, is cancelled in Dynatrace so it stops scanning. Results are listed with a
title column picked from the data, a filter over all fields, a details panel
(⌘D), and copy actions for one record (JSON) or all records (JSON or CSV).
The last query and timeframe are restored the next time the command opens.
From a log detail, ⌘⇧D opens its DQL filter in Run DQL and ⌘⇧Q copies it.

Writing the query is assisted the way the Dynatrace editor does it:

- syntax errors appear under the Query field while you type (checked with
  Grail's `query:verify`, which does not run the query or use query budget);
- ⌘. lists what can come next at the end of the query — commands, functions,
  fields of the data you fetch — from Grail's `query:autocomplete`;
- ⌘T inserts a starter query (error logs, failed requests, open problems, …).

Run DQL needs `storage:buckets:read` plus the read scope for whatever the
query fetches (for example `storage:logs:read` for `fetch logs`). Each
template lists the scopes it needs; the default tenant scopes cover logs and
spans only, so add `storage:events:read`, `storage:bizevents:read` or
`storage:metrics:read` to use the other templates.

### Problems in Menu Bar (macOS)

Shows the number of open Davis problems in the menu bar, lists the newest
ones and opens any of them in the Dynatrace Problems app. The refresh
interval (15 minutes to 12 hours), the look-back window and an optional
extra DQL filter are set in the extension preferences. Each refresh is a
billable DQL query, so the menu bar reuses its last result until the
interval has passed and shows when it was fetched. A failed fetch is never
shown as "no problems": the icon turns yellow and the menu says what is
wrong. Needs `storage:events:read`.

### Refresh Problems (macOS)

Fetches open problems now, ignoring the refresh interval, and updates the
menu bar. The menu bar's Refresh item runs this command.

## Setup

Run **Manage Tenants** (or **Add Tenant** in any command when nothing is set
up yet) and add a tenant. Choose how it authenticates:

**Platform token** — personal, no admin needed. Queries run with your own
permissions.

1. In Dynatrace, create a
   [platform token](https://docs.dynatrace.com/docs/manage/identity-access-management/access-tokens-and-oauth-clients/platform-tokens)
   (Account Management → My platform tokens) with the scopes below.
2. In the tenant form, paste the environment URL and the token. List the
   token's scopes in the Scopes field: Dynatrace cannot report them, and the
   extension uses the list to warn about a missing scope before a query
   silently returns nothing.

**OAuth client** — a service client, usually created by an account admin.
Queries run with the client's permissions, not yours.

1. In Dynatrace, go to **Account Management → Identity & access management →
   OAuth clients** and create a new OAuth client with the scopes below.
2. In the tenant form, paste the environment URL, client ID and secret. Only
   the scopes listed in the tenant are requested, so list every scope you
   need.

Scopes:

- `storage:buckets:read` (required for all searches — without it Dynatrace
  returns empty results instead of an error)
- `storage:logs:read` (required for Search Logs)
- `storage:spans:read` (required for Search Traces)
- `storage:events:read` (optional, only for Problems in Menu Bar, macOS)

The form pre-fills the three required scopes. The environment URL has the form
`https://<environment-id>.apps.dynatrace.com`; a URL copied from the browser
address bar is fine. **Test & Save** checks the credentials and asks the
environment to verify a query before the tenant is stored.

If you work with more than one Dynatrace environment, add each as a
separate tenant — token and OAuth tenants can be mixed.

OAuth tenants authenticate with client-credentials against Dynatrace SSO. The
SSO endpoint is derived from the environment URL (`sso.dynatrace.com`, or
`sso-dev` / `sso-sprint.dynatracelabs.com` for dev and sprint environments)
and can be overridden per tenant (advanced). A platform token is sent to the environment as is. Long-running
Grail queries are polled automatically via the `query:poll` API, so results
appear once the query completes without any extra action.

## Security

Tenants, including platform tokens and OAuth client secrets, are stored in
Raycast's LocalStorage, which is Raycast's encrypted local database. It stays
on this machine and is not synced anywhere. Access tokens obtained from Dynatrace SSO are held in
memory only for the lifetime of the Raycast process and are never
persisted. Log and span results are not cached on disk either; only the
menu bar keeps its last problem list in Raycast's cache.

## Architecture

The codebase is split into three layers with a hard, lint-enforced
boundary:

- `src/sdk` — a standalone Dynatrace client: platform-token or OAuth authentication, Grail DQL
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

`scripts/` holds helpers for manual testing against a real tenant. They are
not part of the extension and read their settings from a local `.env` file
(gitignored):

- `ingest-test-spans.mjs` sends one realistic trace, `ingest-test-traces.mjs`
  sends many varied ones (statuses, durations, span kinds) and prints their
  trace IDs. Both need `DT_TENANT_URL` and `DT_API_TOKEN` (a token with
  `openTelemetryTrace.ingest`), and the OpenTelemetry packages named at the
  top of each script, installed with `npm install --no-save`.
- `check-problems.mjs` runs the menu bar's problems query with an OAuth
  client (`DT_TENANT_URL`, `DT_CLIENT_ID`, `DT_CLIENT_SECRET`) and shows which
  scopes the SSO granted. Useful when the menu bar shows nothing.

```bash
node --env-file=.env scripts/ingest-test-traces.mjs 30
node --env-file=.env scripts/check-problems.mjs
```

## License

MIT — see [LICENSE](./LICENSE).

Dynatrace is a trademark of Dynatrace LLC. This project is not affiliated
with, endorsed by, or sponsored by Dynatrace LLC.
