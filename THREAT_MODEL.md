# Threat Model

What this extension protects, from whom, and how each protection is checked.
Security work on this repository starts here: a review, a new feature or a bug
report is mapped to the threats below, not done from scratch.

To report a vulnerability, see [SECURITY.md](SECURITY.md). This document lists
the design and its known, accepted limits — never an unfixed vulnerability.

## Scope

A Raycast extension (Node.js process started by Raycast on macOS) that reads logs,
spans and Davis problems from Dynatrace Grail and shows them in Raycast views and
the menu bar. It only **reads**: it never writes to Dynatrace.

### Assets

| ID  | Asset                                                          | Why it matters                                   |
| --- | -------------------------------------------------------------- | ------------------------------------------------ |
| A1  | Platform tokens and OAuth client secrets                       | Read access to a whole Dynatrace environment     |
| A2  | OAuth access tokens                                            | Same access, ~5 minutes                          |
| A3  | Telemetry: log content, span attributes, problems, DQL results | May carry PII, internal hostnames, business data |
| A4  | Tenant configuration (URLs, names, scopes)                     | Tells where and how to connect                   |
| A5  | The user's query budget                                        | Every Grail query is billed                      |

### Trust boundaries and data flow

```
 user ──► Raycast ──► extension process ──► LocalStorage (encrypted, A1 A4)
                          │        └──────► Cache (plain files: menu bar result only)
 raycast:// deeplink ─────┤
 (any app or web page)    ├──► SSO token endpoint    (client secret → access token)
                          └──► Dynatrace environment (bearer token → telemetry)
                                        ▲
                anyone who can make a monitored system log or trace something
```

Untrusted inputs: **all telemetry** (an attacker controls a log line by sending a
crafted HTTP header to any monitored service), deeplink arguments and launch
context, and every byte the SSO or environment endpoint sends back.

### Attackers

| ID     | Attacker                                       | Can                                                                          |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| T-TEL  | Telemetry author                               | Put any text into logs, span attributes, problem titles                      |
| T-LINK | Web page or app                                | Open `raycast://extensions/…` deeplinks with arguments and launch context    |
| T-END  | Malicious, lookalike or misconfigured endpoint | Answer token and query requests: redirects, echoes, huge or malformed bodies |
| T-NET  | Network attacker                               | See and alter traffic not protected by TLS                                   |
| T-DEP  | Supply chain                                   | Ship a compromised npm dependency or GitHub Action                           |
| T-REPO | Anyone with read access to the repository      | Read code and the whole git history                                          |

### Out of scope

- Malware or another person already running as the logged-in macOS user (it can
  read Raycast's storage and memory directly).
- A compromised Raycast app, macOS or Dynatrace service.
- A Dynatrace user who already has access to the same data in the tenant.
- Phishing the user into creating a token for an attacker; the extension cannot
  tell who owns a token.

## Threats and controls

Status: **Controlled** — a control exists and an automated check keeps it.
**Manual** — a control exists, checked by review only. **Accepted** — known
limit, by design.

### 1. Credentials (A1, A2)

| ID  | Threat                                                                         | Control                                                                                                                                                               | Checked by                                                                                                                                                                     | Status     |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| C1  | Secrets written to disk in plain text                                          | Tenants live in Raycast LocalStorage only; tokens only in memory; no `Cache`/`useCachedPromise` outside the menu bar                                                  | `src/ui/__tests__/noDiskCache.test.ts`, `src/services/__tests__/tenants.test.ts`                                                                                               | Controlled |
| C2  | Client secret forwarded by a 307/308 redirect from the SSO endpoint (T-END)    | Token request uses `redirect: "error"`                                                                                                                                | `auth.test.ts` ("never follows a redirect"); Semgrep `secret-request-follows-redirects`                                                                                        | Controlled |
| C3  | Bearer token forwarded by a redirect from the environment (T-END)              | `fetch` drops `Authorization` on a cross-origin redirect (Fetch standard); on 307/308 the query text itself still goes to the new host                                | Lab test, not in CI                                                                                                                                                            | Manual     |
| C4  | Secret shown, copied or cached because the endpoint echoes the request (T-END) | `OAuthError` redacts `client_secret=…`; the secret's value is removed from SSO bodies; environment bodies are read through `readBody`, which removes the bearer token | `auth.test.ts` ("echoed secret", "secret quoted without its key"), `query.test.ts` ("token echoed"); Semgrep `environment-body-read-unredacted`                                | Controlled |
| C5  | Secret sent over plain HTTP (T-NET)                                            | Environment URL and custom SSO endpoint must be `https://`                                                                                                            | `tenantForm.helpers.test.ts` ("rejects a non-https environment URL", "rejects a plain-http SSO endpoint")                                                                      | Controlled |
| C6  | Token sent to a lookalike or non-Dynatrace host the user entered (T-END)       | Non-Dynatrace hosts stay allowed (proxies, Managed), but the form asks before credentials go to a new one, ahead of the connection test                               | `tenantForm.helpers.test.ts` ("newForeignHosts"), `environmentUrl.test.ts` ("isDynatraceHost"), `tenantActions.test.ts` ("checkAndSaveTenant": order, nothing sent after a no) | Controlled |
| C7  | A cached access token outlives edited credentials                              | Token cache key includes a hash of every credential and scope                                                                                                         | `auth.test.ts` ("credentials change under the same id")                                                                                                                        | Controlled |
| C8  | Secrets committed to git (T-REPO)                                              | `.env` is ignored; gitleaks in the pre-commit hook (when installed) and in CI over the full history                                                                   | `.husky/pre-commit`, `.github/workflows/ci.yml`                                                                                                                                | Controlled |

### 2. Telemetry rendered in the UI (A3, T-TEL)

| ID  | Threat                                                                                                 | Control                                                                                                                                             | Checked by                                                                                                                                                                                                                                   | Status     |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | Markdown injection: an image or link in a log line makes Raycast load a remote URL (zero-click beacon) | All telemetry in Detail markdown goes through `fenceCode` with a fence longer than any backtick run                                                 | `markdown.test.ts`, `formatLogContent.test.ts`; `LogDetail.test.ts`, `TraceDetail.test.ts`, `DqlResults.test.ts` ("hostile … inside fences and SVG cards"); Semgrep `markdown-unfenced-interpolation`, `markdown-interpolated-image-or-link` | Controlled |
| R2  | SVG/XML injection into header and field cards (external `<image>`, `<script>`)                         | `escapeXml` on every string; SVG shipped as a base64 data URI                                                                                       | `svg.test.ts`; Semgrep `markdown-interpolated-image-or-link`                                                                                                                                                                                 | Controlled |
| R3  | CSV formula injection (`=HYPERLINK(…)`) in exported results, column names included                     | Cells starting with `= + - @ \t \r` get a `'` prefix; cells with `;` are quoted, so Excel with a `;` separator cannot split one into a formula cell | `dqlRecord.test.ts` ("neutralizes text a spreadsheet would run as a formula", "formula in a column name", "quotes a cell with ;")                                                                                                            | Controlled |
| R4  | Links built from telemetry point to another host                                                       | Trace and problem IDs are URL-encoded into a path or query on the tenant's own URL                                                                  | `deepLinks.test.ts` ("hostile problem id", "hostile trace id")                                                                                                                                                                               | Controlled |
| R5  | Copied telemetry pasted into a terminal                                                                | Copy is always an explicit user action                                                                                                              | —                                                                                                                                                                                                                                            | Accepted   |
| R6  | Plain-text fields (titles, metadata labels)                                                            | Raycast renders them as text, not markdown                                                                                                          | —                                                                                                                                                                                                                                            | Accepted   |

### 3. Input that reaches DQL (A3, A5)

| ID  | Threat                                                                                                | Control                                                                                                                                                                                 | Checked by                                                                                                                                             | Status     |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Q1  | DQL injection through search text, trace ID, timeframe or a log field used in a context query (T-TEL) | `escapeDqlString` for every value inside a DQL string literal, constants included                                                                                                       | `escape.test.ts`, `logs.test.ts`, `spans.test.ts`, `LogDetail.helpers.test.ts` ("escapes the telemetry value"); Semgrep `dql-unescaped-string-literal` | Controlled |
| Q2  | Deeplink arguments outside the manifest's dropdown values smuggle DQL (T-LINK)                        | Timeframe, level and limit are allow-listed before use; values that are not text are dropped; the query builders also accept only a duration (`30m`, `7d`) and a positive integer limit | `listArgs.test.ts`, `escape.test.ts` ("query builders refuse a duration or limit")                                                                     | Controlled |
| Q3  | A deeplink runs a query on the user's behalf (T-LINK)                                                 | Run DQL launch context only prefills the form; running needs the user                                                                                                                   | Manual review of `RunDql.tsx`                                                                                                                          | Manual     |
| Q4  | The menu bar extra filter breaks out of its `filter` stage                                            | Pipes, line breaks and a leading `filter` are rejected (user's own preference)                                                                                                          | `problems.test.ts`                                                                                                                                     | Controlled |
| Q5  | Runaway query cost (A5)                                                                               | Queries run on user action or the chosen menu bar interval; abandoned queries are cancelled; Grail's consumption limit is enforced                                                      | `query.test.ts` ("consumption and scan limits", cancellation), `refreshThrottle.test.ts`                                                               | Controlled |

### 4. Data at rest (A3, A4)

| ID  | Threat                                                     | Control                                                                                                                                                                                                                                                          | Checked by                                                                                                                                    | Status     |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Telemetry or configuration written to the plain-file Cache | Only the menu bar may use Cache. Of a problem it stores id, name, display id and category; besides that the environment URL (for links), the tenant name, the last error's summary and text (tokens removed, C4), and a hash of what the result was computed for | `noDiskCache.test.ts`, `problemsStore.test.ts` ("writes only the fields the menu shows", "keeps the filter, scopes and credentials hash out") | Controlled |
| D2  | Run DQL history                                            | The last query and timeframe are kept in encrypted LocalStorage                                                                                                                                                                                                  | `dqlHistory.test.ts`                                                                                                                          | Controlled |

### 5. Responses from endpoints (T-END)

| ID  | Threat                                                             | Control                                                         | Checked by                                  | Status                                  |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| E1  | Malformed or unexpected JSON                                       | Responses are parsed with zod schemas; HTML pages are rejected  | `query.test.ts`, resource tests             | Controlled                              |
| E2  | Huge response body exhausts memory                                 | None: bodies are read whole                                     | —                                           | Accepted (crash only, no data exposure) |
| E3  | Error text from the endpoint shown to the user                     | Shown as plain text, cut to 200–300 characters                  | —                                           | Accepted                                |
| E4  | Results of one environment shown under another after a tenant edit | Search results are keyed by tenant id, URL and credentials hash | `useTenantQuery.test.ts`                    | Controlled                              |
| E5  | An endpoint sends headers, then stalls the body                    | Bodies are read under the same timeout as the request           | `auth.test.ts` ("stalls after the headers") | Controlled                              |
| E6  | A wrong or foreign server passes the connection test               | Only a `query:verify` answer counts; 5xx and 429 are failures   | `verify.test.ts`                            | Controlled                              |

### 6. Supply chain and repository (T-DEP, T-REPO)

| ID  | Threat                                                                  | Control                                                                                  | Checked by                                                                    | Status     |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| S1  | Vulnerable runtime dependency                                           | `npm audit --omit=dev --audit-level=high` in CI; Dependabot; dependency review on PRs    | `.github/workflows/ci.yml`, `dependency-review.yml`, `.github/dependabot.yml` | Controlled |
| S2  | Vulnerable patterns in code                                             | CodeQL; eslint-plugin-security and sonarjs; project Semgrep rules (`.semgrep/rules.yml`) | `codeql.yml`, `eslint.config.js`, `ci.yml` ("semgrep"), `.husky/pre-commit`   | Controlled |
| S3  | SDK layer pulls in UI code                                              | CI rejects `@raycast/api` and React imports under `src/sdk`                              | `ci.yml` ("Architecture boundary")                                            | Controlled |
| S4  | Real environment IDs, hostnames or internal data in fixtures or history | Fixtures use placeholder IDs (`abc12345`) and invented names                             | Review                                                                        | Manual     |
| S5  | A moved tag or compromised GitHub Action runs in CI                     | Actions pinned to commit SHAs (Dependabot updates them); the CI token is read-only       | Review of `.github/workflows/`                                                | Manual     |

## Open items

| ID  | Item                                                                                     | Covers     |
| --- | ---------------------------------------------------------------------------------------- | ---------- |
| O1  | Move the loopback lab attacks (redirects, echoing SSO, huge bodies) into the test suite  | C3, E2     |
| O3  | Property-based tests (random strings) for `escapeDqlString`, `fenceCode` and `escapeXml` | Q1, R1, R2 |

## How to use this document

- **New finding** (from a person, a tool or an LLM review): map it to a threat ID,
  or add a new row if it fits none. Confirm it with a failing test or a
  reproduction before fixing; a finding without one is a hypothesis.
- **Fix**: add the test or rule that would have caught it, and put it in the
  _Checked by_ column. A row moves to _Controlled_ only with an automated check.
  A whole class of bug (not one value) also gets a rule in `.semgrep/rules.yml`;
  check that the rule fires on the code from before the fix.
- **New feature**: before merging, check every section above for new inputs,
  new sinks or new storage, and add rows for them.
- **Review** (human or LLM): review one section at a time, against its rows, on
  the branch that will be released. A review is done when it finds nothing outside
  the table and nothing that the _Checked by_ column does not already catch.
