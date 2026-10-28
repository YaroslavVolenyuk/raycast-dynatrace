// Dynatrace Grail API client.
// Pure async functions — never call showToast, never touch React state.
// UI hooks wrap these for view-commands; background commands call them directly.

import { ZodError } from "zod";
import { credentialsKind, getAccessToken, invalidateTokenCache, TenantConfig } from "../auth";
import { grailResponseSchema, type GrailNotification } from "./schema";
import { acquireAccessToken, parseErrorBody } from "./http";
import { environmentNetworkError, isNetworkError } from "./network";

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
  /** Receives Grail's result notifications (truncation, scan limit, …) of a successful query. */
  onNotifications?: (notifications: GrailNotification[]) => void;
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
/** query:cancel is best-effort cleanup; never let it hold up the caller for long. */
const CANCEL_TIMEOUT_MS = 5_000;

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

/** Client-side timeout for one request, combined with the caller's signal. */
interface RequestTimeout {
  signal: AbortSignal;
  ms: number;
  /** True when the timeout (not the caller) aborted the request. */
  timedOut: () => boolean;
  clear: () => void;
}

function startRequestTimeout(userSignal: AbortSignal | undefined, timeoutMs: number): RequestTimeout {
  const timeoutCtrl = new AbortController();
  const timeout = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  return {
    signal: userSignal ? combineSignals(userSignal, timeoutCtrl.signal) : timeoutCtrl.signal,
    ms: timeoutMs,
    timedOut: () => timeoutCtrl.signal.aborted,
    clear: () => clearTimeout(timeout),
  };
}

function notRespondingError(timeout: RequestTimeout): Error {
  return new Error(`Dynatrace is not responding (${Math.round(timeout.ms / 1000)}s timeout)`);
}

/** Sends query:execute and reads the body; the timeout is cleared either way. */
async function postExecute(
  endpoint: string,
  accessToken: string,
  payload: Record<string, unknown>,
  timeout: RequestTimeout,
): Promise<{ response: Response; rawText: string }> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    return { response, rawText: await response.text() };
  } catch (fetchErr) {
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      // Distinguish timeout abort from user/unmount abort
      if (timeout.timedOut()) throw notRespondingError(timeout);
      throw fetchErr; // let caller handle user abort (AbortError swallowed as null in hook)
    }
    if (isNetworkError(fetchErr)) throw environmentNetworkError(fetchErr, endpoint);
    throw fetchErr;
  } finally {
    timeout.clear();
  }
}

/** The `Dynatrace: <message> (code <code>)` error of a JSON error body, if it has one. */
function bodyErrorMessage(rawText: string): string | undefined {
  const body = parseErrorBody(rawText);
  return body && `Dynatrace: ${body.message} (code ${body.code})`;
}

/** Maps a non-2xx query:execute response to a user-facing error; undefined when the response is ok. */
function toHttpError(
  response: Response,
  rawText: string,
  tenant: TenantConfig,
  requiredScopes: readonly string[] | undefined,
): Error | undefined {
  if (response.status === 401) {
    return new Error(
      `Authentication failed — the ${credentialsKind(tenant)} was rejected by Dynatrace. Check the tenant in Manage Tenants.`,
    );
  }
  if (response.status === 403) {
    return new Error(
      `Access denied — the ${credentialsKind(tenant)} is missing required scopes${
        requiredScopes?.length ? ` (${requiredScopes.join(", ")})` : ""
      }. Check Manage Tenants.`,
    );
  }
  if (response.ok) return undefined;
  const bodyError = bodyErrorMessage(rawText);
  if (bodyError) return new Error(bodyError);
  const preview = rawText.trimStart().startsWith("<")
    ? `Server returned HTML (status ${response.status}). Check your tenant endpoint URL.`
    : `HTTP ${response.status}: ${rawText.slice(0, 300)}`;
  return new Error(preview);
}

type GrailBody = ReturnType<typeof parseGrailBody>;

/**
 * Long-running query: poll query:poll with the request token until it
 * finishes or the deadline expires. If we give up for any reason (deadline,
 * abort, poll error) the query is cancelled server-side: otherwise it keeps
 * scanning — and billing — with nobody waiting for the result.
 */
async function pollUntilDone(
  tenant: TenantConfig,
  initial: GrailBody,
  options: GrailQueryOptions,
  timeoutMs: number,
): Promise<GrailBody> {
  const deadline = Date.now() + (options.pollDeadlineMs ?? DEFAULT_POLL_DEADLINE_MS);
  let parsedResponse = initial;
  let runningToken: string | undefined;
  try {
    while (parsedResponse.state !== "SUCCEEDED" && parsedResponse.state !== "FAILED") {
      const token = parsedResponse.requestToken;
      if (!token) {
        throw new Error(`Query state is ${parsedResponse.state} but Dynatrace returned no request token to poll`);
      }
      runningToken = token;
      if (Date.now() >= deadline) {
        throw new Error("Query did not finish in time — narrow the timeframe or reduce data volume");
      }
      parsedResponse = await pollGrailQuery(tenant, token, options.signal, timeoutMs);
    }
  } catch (pollErr) {
    if (runningToken) void cancelGrailQuery(tenant, runningToken);
    throw pollErr;
  }
  return parsedResponse;
}

function buildExecutePayload(query: string, options: GrailQueryOptions) {
  const { timeframe, maxResultRecords } = options;
  return {
    ...BASE_PAYLOAD,
    query,
    ...(maxResultRecords != null && { maxResultRecords }),
    ...(timeframe && { defaultTimeframeStart: timeframe.start, defaultTimeframeEnd: timeframe.end }),
  };
}

/** Throws for a query that finished as FAILED or carries an error. */
function assertQuerySucceeded(parsedResponse: GrailBody): void {
  if (parsedResponse.state === "FAILED" || parsedResponse.error) {
    const err = parsedResponse.error;
    throw new Error(err ? `Dynatrace: ${err.message} (code ${err.code})` : "Dynatrace: query failed");
  }
}

/** Reports the notifications of a successful query and returns its records. */
function toRecords<T>(parsedResponse: GrailBody, options: GrailQueryOptions): T[] {
  const notifications = parsedResponse.result?.metadata?.grail?.notifications;
  if (notifications?.length) options.onNotifications?.(notifications);

  return (parsedResponse.result?.records ?? []) as T[];
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
  const { signal: userSignal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const timeout = startRequestTimeout(userSignal, timeoutMs);
  const accessToken = await acquireAccessToken(tenant).catch((err: unknown) => {
    timeout.clear();
    throw err;
  });

  const endpoint = `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:execute`;
  const payload = buildExecutePayload(query, options);

  const { response, rawText } = await postExecute(endpoint, accessToken, payload, timeout);

  // 401: invalidate cached token and retry once. A platform token is used as is,
  // so asking again would only repeat the same request.
  if (response.status === 401 && !_isRetry && !tenant.platformToken) {
    invalidateTokenCache(tenant.id);
    return executeDqlQuery<T>(tenant, query, { ...options, signal: userSignal }, true);
  }

  const httpError = toHttpError(response, rawText, tenant, options.requiredScopes);
  if (httpError) throw httpError;

  const parsedResponse = await pollUntilDone(tenant, parseGrailBody(rawText), options, timeoutMs);
  assertQuerySucceeded(parsedResponse);
  return toRecords<T>(parsedResponse, options);
}

/**
 * Cancels a running query (POST query:cancel). Best-effort and never throws:
 * the query may already have finished, or the network may be gone.
 */
export async function cancelGrailQuery(tenant: TenantConfig, requestToken: string): Promise<void> {
  try {
    const accessToken = await getAccessToken(tenant);
    const endpoint =
      `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:cancel` +
      `?request-token=${encodeURIComponent(requestToken)}`;
    await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    });
  } catch {
    // ignore — cancellation is cleanup, not part of the result
  }
}

/** Parses a Grail response body, rejecting HTML and unexpected shapes. */
function parseGrailBody(rawText: string) {
  if (rawText.trimStart().startsWith("<")) {
    throw new Error(
      "Server returned an HTML page instead of JSON. " +
        "This usually means the endpoint URL is wrong or the token has expired. " +
        "Check your tenant configuration.",
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
): Promise<GrailBody> {
  // getAccessToken serves from the in-memory cache; a token expiring mid-poll
  // is refreshed transparently.
  const accessToken = await getAccessToken(tenant);

  const endpoint =
    `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/query:poll` +
    `?request-token=${encodeURIComponent(requestToken)}` +
    `&request-timeout-milliseconds=${POLL_REQUEST_TIMEOUT_MS}`;

  const timeout = startRequestTimeout(userSignal, timeoutMs);

  let response: Response;
  let rawText: string;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: timeout.signal,
    });
    rawText = await response.text();
  } catch (fetchErr) {
    if (fetchErr instanceof Error && fetchErr.name === "AbortError" && timeout.timedOut()) {
      throw notRespondingError(timeout);
    }
    throw fetchErr;
  } finally {
    timeout.clear();
  }

  if (response.status === 401) {
    invalidateTokenCache(tenant.id);
    throw new Error(
      `Authentication failed while polling query results. Check the ${credentialsKind(tenant)} in Manage Tenants.`,
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while polling query results: ${rawText.slice(0, 300)}`);
  }

  return parseGrailBody(rawText);
}
