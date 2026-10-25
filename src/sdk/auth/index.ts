/**
 * SDK · auth — OAuth 2.0 client-credentials for Dynatrace SSO.
 *
 * Tokens are cached in-process (never persisted to disk) with a 30-second
 * proactive refresh window. This module has zero Raycast/React imports — it is
 * a standalone TypeScript client (enforced by eslint + CI grep).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantConfig {
  id: string;
  name: string;
  tenantEndpoint: string; // e.g. https://abc123.live.dynatrace.com
  clientId: string;
  clientSecret: string;
  ssoEndpoint: string; // default: derived from tenantEndpoint (prod/dev/sprint SSO)
  scopes: string[]; // e.g. ["storage:logs:read", "storage:spans:read"]
}

interface CachedToken {
  access_token: string;
  exp: number; // Date.now() + expires_in * 1000
}

// ── SSO endpoint ──────────────────────────────────────────────────────────────
// SaaS prod environments use https://sso.dynatrace.com/sso/oauth2/token.
// Other environments can set a custom SSO endpoint per tenant ("SSO endpoint
// (advanced)" in Manage Tenants).

export const PROD_SSO_ENDPOINT = "https://sso.dynatrace.com/sso/oauth2/token";

/** Extracts a human-readable reason from an OAuth error body (JSON or form). */
function describeOAuthBody(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: string; error_description?: string };
    const parts = [json.error, json.error_description].filter(Boolean);
    if (parts.length) return parts.join(": ");
  } catch {
    // not JSON — fall through
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

// ── Error class ───────────────────────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
  ) {
    // Redact client_secret if it somehow appears in the error body
    const safeBody = body.replace(/client_secret=[^&\s]+/g, "client_secret=[REDACTED]");
    super(`OAuth error ${statusCode}: ${safeBody}`);
    this.name = "OAuthError";
  }
}

// ── In-memory cache (tokens never written to disk) ────────────────────────────
// Each Raycast command is a separate process — cache lives only for the duration
// of the command. One extra SSO request per command launch is acceptable since
// Dynatrace OAuth tokens live ~5 min anyway.

const tokenCache = new Map<string, CachedToken>();

const REFRESH_BUFFER_MS = 30_000; // refresh 30 seconds before expiry

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given tenant.
 * Caches tokens in memory and proactively refreshes 30 seconds before expiry.
 */
export async function getAccessToken(tenant: TenantConfig): Promise<string> {
  const cacheKey = `token:${tenant.id}`;

  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - Date.now() > REFRESH_BUFFER_MS) {
    return cached.access_token;
  }

  // Fetch a new token
  const scopeString = tenant.scopes.join(" ");
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: tenant.clientId,
    client_secret: tenant.clientSecret,
    scope: scopeString,
  });

  const ssoTimeout = new AbortController();
  const ssoTimer = setTimeout(() => ssoTimeout.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(tenant.ssoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: ssoTimeout.signal,
    });
  } catch (fetchErr) {
    clearTimeout(ssoTimer);
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      throw new OAuthError(0, "SSO endpoint is not responding (15s timeout)");
    }
    throw fetchErr;
  } finally {
    clearTimeout(ssoTimer);
  }

  const body = await res.text();

  if (!res.ok) {
    throw new OAuthError(res.status, body);
  }

  let tokenData: { access_token: string; expires_in: number };
  try {
    tokenData = JSON.parse(body) as { access_token: string; expires_in: number };
  } catch {
    throw new OAuthError(res.status, `Failed to parse token response: ${body.slice(0, 200)}`);
  }

  if (!tokenData.access_token || !Number.isFinite(tokenData.expires_in)) {
    throw new OAuthError(res.status, "Token response missing access_token or expires_in");
  }

  const cacheEntry: CachedToken = {
    access_token: tokenData.access_token,
    exp: Date.now() + tokenData.expires_in * 1000,
  };

  tokenCache.set(cacheKey, cacheEntry);
  return tokenData.access_token;
}

/**
 * Invalidate cached token for a tenant (force refresh on next call).
 */
export function invalidateTokenCache(tenantId: string): void {
  const cacheKey = `token:${tenantId}`;
  tokenCache.delete(cacheKey);
}

/**
 * Validates tenant credentials by attempting to get an access token.
 * Returns { valid: true } on success, or { valid: false, error } on failure.
 */
export async function validateTenantCredentials(
  tenant: TenantConfig,
): Promise<{ valid: true } | { valid: false; error: string }> {
  try {
    await getAccessToken(tenant);
    return { valid: true };
  } catch (err) {
    if (err instanceof OAuthError) {
      const detail = describeOAuthBody(err.body);
      // Surface the SSO's own reason — distinguishes invalid_client (bad
      // ID/Secret) from invalid_scope (a scope the OAuth client isn't granted).
      if (err.statusCode === 400 || err.statusCode === 401) {
        const hint =
          detail?.includes("invalid_scope") === true
            ? " — one or more scopes are not granted to this OAuth client; remove the unsupported scopes"
            : detail?.includes("invalid_client") === true
              ? " — check the Client ID and Secret"
              : detail?.includes("invalid_request") === true
                ? " — malformed token request; check Client ID, Secret, and SSO endpoint"
                : "";
        return { valid: false, error: `${detail ?? "Invalid client credentials"}${hint}` };
      }
      if (err.statusCode === 403) {
        return { valid: false, error: detail ? `Forbidden: ${detail}` : "Forbidden — check scopes and permissions" };
      }
      return { valid: false, error: detail ? `OAuth ${err.statusCode}: ${detail}` : `OAuth error ${err.statusCode}` };
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      return { valid: false, error: "Cannot reach SSO endpoint — check URL and network" };
    }
    return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
