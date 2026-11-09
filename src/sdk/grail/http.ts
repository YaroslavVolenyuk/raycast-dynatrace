// Token and error-body handling shared by the Grail query clients (query.ts, assist.ts).

import { getAccessToken, OAuthError, redactSecret, type TenantConfig } from "../auth";
import { isNetworkError, ssoNetworkError } from "./network";

/** Gets an access token, mapping OAuth and SSO network failures to user-facing errors. */
export async function acquireAccessToken(tenant: TenantConfig): Promise<string> {
  try {
    return await getAccessToken(tenant);
  } catch (authErr) {
    if (authErr instanceof OAuthError) {
      throw new Error(`OAuth error: check client_id / client_secret in Manage Tenants (${authErr.statusCode})`);
    }
    if (isNetworkError(authErr)) throw ssoNetworkError(authErr, tenant.ssoEndpoint);
    throw authErr;
  }
}

/**
 * Reads a response body with the bearer token cut out. A proxy or debug page
 * may echo the request headers back, and the body becomes error text, which is
 * shown, copied and cached on disk by the menu bar (THREAT_MODEL.md C4).
 */
export async function readBody(response: Response, accessToken: string): Promise<string> {
  return redactSecret(await response.text(), accessToken);
}

/** The `error.message` and `error.code` of a JSON error body; undefined when it is not JSON or has no message. */
export function parseErrorBody(rawText: string): { message: string; code: unknown } | undefined {
  try {
    const error = JSON.parse(rawText)?.error;
    if (error?.message) return { message: error.message, code: error.code };
  } catch {
    // not JSON — the caller falls back to the status line
  }
  return undefined;
}
