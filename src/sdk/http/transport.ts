// Generic REST transport for Dynatrace REST endpoints (Config / Platform APIs).
// Handles authentication, classic-proxy resolution, timeout, retry, structured
// errors, schema validation and pagination.
//
// Mock support is intentionally NOT baked in here. Per REWRITE_PLAN, mock mode
// returns as a swappable MockTransport rather than `if (isMockMode())` branching
// sprinkled through the client.

import { ZodSchema, ZodError } from "zod";
import { getAccessToken, TenantConfig, OAuthError, invalidateTokenCache } from "../auth";
import { RestError, ValidationError, DavisCopilotUnavailableError } from "./errors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RestClientOptions<T = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: ZodSchema<T>;
  queryParams?: Record<string, string>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Client-side fetch timeout in ms. Default 30 s — same pattern as grail. */
  timeoutMs?: number;
}

export interface RestResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

const DEFAULT_TIMEOUT_MS = 30_000;

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

// ── Classic API proxy path rewrite ────────────────────────────────────────────

// Classic env-API v2 must go through the platform classic proxy when using OAuth:
//   /api/v2/slo  →  /platform/classic/environment-api/v2/slo
// Disable by setting tenant.useClassicProxy = false (e.g. for Managed environments
// where the classic proxy path is not available).
function resolvePath(path: string, tenant?: TenantConfig): string {
  const useProxy = tenant?.useClassicProxy !== false;
  if (useProxy && path.startsWith("/api/v2/")) {
    return path.replace("/api/v2/", "/platform/classic/environment-api/v2/");
  }
  return path;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function dynatraceRest<T = unknown>(
  tenant: TenantConfig,
  path: string,
  options: RestClientOptions<T> = {},
  _isRetry: boolean = false,
  _skipClassicProxy: boolean = false,
): Promise<RestResponse<T>> {
  const {
    method = "GET",
    body,
    schema,
    queryParams,
    signal: userSignal,
    headers: customHeaders,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let token: string;
  try {
    token = await getAccessToken(tenant);
  } catch (err) {
    if (err instanceof OAuthError) {
      throw new RestError(err.statusCode, "OAuth Error", `Failed to obtain access token: ${err.message}`, err);
    }
    throw err;
  }

  // Build URL — rewrite /api/v2/* to classic proxy path for OAuth compatibility
  const resolvedPath = _skipClassicProxy ? path : resolvePath(path, tenant);
  const baseUrl = `${tenant.tenantEndpoint}${resolvedPath}`;
  let url = baseUrl;

  if (queryParams) {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      params.append(key, value);
    });
    url = `${baseUrl}?${params.toString()}`;
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...customHeaders,
  });

  let requestBody: string | undefined;
  if (body && method !== "GET" && method !== "DELETE") {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  // Client-side timeout — a hung connection must not spin forever in the UI
  const timeoutCtrl = new AbortController();
  const timeout = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  const signal = userSignal ? combineSignals(userSignal, timeoutCtrl.signal) : timeoutCtrl.signal;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (timeoutCtrl.signal.aborted) {
        throw new RestError(0, "Timeout", `Dynatrace is not responding (${Math.round(timeoutMs / 1000)}s timeout)`);
      }
      throw new RestError(0, "Aborted", "Request was aborted", err as Error);
    }
    if (err instanceof TypeError) {
      throw new RestError(0, "Network Error", `Network error: ${err.message}`, err);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // Handle non-2xx responses
  if (!response.ok) {
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = "(unable to read response body)";
    }

    console.error(`[REST] ${method} ${path} → ${response.status}`);

    // 401 — invalidate cache and retry once. Must run BEFORE the Davis 403 mapping,
    // otherwise a stale cached token on a Davis path looks like a missing subscription.
    if (response.status === 401 && !_isRetry) {
      invalidateTokenCache(tenant.id);
      return dynatraceRest(tenant, path, options, true);
    }

    // 401 (post-retry) / 403 on Davis CoPilot — subscription or scope missing, retry won't help
    if ((response.status === 401 || response.status === 403) && path.includes("/davis/")) {
      throw new DavisCopilotUnavailableError();
    }

    // Rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const message = `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ""}`;
      throw new RestError(429, "Too Many Requests", message);
    }

    // Build meaningful error message
    let message = `API error ${response.status}`;
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(errorBody);
      const json = parsedBody as Record<string, unknown>;
      if (json.error) {
        message = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
      } else if (json.message) {
        message = typeof json.message === "string" ? json.message : JSON.stringify(json.message);
      }
    } catch {
      message = errorBody.slice(0, 200);
    }

    // Classic proxy errors — retry once directly against /api/v2/* without the proxy rewrite.
    // Covers two cases:
    //   404 "REST endpoint is not available for this environment" — proxy path not supported
    //   400 "Invalid app context" — env-level OAuth client can't use platform classic proxy
    const isClassicProxyError =
      !_skipClassicProxy &&
      tenant.useClassicProxy !== false &&
      resolvedPath !== path &&
      typeof message === "string" &&
      ((response.status === 404 && message.toLowerCase().includes("not available for this environment")) ||
        (response.status === 400 && message.toLowerCase().includes("invalid app context")));

    if (isClassicProxyError) {
      return dynatraceRest(tenant, path, options, _isRetry, true);
    }

    throw new RestError(response.status, response.statusText, message);
  }

  // Parse response
  let responseData: unknown;
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    try {
      const text = await response.text();
      responseData = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new RestError(
        response.status,
        "Parse Error",
        `Failed to parse JSON response: ${err instanceof Error ? err.message : "Unknown error"}`,
        err instanceof Error ? err : undefined,
      );
    }
  } else {
    responseData = await response.text();
  }

  // Validate with schema if provided
  if (schema) {
    try {
      const validated = schema.parse(responseData);
      return {
        data: validated as T,
        status: response.status,
        headers: response.headers,
      };
    } catch (err) {
      if (err instanceof ZodError) {
        const zodMessage = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
        throw new ValidationError(err, `Response validation failed: ${zodMessage || err.message}`);
      }
      throw err;
    }
  }

  return {
    data: responseData as T,
    status: response.status,
    headers: response.headers,
  };
}

// ── Pagination support ────────────────────────────────────────────────────────

interface PaginationOptions<T> extends RestClientOptions<T> {
  paginate?: boolean;
  maxPages?: number;
  pageField?: "nextPageKey" | "pageToken" | "offset";
}

interface PaginatedResponse {
  nextPageKey?: string;
  pageToken?: string;
  offset?: number;
  [key: string]: unknown;
}

export async function dynatraceRestPaginated<T = unknown>(
  tenant: TenantConfig,
  path: string,
  options: PaginationOptions<T> = {},
): Promise<RestResponse<unknown[]>> {
  const { paginate = true, maxPages = 10, pageField = "nextPageKey", ...restOptions } = options;

  if (!paginate) {
    const response = await dynatraceRest<T>(tenant, path, restOptions);
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data : [response.data],
    };
  }

  let allRecords: unknown[] = [];
  let pageParams: Record<string, string> | undefined = restOptions.queryParams;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const response = await dynatraceRest<PaginatedResponse | unknown[]>(tenant, path, {
      ...restOptions,
      queryParams: pageParams,
    } as RestClientOptions<PaginatedResponse | unknown[]>);

    const responseData = response.data;

    if (Array.isArray(responseData)) {
      allRecords = allRecords.concat(responseData);
      break; // arrays don't paginate
    } else if (responseData && typeof responseData === "object") {
      const obj = responseData as Record<string, unknown>;

      const recordsField = ["results", "records", "data", "items", "slo", "monitors", "values", "problems"].find(
        (field) => Array.isArray(obj[field]),
      );
      if (recordsField) {
        allRecords = allRecords.concat(obj[recordsField] as unknown[]);
      } else {
        allRecords.push(responseData);
      }

      const pageKey = obj[pageField] as string | number | undefined;
      if (!pageKey) break;

      // Next page — send ONLY the page key (Dynatrace requires no other params alongside nextPageKey).
      // Classic v2 APIs expect the parameter to be named `nextPageKey` (not `pageKey`).
      if (pageField === "nextPageKey") {
        pageParams = { nextPageKey: String(pageKey) };
      } else if (pageField === "offset") {
        pageParams = { ...restOptions.queryParams, offset: String(pageKey) };
      } else {
        pageParams = { ...restOptions.queryParams, pageToken: String(pageKey) };
      }
    }

    pageCount++;
  }

  return {
    data: allRecords,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
  };
}
