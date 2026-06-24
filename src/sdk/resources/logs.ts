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

// ── 1. Raw API record schema ──────────────────────────────────────────────────

export const logRecordSchema = z
  .object({
    timestamp: z.string(),
    content: z.string(),
    loglevel: z.string(), // "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | custom
    status: z.string().optional(),

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
    level: record.loglevel.toUpperCase(),
    content: record.content,
    service: record["service.name"],
    host: record["host.name"] ?? record["dt.entity.host"],
    status: record.status,
    source: record["log.source"],
    traceId: record.trace_id,
    raw: record,
  };
}

// ── 3. Query builder ──────────────────────────────────────────────────────────

export type LogLevel = "error" | "warning" | "info" | "debug" | "fatal" | "all";

export const LOG_PAGE_SIZE = 50;

const LOG_LEVEL_MAP: Record<LogLevel, string | null> = {
  error: "ERROR",
  warning: "WARN",
  info: "INFO",
  debug: "DEBUG",
  fatal: "FATAL",
  all: null, // no filter
};

export interface ListLogsOptions {
  level?: LogLevel;
  limit?: number;
  /** Server-side filter by service.name (escaped). */
  serviceName?: string;
  /** Server-side full-text search in content (escaped). */
  contentFilter?: string;
  /** Cursor pagination: records with timestamp < before (ISO string). */
  before?: string;
  /** Raw DQL appended as-is — power-user escape hatch, NOT escaped. */
  extraFilter?: string;
  timeframe?: { start: string; end: string };
  signal?: AbortSignal;
}

/** Builds the `fetch logs` DQL string for the given filters. */
export function buildLogsQuery(opts: ListLogsOptions = {}): string {
  const { level = "all", limit = LOG_PAGE_SIZE, serviceName, contentFilter, before, extraFilter } = opts;
  const parts: string[] = ["fetch logs"];

  const mapped = LOG_LEVEL_MAP[level] ?? null;
  if (mapped !== null) {
    parts.push(`filter loglevel == "${mapped}"`);
  }
  if (serviceName) {
    parts.push(`filter service.name == "${escapeDqlString(serviceName)}"`);
  }
  if (contentFilter) {
    parts.push(`filter matchesPhrase(content, "${escapeDqlString(contentFilter)}")`);
  }
  if (before) {
    parts.push(`filter timestamp < datetime("${before}")`);
  }
  if (extraFilter) {
    parts.push(extraFilter.trim());
  }
  parts.push("sort timestamp desc");
  parts.push(`limit ${limit}`);

  return parts.join(" | ");
}

// ── 4. Resource call ──────────────────────────────────────────────────────────

/**
 * Fetches logs through the injected transport and returns normalized entries.
 * Records that fail schema validation are skipped (a malformed row never breaks
 * the whole list).
 */
export async function listLogs(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  opts: ListLogsOptions = {},
): Promise<LogEntry[]> {
  const query = buildLogsQuery(opts);
  const records = await transport.executeDql<unknown>(tenant, query, {
    timeframe: opts.timeframe,
    signal: opts.signal,
    maxResultRecords: opts.limit ?? LOG_PAGE_SIZE,
  });

  const entries: LogEntry[] = [];
  for (const record of records) {
    const parsed = logRecordSchema.safeParse(record);
    if (parsed.success) entries.push(normalizeLog(parsed.data));
  }
  return entries;
}
