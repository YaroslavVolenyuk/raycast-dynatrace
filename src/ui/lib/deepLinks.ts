// Deep links into the Dynatrace web UI. Shared by the log and trace detail
// views so the URL format lives in exactly one place.
//
// Only the `filter=trace.id="…"` parameter is used: it is the format printed by
// the Distributed Tracing app itself (see scripts/ingest-test-spans.mjs, which
// echoes the URL the app produces). Additional parameters (timeframe pinning,
// span selection) are not part of any documented URL format and were removed —
// re-add only after click-verifying against a live tenant.

/**
 * URL of a trace in the Dynatrace Distributed Tracing explorer.
 *
 * @param baseUrl tenant endpoint without trailing slash, e.g. https://abc123.apps.dynatrace.com
 */
export function buildTraceUrl(baseUrl: string, traceId: string): string {
  const filter = encodeURIComponent(`trace.id="${traceId}"`);
  return `${baseUrl}/ui/apps/dynatrace.distributedtracing/explorer?filter=${filter}`;
}

/**
 * URL of a problem in the Dynatrace Problems app.
 * `problemId` is Grail's `event.id` (not the "P-…" display id).
 * Format taken from a live tenant URL (2026-10-25).
 */
export function buildProblemUrl(baseUrl: string, problemId: string): string {
  return `${baseUrl}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(problemId)}`;
}
