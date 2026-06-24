// Dynatrace Grail API client.
// Pure async functions — never call showToast, never touch React state.
// UI hooks wrap these for view-commands; background commands call them directly.

import { ZodError, z } from "zod";
import { getAccessToken, invalidateTokenCache, OAuthError, TenantConfig } from "../auth";
import { grailResponseSchema } from "./schema";

export interface GrailQueryOptions {
  timeframe?: { start: string; end: string };
  /** AbortSignal from the caller (e.g. unmount abort from a UI hook). */
  signal?: AbortSignal;
  maxResultRecords?: number;
  /** Client-side fetch timeout in ms. Default 30 s (view), use 15 000 for background. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

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
      "Access denied — OAuth client is missing required scopes (storage:*:read, entity:read). Check Manage Tenants.",
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

  if (rawText.trimStart().startsWith("<")) {
    throw new Error(
      "Server returned an HTML page instead of JSON. " +
        "This usually means the endpoint URL is wrong or the token has expired. " +
        "Check your tenant configuration in Manage Tenants.",
    );
  }

  let parsedResponse;
  try {
    parsedResponse = grailResponseSchema.parse(JSON.parse(rawText));
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

  if (parsedResponse.state === "RUNNING") {
    throw new Error("Query still running — narrow the timeframe or reduce data volume");
  }

  return (parsedResponse.result?.records ?? []) as T[];
}

/**
 * Like executeDqlQuery but validates each record against a Zod schema.
 * Records that fail validation are silently skipped; caller receives a count of skipped records.
 * Use this when you need strong typing on individual records and can tolerate partial results.
 */
export async function executeDqlQueryValidated<T>(
  tenant: TenantConfig,
  query: string,
  schema: z.ZodType<T>,
  options?: GrailQueryOptions,
): Promise<{ records: T[]; skipped: number }> {
  const raw = await executeDqlQuery<Record<string, unknown>>(tenant, query, options);
  let skipped = 0;
  const records: T[] = [];
  for (const item of raw) {
    const result = schema.safeParse(item);
    if (result.success) {
      records.push(result.data);
    } else {
      skipped++;
    }
  }
  return { records, skipped };
}
