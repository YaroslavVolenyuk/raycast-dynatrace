/**
 * Diagnoses "Problems in Menu Bar shows nothing": runs the menu bar's exact
 * query with the OAuth client the extension uses, and shows which scopes the
 * SSO actually granted (it may grant fewer than requested).
 *
 * Never prints the client secret or the access token.
 *
 *   DT_TENANT_URL     — e.g. https://abc12345.apps.dynatrace.com (as in Manage Tenants)
 *   DT_CLIENT_ID      — OAuth client ID
 *   DT_CLIENT_SECRET  — OAuth client secret
 *   DT_SSO_URL        — optional, default https://sso.dynatrace.com/sso/oauth2/token
 *
 * Usage:
 *   node --env-file=.env scripts/check-problems.mjs
 */

const TENANT = process.env.DT_TENANT_URL?.replace(/\/+$/, "");
const CLIENT_ID = process.env.DT_CLIENT_ID;
const CLIENT_SECRET = process.env.DT_CLIENT_SECRET;
const SSO = process.env.DT_SSO_URL || "https://sso.dynatrace.com/sso/oauth2/token";

const SCOPES = ["storage:buckets:read", "storage:logs:read", "storage:spans:read", "storage:events:read"];

// Same query as buildProblemsQuery() with the menu bar defaults: look-back 7d,
// no extra filter, limit MAX_COUNTED + 1 (src/ui/commands/menubar-problems/problemsStore.ts).
const LIMIT = 100;
const QUERY = [
  "fetch dt.davis.problems, from: now()-7d",
  "dedup event.id, sort: {timestamp desc}",
  'filter event.status != "CLOSED"',
  "sort event.start desc",
  `limit ${LIMIT}`,
].join(" | ");

if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set DT_TENANT_URL, DT_CLIENT_ID and DT_CLIENT_SECRET (e.g. in .env).");
  process.exit(1);
}

/** Cuts the secrets out of a response that is printed: a proxy or SSO error page may echo the request. */
const secrets = [CLIENT_SECRET, encodeURIComponent(CLIENT_SECRET)];
const redact = (text) => secrets.reduce((out, s) => (s ? out.split(s).join("[REDACTED]") : out), text);

// ── 1. Token ──────────────────────────────────────────────────────────────────

const tokenRes = await fetch(SSO, {
  method: "POST",
  // a 307/308 would re-send the body, client secret included, to the Location host
  redirect: "error",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: SCOPES.join(" "),
  }),
});
const tokenBody = await tokenRes.text();
if (!tokenRes.ok) {
  console.error(`✗ SSO ${tokenRes.status}: ${redact(tokenBody).slice(0, 300)}`);
  process.exit(1);
}
const token = JSON.parse(tokenBody);
secrets.push(token.access_token);
const granted = (token.scope ?? "").split(/\s+/).filter(Boolean);
console.log("✓ token issued");
console.log(`  requested: ${SCOPES.join(" ")}`);
console.log(`  granted:   ${granted.length ? granted.join(" ") : "(SSO did not report scopes)"}`);
const notGranted = SCOPES.filter((s) => granted.length && !granted.includes(s));
if (notGranted.length) console.log(`  ✗ NOT granted: ${notGranted.join(" ")}  ← add to the OAuth client`);

// ── 2. Query ──────────────────────────────────────────────────────────────────

const auth = { Authorization: `Bearer ${token.access_token}` };
let res = await fetch(`${TENANT}/platform/storage/query/v1/query:execute`, {
  method: "POST",
  redirect: "error",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ query: QUERY, requestTimeoutMilliseconds: 5000, maxResultRecords: LIMIT }),
});
let body = await res.json().catch(() => null);
while (res.ok && body?.state && !["SUCCEEDED", "FAILED"].includes(body.state) && body.requestToken) {
  res = await fetch(
    `${TENANT}/platform/storage/query/v1/query:poll?request-token=${encodeURIComponent(body.requestToken)}&request-timeout-milliseconds=5000`,
    { headers: auth, redirect: "error" },
  );
  body = await res.json().catch(() => null);
}

console.log(`\nquery: ${QUERY}`);
if (!res.ok || body?.error) {
  console.error(`✗ HTTP ${res.status}: ${redact(JSON.stringify(body?.error ?? body)).slice(0, 500)}`);
  process.exit(1);
}
const records = body?.result?.records ?? [];
console.log(`✓ state ${body?.state}, ${records.length} record(s)`);
for (const r of records) {
  console.log(`  ${r.display_id ?? "?"}  ${r["event.status"]}  ${r["event.category"]}  ${r["event.name"]}`);
}
if (records[0]) {
  console.log("\nfirst record, field → type:");
  for (const [k, v] of Object.entries(records[0])) {
    console.log(`  ${k}: ${v === null ? "null" : Array.isArray(v) ? "array" : typeof v}`);
  }
}
const notifications = body?.result?.metadata?.grail?.notifications ?? [];
for (const n of notifications) console.log(`  note: ${n.severity} ${n.message ?? n.notificationType}`);
