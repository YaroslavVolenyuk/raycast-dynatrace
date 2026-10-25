// Dynatrace Grail API client.
// Pure async functions — never call showToast, never touch React state.
// UI hooks wrap these for view-commands; background commands call them directly.

import { ZodError } from "zod";
import { getAccessToken, invalidateTokenCache, OAuthError, TenantConfig } from "../auth";
import { grailResponseSchema } from "./schema";
import { environmentNetworkError, isNetworkError, ssoNetworkError } from "./network";

export interface GrailQueryOptions {
  timeframe?: { start: string; end: string };
  /** AbortSignal from the caller (e.g. unmount abort from a UI hook). */
  signal?: AbortSignal;
  maxResultRecords?: number;
  /** Client-side fetch timeout in ms. Default 30 s (view), use 15 000 for background. */
  timeoutMs?: number;
  /** Overall budget for polling a long-running query. Default 60 s. */
  pollDeadlineMs?: number;
  /** Scopes the calling resource needs; named in the 403 error message. */
  requiredScopes?: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;

// ── Long-running query polling ────────────────────────────────────────────────
// query:execute answers within requestTimeoutMilliseconds; if the query is
// still RUNNING it returns a requestToken which must be polled via
//   GET /platform/storage/query/v1/query:poll?request-token=<token>
// (the token must be URL-encoded — it can contain '+', '=' etc.).
// Each poll long-polls server-side via request-timeout-milliseconds; we keep
// polling until SUCCEEDED/FAILED or the overall deadline expires.
const POLL_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_DEADLINE_MS = 60_000;

const BASE_PAYLOAD = {
  defaultSamplingRatio: 1,
  defaultScanLimitGbytes: 100,
  enablePreview: true,
  enforceQueryConsumptionLimit: true,
  fetchTimeoutSeconds: 60,
  includeContributions: true,
  locale: "en_US",
  maxResultBytes: 1_000_000,
  maxResultRecords: 1000,
  requestTimeoutMilliseconds: 5000,
  timezone: "UTC",
};

/** Combines two AbortSignals into one that aborts when either fires. */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  if (a.aborted || b.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  a.addEventListener("abort", () => ctrl.abort(), { once: true });
  b.addEventListener("abort", () => ctrl.abort(), { once: true });
  return ctrl.signal;
}

/**
 * Executes a DQL query against the Dynatrace Grail API.
 * Handles token refresh, 401-retry-once, structured error messages, and client timeout.
 * Throws on any error — caller is responsible for error handling / UI feedback.
 */
export async function executeDqlQuery<T = Record<string, unknown>>(
  tenant: TenantConfig,
  query: string,
  options: GrailQueryOptions = {},
  _isRetry = false,
): Promise<T[]> {
  const { timeframe, signal: userSignal, maxResultRecords, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const timeoutCtrl = new AbortController();
  const timeout = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  const signal = userSignal ? combineSignals(userSignal, timeoutCtrl.signal) : timeoutCtrl.signal;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(tenant);
  } catch (authErr) {
    clearTimeout(timeout);
    if (authErr instanceof OAuthError) {
      throw new Error(`OAuth error: check client_id / client_secret in Manage Tenants (${authErr.statusCode})`);
    }
    if (isNetworkError(authErr)) throw ssoNetworkError(authErr, tenant.ssoEndpoint);
    throw authErr;
  }

  const endpoint = `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:execute`;
  const payload = {
    ...BASE_PAYLOAD,
    query,
    ...(maxResultRecords != null && { maxResultRecords }),
    ...(timeframe && { defaultTimeframeStart: timeframe.start, defaultTimeframeEnd: timeframe.end }),
  };

  let response: Response;
  let rawText: string;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
      signal,
    });
    rawText = await response.text();
  } catch (fetchErr) {
    clearTimeout(timeout);
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      // Distinguish timeout abort from user/unmount abort
      if (timeoutCtrl.signal.aborted) {
        throw new Error(`Dynatrace is not responding (${Math.round(timeoutMs / 1000)}s timeout)`);
      }
      throw fetchErr; // let caller handle user abort (AbortError swallowed as null in hook)
    }
    if (isNetworkError(fetchErr)) throw environmentNetworkError(fetchErr, endpoint);
    throw fetchErr;
  } finally {
    clearTimeout(timeout);
  }

  // 401: invalidate cached token and retry once
  if (response.status === 401 && !_isRetry) {
    invalidateTokenCache(tenant.id);
    return executeDqlQuery<T>(tenant, query, { ...options, signal: userSignal }, true);
  }

  if (response.status === 401) {
    throw new Error("Authentication failed — token rejected by Dynatrace. Check credentials in Manage Tenants.");
  }
  if (response.status === 403) {
    throw new Error(
      `Access denied — OAuth client is missing required scopes${
        options.requiredScopes?.length ? ` (${options.requiredScopes.join(", ")})` : ""
      }. Check Manage Tenants.`,
    );
  }

  if (!response.ok) {
    try {
      const errBody = JSON.parse(rawText);
      if (errBody?.error?.message) {
        throw new Error(`Dynatrace: ${errBody.error.message} (code ${errBody.error.code})`);
      }
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Dynatrace:")) throw parseErr;
    }
    const preview = rawText.trimStart().startsWith("<")
      ? `Server returned HTML (status ${response.status}). Check your tenant endpoint URL.`
      : `HTTP ${response.status}: ${rawText.slice(0, 300)}`;
    throw new Error(preview);
  }

  let parsedResponse = parseGrailBody(rawText);

  // Long-running query: poll query:poll with the request token until it
  // finishes or the deadline expires.
  const deadline = Date.now() + (options.pollDeadlineMs ?? DEFAULT_POLL_DEADLINE_MS);
  while (parsedResponse.state !== "SUCCEEDED" && parsedResponse.state !== "FAILED") {
    const token = parsedResponse.requestToken;
    if (!token) {
      throw new Error(`Query state is ${parsedResponse.state} but Dynatrace returned no request token to poll`);
    }
    if (Date.now() >= deadline) {
      throw new Error("Query did not finish in time — narrow the timeframe or reduce data volume");
    }
    parsedResponse = await pollGrailQuery(tenant, token, userSignal, timeoutMs);
  }

  if (parsedResponse.state === "FAILED" || parsedResponse.error) {
    const err = parsedResponse.error;
    throw new Error(err ? `Dynatrace: ${err.message} (code ${err.code})` : "Dynatrace: query failed");
  }

  return (parsedResponse.result?.records ?? []) as T[];
}

/** Parses a Grail response body, rejecting HTML and unexpected shapes. */
function parseGrailBody(rawText: string) {
  if (rawText.trimStart().startsWith("<")) {
    throw new Error(
      "Server returned an HTML page instead of JSON. " +
        "This usually means the endpoint URL is wrong or the token has expired. " +
        "Check your tenant configuration in Manage Tenants.",
    );
  }
  try {
    return grailResponseSchema.parse(JSON.parse(rawText));
  } catch (zodErr) {
    if (zodErr instanceof ZodError) {
      throw new Error(
        `Unexpected Grail response format: ${zodErr.issues
          .slice(0, 3)
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; ")}`,
      );
    }
    throw zodErr;
  }
}

/**
 * One long-poll of a running query. The server holds the request open for up
 * to POLL_REQUEST_TIMEOUT_MS and answers earlier if the query finishes.
 */
async function pollGrailQuery(
  tenant: TenantConfig,
  requestToken: string,
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ReturnType<typeof parseGrailBody>> {
  // getAccessToken serves from the in-memory cache; a token expiring mid-poll
  // is refreshed transparently.
  const accessToken = await getAccessToken(tenant);

  const endpoint =
    `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:poll` +
    `?request-token=${encodeURIComponent(requestToken)}` +
    `&request-timeout-milliseconds=${POLL_REQUEST_TIMEOUT_MS}`;

  const timeoutCtrl = new AbortController();
  const timeout = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  const signal = userSignal ? combineSignals(userSignal, timeoutCtrl.signal) : timeoutCtrl.signal;

  let response: Response;
  let rawText: string;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    rawText = await response.text();
  } catch (fetchErr) {
    if (fetchErr instanceof Error && fetchErr.name === "AbortError" && timeoutCtrl.signal.aborted) {
      throw new Error(`Dynatrace is not responding (${Math.round(timeoutMs / 1000)}s timeout)`);
    }
    throw fetchErr;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    invalidateTokenCache(tenant.id);
    throw new Error("Authentication failed while polling query results. Check credentials in Manage Tenants.");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while polling query results: ${rawText.slice(0, 300)}`);
  }

  return parseGrailBody(rawText);
}
