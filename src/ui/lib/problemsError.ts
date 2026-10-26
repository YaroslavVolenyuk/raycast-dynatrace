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

export function classifyProblemsError(err: unknown): ProblemsErrorInfo {
  const detail = err instanceof Error ? err.message : String(err);

  if (/missing required scopes|access denied/i.test(detail)) {
    const scopes = detail.match(/\(([^)]*:[^)]*)\)/)?.[1];
    return {
      kind: "config",
      summary: scopes ? `Missing OAuth scope: ${scopes}` : "Missing OAuth scope",
      detail,
    };
  }
  if (/oauth error|authentication failed|client_id|client_secret/i.test(detail)) {
    return { kind: "config", summary: "Authentication failed — check credentials", detail };
  }
  if (/extra dql filter/i.test(detail)) {
    return { kind: "config", summary: "Invalid Extra DQL Filter — check extension preferences", detail };
  }
  // Name of the environment host does not resolve while the SSO answered: the URL is wrong.
  if (/environment url not found/i.test(detail)) {
    return { kind: "config", summary: "Environment URL not found — check Manage Tenants", detail };
  }
  if (/endpoint url|html page/i.test(detail)) {
    return { kind: "config", summary: "Tenant endpoint looks wrong", detail };
  }
  // Grail rejects a malformed query with a 4xx code (401/403 were handled above).
  if (/\(code 4\d\d\)/.test(detail)) {
    return { kind: "config", summary: "Query rejected — check Extra DQL Filter in preferences", detail };
  }
  if (/unexpected problem record format/i.test(detail)) {
    return { kind: "transient", summary: "Unexpected data from Dynatrace — copy error details", detail };
  }
  if (/timeout|not responding|did not finish/i.test(detail)) {
    return { kind: "transient", summary: "Dynatrace is not responding", detail };
  }
  return { kind: "transient", summary: "Could not reach Dynatrace", detail };
}
