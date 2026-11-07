/**
 * Spans resource — Grail `fetch spans`.
 *
 * Follows the same recipe as logs.ts:
 *   1. raw API schema (zod) — validated against a captured fixture (contract test)
 *   2. normalized domain model + normalizer (API → domain), ONLY place raw fields are touched
 *   3. query builder
 *   4. `listSpans` call through the injected transport (live or mock)
 *
 * UI receives `SpanEntry`, never the raw record shape.
 */

import { z } from "zod";
import type { TenantConfig } from "../auth";
import { escapeDqlString } from "../grail";
import type { DynatraceTransport } from "../transport";
import { normalizeRecords, type ResourcePage } from "./page";

// ── 1. Raw API record schema ──────────────────────────────────────────────────
// provenance: dt.semantic_dictionary.fields (verified via MCP execute_dql 2026-07-18)
//   span model:  trace.id, span.id, span.parent_id, span.kind, span.name,
//                span.status_code, start_time, end_time, duration, endpoint.name
//   http model:  http.request.method, http.response.status_code, url.path,
//                http.route, server.address, server.port
//   db model:    db.system, db.operation.name, db.namespace, db.collection.name
//   rpc model:   rpc.system, rpc.method, rpc.service
// NOTE: `transaction.is_root_span` / `transaction.is_failed` do NOT exist in the
//   semantic dictionary (the real fields, `request.is_root_span` /
//   `request.is_failed`, are deprecated). Root-span detection is therefore
//   DERIVED from the absence of `span.parent_id`, and "failed" is already
//   expressed by span.status_code == "error".
//
// span.status_code values returned lower-case by Grail ("ok" | "error" | "unset"),
//   normalized to upper-case in normalizeSpan.
// duration unit: NANOSECONDS, returned as a STRING by Grail (e.g. "501388500").
// http.response.status_code / server.port are also returned as STRINGS.
//   These are coerced via `numeric` below — otherwise every real span fails
//   schema validation and is silently dropped.
// .catchall absorbs additional semantic-convention fields without schema rot.

/**
 * Grail returns numeric span fields as strings (e.g. duration "501388500",
 * status code "200"). Coerce string→number, pass undefined/null/"" through.
 */
const numeric = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return v;
}, z.number().optional());

export const spanRecordSchema = z
  .object({
    // Core identity
    "trace.id": z.string(),
    "span.id": z.string(),
    "span.parent_id": z.string().optional(),

    // Span classification
    "span.kind": z.string().optional(), // server|client|internal|producer|consumer
    "span.name": z.string().optional(),
    "span.status_code": z.string().optional(), // ok|error|unset (lower-case in Grail)
    "span.status_message": z.string().optional(),

    // Timing (duration in NANOSECONDS, string-encoded by Grail)
    start_time: z.string(),
    end_time: z.string().optional(),
    duration: numeric,

    // Service
    "service.name": z.string().optional(),
    "dt.entity.service": z.string().optional(),
    "endpoint.name": z.string().optional(),

    // HTTP (http model)
    "http.request.method": z.string().optional(),
    "http.response.status_code": numeric,
    "url.path": z.string().optional(),
    "http.route": z.string().optional(),
    "server.address": z.string().optional(),
    "server.port": numeric,

    // Database (db model)
    "db.system": z.string().optional(),
    "db.operation.name": z.string().optional(),
    "db.namespace": z.string().optional(),
    "db.collection.name": z.string().optional(),

    // RPC (rpc model)
    "rpc.system": z.string().optional(),
    "rpc.method": z.string().optional(),
    "rpc.service": z.string().optional(),
  })
  .catchall(z.unknown());

export type SpanRecord = z.infer<typeof spanRecordSchema>;

// ── 2. Normalized domain model ────────────────────────────────────────────────

export interface SpanEntry {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  kind: string;
  /** Operation name: span.name → http method+path → db operation → raw span.id fallback. */
  name: string;
  /** "OK" | "ERROR" | "UNSET" — upper-cased from span.status_code. */
  statusCode: string;
  statusMessage?: string;
  startTime: string;
  /** Duration in microseconds (converted from Grail's nanosecond value). */
  durationUs?: number;
  service?: string;
  /** Derived: a span with no `span.parent_id` is the root of its trace. */
  isRootSpan: boolean;
  // HTTP
  httpMethod?: string;
  httpStatusCode?: number;
  urlPath?: string;
  httpRoute?: string;
  // DB
  dbSystem?: string;
  dbOperation?: string;
  dbNamespace?: string;
  /** The original record, for detail views. */
  raw: SpanRecord;
}

function httpSpanLabel(record: SpanRecord): string | undefined {
  return record["http.request.method"] && record["url.path"]
    ? `${record["http.request.method"]} ${record["url.path"]}`
    : undefined;
}

function dbSpanLabel(record: SpanRecord): string | undefined {
  return record["db.operation.name"] && record["db.namespace"]
    ? `${record["db.operation.name"]} ${record["db.namespace"]}`
    : record["db.operation.name"];
}

export function normalizeSpan(record: SpanRecord): SpanEntry {
  return {
    traceId: record["trace.id"],
    spanId: record["span.id"],
    parentSpanId: record["span.parent_id"],
    kind: record["span.kind"]?.toLowerCase() ?? "internal",
    name: record["span.name"] ?? httpSpanLabel(record) ?? dbSpanLabel(record) ?? record["span.id"],
    statusCode: (record["span.status_code"] ?? "UNSET").toUpperCase(),
    statusMessage: record["span.status_message"],
    startTime: record.start_time,
    // Grail returns duration in nanoseconds; convert to microseconds for formatDuration.
    durationUs: record.duration != null ? record.duration / 1000 : undefined,
    service: record["service.name"],
    isRootSpan: record["span.parent_id"] == null || record["span.parent_id"] === "",
    httpMethod: record["http.request.method"],
    httpStatusCode: record["http.response.status_code"],
    urlPath: record["url.path"],
    httpRoute: record["http.route"],
    dbSystem: record["db.system"],
    dbOperation: record["db.operation.name"],
    dbNamespace: record["db.namespace"],
    raw: record,
  };
}

/** Formats microseconds as a human-readable duration string ("182ms", "5.0s"). */
export function formatDuration(us: number): string {
  if (us < 1_000) return `${us}µs`;
  const ms = Math.round(us / 1_000);
  if (ms < 1_000) return `${ms}ms`; // rounded, so 999_999µs falls through to "1.0s"
  return `${(us / 1_000_000).toFixed(1)}s`;
}

// ── 3. Query builder ──────────────────────────────────────────────────────────

export type SpanStatus = "error" | "ok" | "unset" | "all";
export const SPAN_PAGE_SIZE = 100;

/** `storage:buckets:read` is needed too: without it Grail returns empty results instead of a 403. */
export const SPANS_REQUIRED_SCOPES = ["storage:buckets:read", "storage:spans:read"] as const;

// Grail stores span.status_code LOWER-CASE ("ok"|"error"|"unset"). The Dynatrace
// UI title-cases it for display, but the DQL filter must use the raw lower-case
// value — `== "ERROR"` matches zero records.
// provenance: verified against a live dev tenant via MCP execute_dql 2026-07-01:
//   `filter span.status_code == "error"` → 1 record, `== "ERROR"` → 0 records
const SPAN_STATUS_MAP: Record<SpanStatus, string | null> = {
  error: "error",
  ok: "ok",
  unset: "unset",
  all: null,
};

export interface ListSpansOptions {
  status?: SpanStatus;
  limit?: number;
  /** Filter to a specific trace (log → trace navigation). */
  traceId?: string;
  /** Relative timeframe string (e.g. "24h", "30m"). */
  timeframeDql?: string;
  timeframe?: { start: string; end: string };
  signal?: AbortSignal;
}

function spansFetchClause(timeframeDql: string | undefined, timeframe: ListSpansOptions["timeframe"]): string {
  if (timeframeDql) return `fetch spans, from: now()-${timeframeDql}`;
  if (timeframe)
    return `fetch spans, from: "${escapeDqlString(timeframe.start)}", to: "${escapeDqlString(timeframe.end)}"`;
  return "fetch spans";
}

export function buildSpansQuery(opts: ListSpansOptions = {}): string {
  const { status = "all", limit = SPAN_PAGE_SIZE, timeframeDql, timeframe } = opts;
  // Grail renders trace IDs as lowercase hex; a pasted ID may carry spaces or capitals.
  const traceId = opts.traceId?.trim().toLowerCase();

  const fetchClause = spansFetchClause(timeframeDql, timeframe);

  const parts: string[] = [fetchClause];

  if (traceId) {
    // `trace.id` is a typed (uid) field in Grail, not a string — a direct
    // `== "..."` comparison never matches. Compare its string form instead.
    parts.push(`filter toString(\`trace.id\`) == "${escapeDqlString(traceId)}"`);
  }

  const mappedStatus = SPAN_STATUS_MAP[status] ?? null;
  if (mappedStatus !== null) {
    parts.push(`filter \`span.status_code\` == "${escapeDqlString(mappedStatus)}"`);
  }

  parts.push("sort start_time desc");
  parts.push(`limit ${limit}`);

  return parts.join(" | ");
}

// ── 4. Resource call ──────────────────────────────────────────────────────────

/**
 * Fetches spans through the injected transport and returns normalized entries.
 * Records that fail schema validation are left out and counted in `skipped`.
 */
export async function listSpans(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  opts: ListSpansOptions = {},
): Promise<ResourcePage<SpanEntry>> {
  const query = buildSpansQuery(opts);
  const records = await transport.executeDql<unknown>(tenant, query, {
    timeframe: opts.timeframe,
    signal: opts.signal,
    maxResultRecords: opts.limit ?? SPAN_PAGE_SIZE,
    requiredScopes: SPANS_REQUIRED_SCOPES,
  });

  return normalizeRecords(records, spanRecordSchema, normalizeSpan);
}
