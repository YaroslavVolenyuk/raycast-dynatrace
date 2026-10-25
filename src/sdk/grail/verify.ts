// Connection test for a tenant: credentials (SSO) AND the environment itself.
// A token from sso.dynatrace.com says nothing about the Environment URL — a
// typo'd host would still test green — so the environment is asked too, with
// `query:verify` (parses a DQL query without running it: free, no data read).

import { getAccessToken, validateTenantCredentials, type TenantConfig } from "../auth";
import { environmentNetworkError, isNetworkError } from "./network";

export type ConnectionTestResult = { valid: true } | { valid: false; error: string };

const VERIFY_TIMEOUT_MS = 15_000;

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
    if (err instanceof Error && err.name === "AbortError") {
      return { valid: false, error: "Environment is not responding (15s timeout) — check the Environment URL" };
    }
    if (isNetworkError(err)) return { valid: false, error: environmentNetworkError(err, endpoint).message };
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    return {
      valid: false,
      error:
        "The environment rejected the token — the OAuth client belongs to another account, or the SSO endpoint does not match this environment",
    };
  }
  // 403 = reachable and token accepted, a scope is missing: the scope check reports that.
  const looksLikePlatform = !body.trimStart().startsWith("<") && response.status !== 404;
  if (!looksLikePlatform) {
    return {
      valid: false,
      error: `This does not look like a Dynatrace platform environment (HTTP ${response.status}). Expected https://<environment-id>.apps.dynatrace.com`,
    };
  }
  return { valid: true };
}
