// Connection test for a tenant: credentials (SSO) AND the environment itself.
// A token from sso.dynatrace.com says nothing about the Environment URL — a
// typo'd host would still test green — so the environment is asked too, with
// `query:verify` (parses a DQL query without running it: free, no data read).

import { getAccessToken, validateTenantCredentials, type TenantConfig } from "../auth";
import { parseErrorBody, readBody } from "./http";
import { environmentNetworkError, isNetworkError } from "./network";

export type ConnectionTestResult =
  /**
   * `accessDenied`: the environment answered, but refused the request (403).
   * `detail`: the reason from the 403 body, when it has one.
   */
  { valid: true; accessDenied?: boolean; detail?: string } | { valid: false; error: string };

const VERIFY_TIMEOUT_MS = 15_000;

function connectionFailure(err: unknown, endpoint: string): ConnectionTestResult {
  if (err instanceof Error && err.name === "AbortError") {
    return { valid: false, error: "Environment is not responding (15s timeout) — check the Environment URL" };
  }
  if (isNetworkError(err)) return { valid: false, error: environmentNetworkError(err, endpoint).message };
  return { valid: false, error: err instanceof Error ? err.message : String(err) };
}

function rejectedTokenMessage(tenant: TenantConfig): string {
  return tenant.platformToken
    ? "The environment rejected the platform token — it is expired or revoked, or was created in another environment"
    : "The environment rejected the token — the OAuth client belongs to another account, or the SSO endpoint does not match this environment";
}

/** True for a query:verify response body: JSON with a boolean `valid`. */
function isVerifyAnswer(body: string): boolean {
  try {
    return typeof (JSON.parse(body) as { valid?: unknown } | null)?.valid === "boolean";
  } catch {
    return false;
  }
}

export async function testTenantConnection(tenant: TenantConfig): Promise<ConnectionTestResult> {
  const credentials = await validateTenantCredentials(tenant);
  if (!credentials.valid) return credentials;

  const endpoint = `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:verify`;
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), VERIFY_TIMEOUT_MS);
  let response: Response;
  let body: string;
  try {
    const accessToken = await getAccessToken(tenant);
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query: "fetch logs | limit 1" }),
      signal: timeoutCtrl.signal,
    });
    body = await readBody(response, accessToken);
  } catch (err) {
    return connectionFailure(err, endpoint);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    return { valid: false, error: rejectedTokenMessage(tenant) };
  }
  // 403 = reachable and token accepted, but refused (missing scope, no IAM
  // permission, token from another environment). Reported as such, not as success.
  if (response.status === 403 && !body.trimStart().startsWith("<")) {
    const detail = parseErrorBody(body)?.message;
    return detail ? { valid: true, accessDenied: true, detail } : { valid: true, accessDenied: true };
  }
  // Only the answer query:verify gives counts: any other server, or a failing
  // one, must not pass as a verified connection.
  if (response.ok && isVerifyAnswer(body)) return { valid: true };
  if (response.status >= 500 || response.status === 429) {
    return { valid: false, error: `The environment answered HTTP ${response.status} — try again in a moment` };
  }
  return {
    valid: false,
    error: `This does not look like a Dynatrace platform environment (HTTP ${response.status}). Expected https://<environment-id>.apps.dynatrace.com`,
  };
}
