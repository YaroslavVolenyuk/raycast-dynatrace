/**
 * SDK · auth — OAuth 2.0 client-credentials for Dynatrace SSO, or a platform
 * token used as is.
 *
 * Tokens are cached in-process (never persisted to disk) with a 30-second
 * proactive refresh window. This module has zero Raycast/React imports — it is
 * a standalone TypeScript client (enforced by eslint + CI grep).
 */

import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantConfig {
  id: string;
  name: string;
  tenantEndpoint: string; // e.g. https://abc123.live.dynatrace.com
  clientId: string;
  clientSecret: string;
  ssoEndpoint: string; // default: derived from tenantEndpoint (ssoEndpointFor)
  scopes: string[]; // e.g. ["storage:logs:read", "storage:spans:read"]
  /**
   * Platform token (dt0s16.…), sent as the bearer token as is. When set, the
   * OAuth fields are unused (empty) and queries run with the permissions of the
   * user who created the token. `scopes` then lists what the user says the token
   * carries: the token cannot be asked for them, but local scope checks need them.
   */
  platformToken?: string;
}

/** What holds this tenant's scopes — for error messages. */
export function credentialsKind(tenant: Pick<TenantConfig, "platformToken">): string {
  return tenant.platformToken ? "platform token" : "OAuth client";
}

interface CachedToken {
  access_token: string;
  exp: number; // Date.now() + expires_in * 1000
}

// ── SSO endpoint ──────────────────────────────────────────────────────────────
// SaaS prod environments use https://sso.dynatrace.com/sso/oauth2/token; the
// dev and sprint stages (<id>.dev.apps.dynatracelabs.com, <id>.sprint.…) have
// their own SSO, and an OAuth client only works with the SSO it was created on.
// Other setups set a custom SSO endpoint per tenant in Manage Tenants.

export const PROD_SSO_ENDPOINT = "https://sso.dynatrace.com/sso/oauth2/token";

const STAGE_SSO = /\.(dev|sprint)\.apps\.dynatracelabs\.com$/;

/** The SSO token endpoint that belongs to an environment URL. */
export function ssoEndpointFor(tenantEndpoint: string): string {
  try {
    const stage = new URL(tenantEndpoint).hostname.match(STAGE_SSO)?.[1];
    if (stage) return `https://sso-${stage}.dynatracelabs.com/sso/oauth2/token`;
  } catch {
    // invalid URL — the form reports it; fall back to production
  }
  return PROD_SSO_ENDPOINT;
}

/** The string-valued reason fields of a parsed OAuth error body, in display order. */
function oauthErrorParts(json: { error?: unknown; error_description?: unknown; message?: unknown }): unknown[] {
  const err = json.error;
  const nested = err && typeof err === "object" ? (err as { message?: unknown; code?: unknown }) : undefined;
  return [
    typeof err === "string" ? err : undefined,
    typeof nested?.message === "string" ? nested.message : undefined,
    typeof json.error_description === "string" ? json.error_description : undefined,
    typeof json.message === "string" ? json.message : undefined,
  ].filter(Boolean);
}

/** Extracts a human-readable reason from an OAuth error body (JSON or form). */
function describeOAuthBody(body: string): string | null {
  try {
    // OAuth servers answer { error: "invalid_client", error_description }; a wrong
    // "SSO endpoint" pointing at a Dynatrace API answers { error: { code, message } }.
    const parts = oauthErrorParts(JSON.parse(body) as Parameters<typeof oauthErrorParts>[0]);
    if (parts.length) return parts.join(": ");
  } catch {
    // not JSON — fall through
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

// ── Error class ───────────────────────────────────────────────────────────────

export class OAuthError extends Error {
  /** The response body with any `client_secret=…` redacted; this is what reaches the UI. */
  public body: string;

  constructor(
    public statusCode: number,
    body: string,
  ) {
    // An SSO (or a proxy in front of it) may echo the form body back in its error.
    const safeBody = body.replace(/client_secret=[^&\s"']+/g, "client_secret=[REDACTED]");
    super(`OAuth error ${statusCode}: ${safeBody}`);
    this.name = "OAuthError";
    this.body = safeBody;
  }
}

/**
 * Removes the secret itself from a response body, raw and URL-encoded, wherever
 * it appears (JSON error_description, decoded echoes, …). OAuthError only knows
 * the `client_secret=` pattern; this catches the value without its key.
 */
function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  const forms = new Set([secret, encodeURIComponent(secret), new URLSearchParams({ s: secret }).toString().slice(2)]);
  let out = text;
  for (const form of forms) out = out.split(form).join("[REDACTED]");
  return out;
}

/** True for the TypeError fetch throws when `redirect: "error"` meets a 3xx. */
function isRedirectRefusal(err: unknown): boolean {
  const cause = (err as { cause?: { message?: unknown } } | undefined)?.cause;
  return err instanceof TypeError && typeof cause?.message === "string" && /redirect/i.test(cause.message);
}

// ── In-memory cache (tokens never written to disk) ────────────────────────────
// Each Raycast command is a separate process — cache lives only for the duration
// of the command. One extra SSO request per command launch is acceptable since
// Dynatrace OAuth tokens live ~5 min anyway.

const tokenCache = new Map<string, CachedToken>();

const REFRESH_BUFFER_MS = 30_000; // refresh 30 seconds before expiry

/**
 * Cache key per tenant *and* credential set: editing a tenant keeps its id, and a
 * token minted with the old secret must not be served for the new one. The
 * secret is hashed so it never appears in the key itself.
 */
function cacheKeyFor(tenant: TenantConfig): string {
  return `token:${tenant.id}:${credentialsFingerprint(tenant)}`;
}

/**
 * SHA-256 over everything that decides what a token may see. Changes when any
 * credential or scope changes; the secrets themselves cannot be read back from it.
 */
export function credentialsFingerprint(tenant: TenantConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify([tenant.clientId, tenant.clientSecret, tenant.ssoEndpoint, tenant.scopes, tenant.platformToken]),
    )
    .digest("hex");
}

/** POSTs the client-credentials grant to the tenant's SSO endpoint (15s timeout). */
async function requestToken(tenant: TenantConfig): Promise<Response> {
  const scopeString = tenant.scopes.join(" ");
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: tenant.clientId,
    client_secret: tenant.clientSecret,
    scope: scopeString,
  });

  const ssoTimeout = new AbortController();
  const ssoTimer = setTimeout(() => ssoTimeout.abort(), 15_000);
  try {
    return await fetch(tenant.ssoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: ssoTimeout.signal,
      // Never follow a redirect: on 307/308 fetch re-sends the whole body, client
      // secret included, to whatever host the Location header names.
      redirect: "error",
    });
  } catch (fetchErr) {
    clearTimeout(ssoTimer);
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      throw new OAuthError(0, "SSO endpoint is not responding (15s timeout)");
    }
    if (isRedirectRefusal(fetchErr)) {
      throw new OAuthError(
        0,
        "SSO endpoint answered with a redirect, which is not followed so the client secret cannot be forwarded — enter the final token URL",
      );
    }
    throw fetchErr;
  } finally {
    clearTimeout(ssoTimer);
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given tenant.
 * Caches tokens in memory and proactively refreshes 30 seconds before expiry.
 */
export async function getAccessToken(tenant: TenantConfig): Promise<string> {
  if (tenant.platformToken) return tenant.platformToken;

  const cacheKey = cacheKeyFor(tenant);

  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - Date.now() > REFRESH_BUFFER_MS) {
    return cached.access_token;
  }

  const res = await requestToken(tenant);

  const body = redactSecret(await res.text(), tenant.clientSecret);

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

/** Scopes from `required` that the tenant's configured scope list does not include. */
export function findMissingScopes(tenant: Pick<TenantConfig, "scopes">, required: readonly string[]): string[] {
  return required.filter((scope) => !tenant.scopes.includes(scope));
}

/**
 * Invalidate cached token for a tenant (force refresh on next call).
 */
export function invalidateTokenCache(tenantId: string): void {
  const prefix = `token:${tenantId}:`;
  for (const key of tokenCache.keys()) {
    if (key.startsWith(prefix)) tokenCache.delete(key);
  }
}

// First match wins: invalid_scope outranks invalid_client outranks invalid_request.
const CREDENTIAL_HINTS: ReadonlyArray<readonly [code: string, hint: string]> = [
  ["invalid_scope", " — one or more scopes are not granted to this OAuth client; remove the unsupported scopes"],
  ["invalid_client", " — check the Client ID and Secret"],
  ["invalid_request", " — malformed token request; check Client ID, Secret, and SSO endpoint"],
];

/** Any status other than 400/401/403: 404 or an HTML page means the URL is not a token endpoint. */
function describeEndpointFailure(err: OAuthError, detail: string | null): string {
  const ssoHint =
    err.statusCode === 404 || err.body.trimStart().startsWith("<")
      ? " — this is not an SSO token endpoint; leave SSO Token Endpoint blank to use the one that belongs to the Environment URL"
      : "";
  const reason = detail ? `OAuth ${err.statusCode}: ${detail}` : `OAuth error ${err.statusCode}`;
  return `${reason}${ssoHint}`;
}

/** The user-facing message for a failed token request. */
function describeOAuthFailure(err: OAuthError): string {
  const detail = describeOAuthBody(err.body);
  // Surface the SSO's own reason — distinguishes invalid_client (bad
  // ID/Secret) from invalid_scope (a scope the OAuth client isn't granted).
  if (err.statusCode === 400 || err.statusCode === 401) {
    const hint = CREDENTIAL_HINTS.find(([code]) => detail?.includes(code))?.[1] ?? "";
    return `${detail ?? "Invalid client credentials"}${hint}`;
  }
  if (err.statusCode === 403) {
    return detail ? `Forbidden: ${detail}` : "Forbidden — check scopes and permissions";
  }
  return describeEndpointFailure(err, detail);
}

/**
 * Validates tenant credentials by attempting to get an access token.
 * Returns { valid: true } on success, or { valid: false, error } on failure.
 */
export async function validateTenantCredentials(
  tenant: TenantConfig,
): Promise<{ valid: true } | { valid: false; error: string }> {
  // No SSO step: the environment itself checks a platform token (testTenantConnection).
  if (tenant.platformToken) return { valid: true };
  try {
    // A test must ask the SSO, not the cache: the client may have been revoked meanwhile.
    invalidateTokenCache(tenant.id);
    await getAccessToken(tenant);
    return { valid: true };
  } catch (err) {
    if (err instanceof OAuthError) return { valid: false, error: describeOAuthFailure(err) };
    if (err instanceof TypeError && err.message.includes("fetch")) {
      return { valid: false, error: "Cannot reach SSO endpoint — check URL and network" };
    }
    return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
