/**
 * Problems resource — Grail `fetch dt.davis.problems`.
 *
 * Same recipe as logs.ts / spans.ts: raw schema, normalizer, query builder,
 * `listProblems` through the injected transport. UI receives `ProblemEntry`.
 */

import { z } from "zod";
import type { TenantConfig } from "../auth";
import type { DynatraceTransport } from "../transport";

// ── 1. Raw API record schema ──────────────────────────────────────────────────
// provenance: live Grail record 2026-10-25. `dt.davis.problems` holds one record
// per problem *update* (status transitions), so a problem can appear several times.
// event.id === classic_problem_id; it is the id in the Problems app URL.
// display_id ("P-261028488") is the label shown in the UI, not usable in URLs.
// event.category seen: AVAILABILITY | ERROR | SLOWDOWN | RESOURCE_CONTENTION | CUSTOM_ALERT
// | MONITORING_UNAVAILABLE | INFO — unknown values must not drop a record.
// event.status seen: ACTIVE | CLOSED.

export const problemRecordSchema = z
  .object({
    "event.id": z.string(),
    "event.name": z.string(),
    "event.status": z.string(),
    "event.category": z.string(),
    "event.start": z.string(),
    // Empty fields may come back as null or be missing altogether (a generated
    // custom alert has no affected_entity_* keys). Every optional field must accept
    // both, or the record is dropped.
    "event.end": z.string().nullish(),
    display_id: z.string().nullish(),
    affected_entity_ids: z.array(z.string()).nullish(),
    affected_entity_names: z.array(z.string()).nullish(),
    "maintenance.is_under_maintenance": z.boolean().nullish(),
  })
  .catchall(z.unknown());

export type ProblemRecord = z.infer<typeof problemRecordSchema>;

// ── 2. Normalized domain model ────────────────────────────────────────────────

export interface ProblemEntry {
  /** Grail event.id — use for deep links. */
  id: string;
  /** Human label, e.g. "P-261028488". */
  displayId?: string;
  name: string;
  category: string;
  isOpen: boolean;
  startTime: string;
  endTime?: string;
  affectedEntityNames: string[];
  raw: ProblemRecord;
}

export function normalizeProblem(record: ProblemRecord): ProblemEntry {
  return {
    id: record["event.id"],
    displayId: record.display_id ?? undefined,
    name: record["event.name"],
    category: record["event.category"],
    isOpen: record["event.status"] !== "CLOSED",
    startTime: record["event.start"],
    endTime: record["event.end"] ?? undefined,
    affectedEntityNames: record.affected_entity_names ?? [],
    raw: record,
  };
}

// ── 3. Query builder ──────────────────────────────────────────────────────────

export const PROBLEM_PAGE_SIZE = 50;

/** `storage:buckets:read` is needed too: without it Grail returns empty results instead of a 403. */
export const PROBLEMS_REQUIRED_SCOPES = ["storage:buckets:read", "storage:events:read"] as const;

export interface ListProblemsOptions {
  /** "open" (default) keeps only problems whose latest state is not CLOSED. */
  status?: "open" | "all";
  limit?: number;
  /** Look-back window, DQL duration (e.g. "7d"). Default 30d so long-running problems are not missed. */
  lookback?: string;
  /** Extra DQL filter expression (no `filter` keyword, no pipes), ANDed with the status filter. */
  extraFilter?: string;
  signal?: AbortSignal;
}

/**
 * Returns an error message when a user-supplied filter expression cannot be
 * appended safely as `| filter <expr>`, or undefined when it is acceptable.
 * Syntax errors inside the expression are left to Grail to report.
 */
export function validateExtraFilter(expr: string): string | undefined {
  if (/[|\n\r]/.test(expr)) return "Extra DQL filter must be a single expression without '|' or line breaks";
  if (/^\s*filter\b/i.test(expr)) return "Extra DQL filter must not start with 'filter'";
  return undefined;
}

export function buildProblemsQuery(opts: ListProblemsOptions = {}): string {
  const { status = "open", limit = PROBLEM_PAGE_SIZE, lookback = "30d" } = opts;
  const extra = opts.extraFilter?.trim();
  if (extra) {
    const problem = validateExtraFilter(extra);
    if (problem) throw new Error(problem);
  }
  // dedup BEFORE the status filter: otherwise a problem's early ACTIVE snapshot
  // would still count as open after it was closed.
  const parts = [`fetch dt.davis.problems, from: now()-${lookback}`, "dedup event.id, sort: {timestamp desc}"];
  if (status === "open") parts.push('filter event.status != "CLOSED"');
  if (extra) parts.push(`filter ${extra}`);
  parts.push("sort event.start desc");
  parts.push(`limit ${limit}`);
  return parts.join(" | ");
}

// ── 4. Resource call ──────────────────────────────────────────────────────────

export async function listProblems(
  transport: DynatraceTransport,
  tenant: TenantConfig,
  opts: ListProblemsOptions = {},
): Promise<ProblemEntry[]> {
  const records = await transport.executeDql<unknown>(tenant, buildProblemsQuery(opts), {
    signal: opts.signal,
    maxResultRecords: opts.limit ?? PROBLEM_PAGE_SIZE,
    requiredScopes: PROBLEMS_REQUIRED_SCOPES,
    timeoutMs: 15_000,
  });

  const entries: ProblemEntry[] = [];
  let firstIssue: string | undefined;
  for (const record of records) {
    const parsed = problemRecordSchema.safeParse(record);
    if (parsed.success) entries.push(normalizeProblem(parsed.data));
    else firstIssue ??= parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  // Problems exist but none could be read: that must surface as an error, never as "no problems".
  if (records.length > 0 && entries.length === 0) {
    throw new Error(`Unexpected problem record format (${firstIssue ?? "unknown"})`);
  }
  return entries;
}
