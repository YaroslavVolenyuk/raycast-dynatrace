/**
 * Free-form DQL — the Run DQL command.
 *
 * Unlike logs/spans/problems there is no record schema: the query decides the
 * shape. The resource only runs the query, derives the column list and tells
 * whether the result was cut off by the record limit.
 */

import type { TenantConfig } from "../auth";
import type { DynatraceTransport } from "../transport";

export const DQL_DEFAULT_LIMIT = 1000;

/**
 * Only the scope every Grail query needs. The data scope depends on what the
 * query fetches (storage:logs:read, storage:events:read, …), so it cannot be
 * known up front.
 */
export const DQL_REQUIRED_SCOPES = ["storage:buckets:read"] as const;

export interface DqlResult {
  records: Record<string, unknown>[];
  /** Union of record keys, in order of first appearance. */
  columns: string[];
  /** True when the record limit was reached — more rows probably exist. */
  truncated: boolean;
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

export async function runDql(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  query: string,
  opts: RunDqlOptions = {},
): Promise<DqlResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Query is empty");
  const limit = opts.limit ?? DQL_DEFAULT_LIMIT;

  const records = await transport.executeDql<Record<string, unknown>>(tenant, trimmed, {
    timeframe: opts.timeframe,
    signal: opts.signal,
    maxResultRecords: limit,
    requiredScopes: DQL_REQUIRED_SCOPES,
  });

  return { records, columns: collectColumns(records), truncated: records.length >= limit };
}
