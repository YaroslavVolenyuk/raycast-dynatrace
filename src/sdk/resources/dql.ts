/**
 * Free-form DQL — the Run DQL command.
 *
 * Unlike logs/spans/problems there is no record schema: the query decides the
 * shape. The resource only runs the query, derives the column list and tells
 * whether the result was cut off, using Grail's own notifications first.
 */

import type { TenantConfig } from "../auth";
import type { GrailNotification } from "../grail";
import type { DynatraceTransport } from "../transport";

export const DQL_DEFAULT_LIMIT = 1000;

/**
 * Run DQL is interactive and the user chose to wait, so it gets a longer
 * polling budget than list commands. Past it the query is cancelled server-side.
 */
export const DQL_POLL_DEADLINE_MS = 180_000;

/**
 * Only the scope every Grail query needs. The data scope depends on what the
 * query fetches (storage:logs:read, storage:events:read, …), so it cannot be
 * known up front.
 */
export const DQL_REQUIRED_SCOPES = ["storage:buckets:read"] as const;

// Data scope per Grail source. A query's first command decides what it reads;
// pipelines that join more sources (lookup, join) may need more than this.
const SOURCE_SCOPES: ReadonlyArray<[RegExp, string]> = [
  [/^fetch\s+logs\b/i, "storage:logs:read"],
  [/^fetch\s+spans\b/i, "storage:spans:read"],
  [/^fetch\s+bizevents\b/i, "storage:bizevents:read"],
  [/^fetch\s+(events|dt\.davis\.\w+)\b/i, "storage:events:read"],
  [/^fetch\s+dt\.entity\.\w+/i, "storage:entities:read"],
  [/^fetch\s+dt\.system\.events\b/i, "storage:system:read"],
  [/^(timeseries|metrics)\b/i, "storage:metrics:read"],
];

/**
 * Scopes a query needs: the base Grail scope plus the data scope of the source
 * it reads, when that can be recognised. Used for the 403 message and for the
 * "possibly missing scopes" hint on an empty result.
 */
export function requiredScopesForQuery(query: string): string[] {
  const source = SOURCE_SCOPES.find(([re]) => re.test(query.trim()));
  return source ? [...DQL_REQUIRED_SCOPES, source[1]] : [...DQL_REQUIRED_SCOPES];
}

export interface DqlResult {
  records: Record<string, unknown>[];
  /** Union of record keys, in order of first appearance. */
  columns: string[];
  /** True when Grail reports a truncated result, or the record cap was hit without an explicit `| limit`. */
  truncated: boolean;
  /** Grail's warnings about this result (truncation, scan limit, sampling, …), as messages to show. */
  notices: string[];
}

export interface RunDqlOptions {
  /** Default timeframe; a `from:`/`to:` in the query itself takes precedence. */
  timeframe?: { start: string; end: string };
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Collects the keys of all records, not just the first one: Grail omits null
 * fields, so records of the same query can have different key sets.
 */
export function collectColumns(records: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) seen.add(key);
  return [...seen];
}

// Notification codes are not a documented closed set; match on the wording instead.
const TRUNCATION = /truncat|result.*limit|limit.*result/i;

/** N of a `| limit N` that ends the query's pipeline, or undefined. */
function explicitLimit(query: string): number | undefined {
  const match = query.match(/\|\s*limit\s+(\d+)\s*$/i);
  return match ? Number(match[1]) : undefined;
}

export function isTruncated(
  recordCount: number,
  limit: number,
  query: string,
  notifications: readonly GrailNotification[],
): boolean {
  if (notifications.some((n) => TRUNCATION.test(`${n.notificationType ?? ""} ${n.message ?? ""}`))) return true;
  // Hitting the cap with the query's own `| limit N ≤ cap` is the user's choice, not a
  // cut-off; with N above the cap the cap still cut the result.
  const own = explicitLimit(query);
  return recordCount >= limit && !(own !== undefined && own <= limit);
}

export async function runDql(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  query: string,
  opts: RunDqlOptions = {},
): Promise<DqlResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Query is empty");
  const limit = opts.limit ?? DQL_DEFAULT_LIMIT;

  let notifications: GrailNotification[] = [];
  const records = await transport.executeDql<Record<string, unknown>>(tenant, trimmed, {
    timeframe: opts.timeframe,
    signal: opts.signal,
    maxResultRecords: limit,
    requiredScopes: requiredScopesForQuery(trimmed),
    pollDeadlineMs: DQL_POLL_DEADLINE_MS,
    onNotifications: (n) => (notifications = n),
  });

  return {
    records,
    columns: collectColumns(records),
    truncated: isTruncated(records.length, limit, trimmed, notifications),
    notices: [...new Set(notifications.map((n) => n.message?.trim()).filter((m): m is string => !!m))],
  };
}
