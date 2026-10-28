// Connection test for a tenant: credentials (SSO) AND the environment itself.
// A token from sso.dynatrace.com says nothing about the Environment URL — a
// typo'd host would still test green — so the environment is asked too, with
// `query:verify` (parses a DQL query without running it: free, no data read).

import { getAccessToken, validateTenantCredentials, type TenantConfig } from "../auth";
import { environmentNetworkError, isNetworkError } from "./network";

export type ConnectionTestResult =
  /** `accessDenied`: the environment answered, but refused the request (403) — a scope is missing. */
  { valid: true; accessDenied?: boolean } | { valid: false; error: string };

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
    body = await response.text();
  } catch (err) {
    return connectionFailure(err, endpoint);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    return { valid: false, error: rejectedTokenMessage(tenant) };
  }
  // 403 = reachable and token accepted, but a scope is missing. Reported as such,
  // not as success: the scopes listed in the tenant may not match the real ones.
  const looksLikePlatform = !body.trimStart().startsWith("<") && response.status !== 404;
  if (!looksLikePlatform) {
    return {
      valid: false,
      error: `This does not look like a Dynatrace platform environment (HTTP ${response.status}). Expected https://<environment-id>.apps.dynatrace.com`,
    };
  }
  return response.status === 403 ? { valid: true, accessDenied: true } : { valid: true };
}
