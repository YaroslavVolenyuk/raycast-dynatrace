// Classifies a failed problems fetch so the menu bar can offer the right next
// step: config problems (auth / scopes) send the user to Manage Tenants,
// transient ones (network, timeout, busy query) only need a retry.

export type ProblemsErrorKind = "config" | "transient";

export interface ProblemsErrorInfo {
  kind: ProblemsErrorKind;
  /** One short line for the menu item title. */
  summary: string;
  /** Full message, for "Copy Error Details". */
  detail: string;
}

interface ProblemsErrorRule {
  pattern: RegExp;
  kind: ProblemsErrorKind;
  summary: string;
}

// Checked in order; the first match wins.
const AFTER_SCOPE_RULES: ProblemsErrorRule[] = [
  // An SSO outage is no reason to edit the tenant.
  { pattern: /^SSO is not available/, kind: "transient", summary: "Dynatrace SSO is not responding" },
  {
    pattern: /invalid_scope/,
    kind: "config",
    summary: "OAuth client lacks a requested scope — check the tenant",
  },
  {
    pattern: /oauth error|authentication failed|client_id|client_secret/i,
    kind: "config",
    summary: "Authentication failed — check credentials",
  },
  {
    pattern: /extra dql filter/i,
    kind: "config",
    summary: "Invalid Extra DQL Filter — check extension preferences",
  },
  // Name of the environment host does not resolve while the SSO answered: the URL is wrong.
  {
    pattern: /environment url not found/i,
    kind: "config",
    summary: "Environment URL not found — check the tenant",
  },
  { pattern: /endpoint url|html page/i, kind: "config", summary: "Tenant endpoint looks wrong" },
  // Grail rejects a malformed query with a 4xx code (401/403 were handled above).
  {
    pattern: /\(code 4\d\d\)/,
    kind: "config",
    summary: "Query rejected — check Extra DQL Filter in preferences",
  },
  {
    pattern: /unexpected problem record format/i,
    kind: "transient",
    summary: "Unexpected data from Dynatrace — copy error details",
  },
  { pattern: /timeout|not responding|did not finish/i, kind: "transient", summary: "Dynatrace is not responding" },
];

/** Text inside the first "(…)" that contains a colon (a scope list), as /\(([^)]*:[^)]*)\)/ captured. */
function scopeListIn(detail: string): string | undefined {
  const segments = detail.split(")");
  segments.pop(); // text after the last ")" is never closed
  for (const segment of segments) {
    const open = segment.indexOf("(");
    if (open !== -1 && segment.includes(":", open)) return segment.slice(open + 1);
  }
  return undefined;
}

export function classifyProblemsError(err: unknown): ProblemsErrorInfo {
  const detail = err instanceof Error ? err.message : String(err);

  if (/missing required scopes|access denied/i.test(detail)) {
    const scopes = scopeListIn(detail);
    return {
      kind: "config",
      summary: scopes ? `Missing scope: ${scopes}` : "Missing scope",
      detail,
    };
  }
  const rule = AFTER_SCOPE_RULES.find((r) => r.pattern.test(detail));
  if (rule) return { kind: rule.kind, summary: rule.summary, detail };
  return { kind: "transient", summary: "Could not reach Dynatrace", detail };
}
