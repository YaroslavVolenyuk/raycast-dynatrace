/**
 * Logs resource — Grail `fetch logs`.
 *
 * The canonical recipe for an SDK resource:
 *   1. raw API schema (zod) — validated against a captured fixture (contract test)
 *   2. a normalized domain model + normalizer (API → domain), the ONLY place raw
 *      field names are touched
 *   3. a query builder
 *   4. a `list*` call that goes through the injected transport (live or mock)
 *
 * UI receives `LogEntry`, never the raw record shape.
 */

import { z } from "zod";
import type { TenantConfig } from "../auth";
import { escapeDqlString } from "../grail";
import type { DynatraceTransport } from "../transport";
import { normalizeRecords, type ResourcePage } from "./page";

// ── 1. Raw API record schema ──────────────────────────────────────────────────
// provenance: MCP execute_dql 2026-06-26 (fixture: sdk/resources/__fixtures__/logs.search.json)
// - loglevel: required string, raw level from ingest (NONE|INFO|WARN|ERROR|SEVERE|CRITICAL|…)
// - status:   normalized bucket Dynatrace computes (NONE|INFO|WARN|ERROR only) — use for
//             filtering; confirmed present in every captured record alongside loglevel
// - Extra Kubernetes / OpenPipeline fields (k8s.*, dt.openpipeline.*, dt.auth.origin)
//   handled by .catchall — not enumerated to avoid schema rot as the field set grows

export const logRecordSchema = z
  .object({
    timestamp: z.string(),
    // content and loglevel are absent on some ingest paths (e.g. structured
    // OTLP logs with only attributes); such records are still shown, not dropped.
    content: z.string().optional(),
    loglevel: z.string().optional(), // raw level: NONE|INFO|WARN|ERROR|SEVERE|CRITICAL|ALERT|EMERGENCY|custom
    status: z.string().optional(), // normalized bucket: NONE|INFO|WARN|ERROR (always present in practice)

    // Service / app
    "service.name": z.string().optional(),
    "dt.app.name": z.string().optional(),
    "dt.app.version": z.string().optional(),

    // Host / infrastructure
    "host.name": z.string().optional(),
    "dt.entity.host": z.string().optional(),
    "dt.host_group.id": z.string().optional(),

    // Process
    "dt.process.name": z.string().optional(),
    "dt.process_group.detected_name": z.string().optional(),

    // Misc
    "log.source": z.string().optional(),
    "event.type": z.string().optional(),

    // Telemetry
    trace_id: z.string().optional(),
    span_id: z.string().optional(),
  })
  .catchall(z.unknown()); // Grail may return additional dynamic fields

export type LogRecord = z.infer<typeof logRecordSchema>;

// ── 2. Normalized domain model ────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  /** Upper-cased log level (ERROR, WARN, INFO, …). */
  level: string;
  content: string;
  service?: string;
  host?: string;
  status?: string;
  source?: string;
  traceId?: string;
  /** The original record, for detail views that need extra fields. */
  raw: LogRecord;
}

export function normalizeLog(record: LogRecord): LogEntry {
  return {
    timestamp: record.timestamp,
    level: (record.loglevel ?? record.status ?? "NONE").toUpperCase(),
    content: record.content ?? "",
    service: record["service.name"],
    host: record["host.name"] ?? record["dt.entity.host"],
    status: record.status,
    source: record["log.source"],
    traceId: record.trace_id,
    raw: record,
  };
}

// ── 3. Query builder ──────────────────────────────────────────────────────────

// Dynatrace `status` field — 4 possible values that aggregate the detailed loglevel:
//   ERROR  → SEVERE, ERROR, CRITICAL, ALERT, FATAL, EMERGENCY
//   WARN   → WARN
//   INFO   → INFO, DEBUG, NOTICE, TRACE
//   NONE   → NONE
export type LogLevel = "error" | "warn" | "info" | "none" | "all";

export const LOG_PAGE_SIZE = 100;
/** Upper bound for "Load More": Grail's default result cap. */
export const LOG_MAX_LIMIT = 1000;

/** `storage:buckets:read` is needed too: without it Grail returns empty results instead of a 403. */
export const LOGS_REQUIRED_SCOPES = ["storage:buckets:read", "storage:logs:read"] as const;

// Maps UI filter values to Dynatrace `status` field values.
const LOG_LEVEL_MAP: Record<LogLevel, string | null> = {
  error: "ERROR",
  warn: "WARN",
  info: "INFO",
  none: "NONE",
  all: null, // no filter
};

export interface ListLogsOptions {
  level?: LogLevel;
  limit?: number;
  /** Case-insensitive substring searched server-side in content and service.name. */
  search?: string;
  /**
   * Relative timeframe string (e.g. "24h", "30m", "3d").
   * Embedded directly into the DQL fetch clause as `from: now()-{value}`.
   */
  timeframeDql?: string;
  /** Absolute ISO range used as API payload fallback. */
  timeframe?: { start: string; end: string };
  signal?: AbortSignal;
}

function logsFetchClause(timeframeDql: string | undefined, timeframe: ListLogsOptions["timeframe"]): string {
  if (timeframeDql) return `fetch logs, from: now()-${timeframeDql}`;
  if (timeframe)
    return `fetch logs, from: "${escapeDqlString(timeframe.start)}", to: "${escapeDqlString(timeframe.end)}"`;
  return "fetch logs";
}

/** Builds the `fetch logs` DQL string for the given filters. */
export function buildLogsQuery(opts: ListLogsOptions = {}): string {
  const { level = "all", limit = LOG_PAGE_SIZE, timeframeDql, timeframe } = opts;
  const search = opts.search?.trim();

  // Prefer relative DQL syntax (now()-Xh) so Grail always respects the window.
  // Fall back to absolute ISO range, then plain fetch logs.
  const fetchClause = logsFetchClause(timeframeDql, timeframe);

  const parts: string[] = [fetchClause];

  const mapped = LOG_LEVEL_MAP[level] ?? null;
  if (mapped !== null) {
    parts.push(`filter status == "${escapeDqlString(mapped)}"`);
  }
  if (search) {
    parts.push(
      `filter contains(content, "${escapeDqlString(search)}", caseSensitive: false) or contains(service.name, "${escapeDqlString(search)}", caseSensitive: false)`,
    );
  }
  parts.push("sort timestamp desc");
  parts.push(`limit ${limit}`);

  return parts.join(" | ");
}

// ── 4. Resource call ──────────────────────────────────────────────────────────

/**
 * Fetches logs through the injected transport and returns normalized entries.
 * Records that fail schema validation are left out and counted in `skipped`
 * (a malformed row never breaks the whole list, but is never hidden either).
 */
export async function listLogs(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  opts: ListLogsOptions = {},
): Promise<ResourcePage<LogEntry>> {
  const query = buildLogsQuery(opts);
  const records = await transport.executeDql<unknown>(tenant, query, {
    timeframe: opts.timeframe,
    signal: opts.signal,
    maxResultRecords: opts.limit ?? LOG_PAGE_SIZE,
    requiredScopes: LOGS_REQUIRED_SCOPES,
  });

  return normalizeRecords(records, logRecordSchema, normalizeLog);
}
