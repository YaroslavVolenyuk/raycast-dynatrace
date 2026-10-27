# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Initial Version] - {PR_MERGE_DATE}

Initial release of the Dynatrace extension, with six commands for
working with a Dynatrace environment from Raycast.

### Added

- **Manage Tenants** — add, edit, test, and switch between multiple
  Dynatrace tenants, each authenticated with a platform token or an OAuth
  client. Also reachable from Search Logs, Search Traces and Run DQL, which
  can switch the active tenant in place.
- **Search Logs** — search Grail logs in Dynatrace across the whole timeframe,
  filter by status level and timeframe (15m–7d) inside the view, load more
  results on demand, and open a detail view with links to the matching trace.
- **Search Traces** — search Grail spans, filter by timeframe, span status,
  and trace ID, and open a detail view with a deep link into the
  Dynatrace Distributed Tracing explorer.
- **Run DQL** — run any DQL query with the Dynatrace timeframe presets or a
  custom range (up to 1,000 records, as in Dynatrace); browse results with a details panel, filter them, and
  copy one record or all of them as JSON or CSV. Opens with the last query and timeframe,
  and log details can hand their DQL filter over to it.
  Syntax errors show while typing, ⌘. suggests the next command, function or
  field, and ⌘T inserts a starter query.
- **Problems in Menu Bar** (macOS) — show the number of open Davis problems
  in the menu bar and open any of them in the Dynatrace Problems app.
  Configurable refresh interval (15 min to 12 h), look-back window and an
  optional extra DQL filter. A failed fetch is never shown as "no problems".
- **Refresh Problems** (macOS) — fetch open problems now and update the menu
  bar; also behind the menu bar's Refresh item.
