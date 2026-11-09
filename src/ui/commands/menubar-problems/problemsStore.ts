// Loading, throttling and caching of the menu bar problems result. Shared by the
// menu bar command (reads) and the Refresh Problems command (forced fetch): menu
// bar commands are unloaded as soon as a menu item is clicked, so a refresh
// started from the menu itself would be killed before it is stored.
//
// Uses Raycast's Cache without a namespace, i.e. shared by all commands of the
// extension. Preferences are extension-level for the same reason: both commands
// must build the same query and cache signature.

import { createHash } from "node:crypto";
import { Cache, getPreferenceValues } from "@raycast/api";
import {
  credentialsFingerprint,
  liveTransport,
  listProblems,
  PROBLEMS_REQUIRED_SCOPES,
  type ProblemEntry,
  type TenantConfig,
} from "../../../sdk";
import { getActiveTenant } from "../../../services/tenants";
import { classifyProblemsError, type ProblemsErrorInfo } from "../../lib/problemsError";
import { shouldFetch } from "../../lib/refreshThrottle";
import { missingScopesError } from "../../lib/scopeHint";

export const MAX_SHOWN = 7;
/**
 * Problems counted for the menu bar title. Fetching more records than are shown
 * costs no extra scan (the query reads the same data either way), so the count
 * is exact up to this cap.
 */
export const MAX_COUNTED = 99;
/**
 * After a failed fetch, retry this soon instead of waiting a full refresh interval.
 * Equals the manifest wake-up interval (15m): a shorter value could not be honoured.
 */
const RETRY_AFTER_ERROR_MS = 15 * 60_000;

/**
 * What the menu shows of a problem, and all of it that is written to the Cache
 * (plain files on disk): never the raw Grail record with its entity IDs and
 * attributes. Besides these, a stored result holds only the environment URL
 * (for the links), the tenant name and, after a failure, the error text.
 */
export type MenuProblem = Pick<ProblemEntry, "id" | "name" | "displayId" | "category">;

function toMenuProblem({ id, name, displayId, category }: ProblemEntry): MenuProblem {
  return { id, name, displayId, category };
}

export type ProblemsResult =
  | { state: "no-tenant" }
  | {
      state: "ok";
      endpoint: string;
      /** The first MAX_SHOWN problems, newest first. */
      problems: MenuProblem[];
      /** Open problems found, up to MAX_COUNTED; includes the unreadable ones. */
      total: number;
      /** Problems Grail returned that could not be read: counted, but not listed. */
      unreadable?: number;
      /** More than MAX_COUNTED problems are open. */
      hasMore: boolean;
      fetchedAt: number;
      /** What the result was computed for — shown so "no problems" can be checked at a glance. */
      tenantName: string;
    }
  | { state: "error"; endpoint?: string; error: ProblemsErrorInfo };

/**
 * What a result says about the open problems. Results stored by older versions
 * (in useCachedPromise's own cache, which survives an update) have no `total`,
 * and their `hasMore` meant "more than MAX_SHOWN": read them that way, never as zero.
 */
function countOf(result: { problems: MenuProblem[]; total?: number; hasMore: boolean }) {
  return result.total === undefined
    ? { count: result.problems.length, cap: MAX_SHOWN }
    : { count: result.total, cap: MAX_COUNTED };
}

/** Open problems found (up to the cap); a stored result from an older version counts what it lists. */
export function openProblemCount(result: { problems: MenuProblem[]; total?: number; hasMore: boolean }): number {
  return countOf(result).count;
}

/** "3", or "99+" when more problems are open than were counted. */
export function problemCountLabel(result: { problems: MenuProblem[]; total?: number; hasMore: boolean }): string {
  const { count, cap } = countOf(result);
  return result.hasMore ? `${cap}+` : String(count);
}

export interface Preferences {
  refreshMinutes?: string;
  lookback?: string;
  extraFilter?: string;
}

const cache = new Cache();
const LAST_RESULT_KEY = "menubar-problems:last-result";
const LAST_FETCH_KEY = "menubar-problems:last-fetch";
const PREFS_KEY = "menubar-problems:prefs";
/** Bump when the parsing or shape of cached results changes: results cached by older code are then refetched. */
const CACHE_VERSION = 9;
const DEFAULT_INTERVAL_MINUTES = 30;

/** The fetch currently running in this process, shared by every loadProblems() call. */
let inflight: Promise<ProblemsResult> | undefined;

const intervalMinutesOf = (prefs: Preferences) => Number(prefs.refreshMinutes) || DEFAULT_INTERVAL_MINUTES;

function readCachedResult(): ProblemsResult | undefined {
  try {
    const raw = cache.get(LAST_RESULT_KEY);
    return raw ? (JSON.parse(raw) as ProblemsResult) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchResult(tenant: TenantConfig, prefs: Preferences): Promise<ProblemsResult> {
  const endpoint = tenant.tenantEndpoint.replace(/\/$/, "");
  // Checked locally before the (billable) query: without the scope the query may just return nothing.
  const scopeError = missingScopesError(tenant, PROBLEMS_REQUIRED_SCOPES);
  if (scopeError) return { state: "error", endpoint, error: classifyProblemsError(scopeError) };
  try {
    // One extra record tells us whether to show "N+".
    const { entries, skipped } = await listProblems(liveTransport, tenant, {
      limit: MAX_COUNTED + 1,
      lookback: prefs.lookback || "7d",
      extraFilter: prefs.extraFilter,
    });
    const found = entries.length + skipped;
    return {
      state: "ok",
      endpoint,
      tenantName: tenant.name,
      problems: entries.slice(0, MAX_SHOWN).map(toMenuProblem),
      total: Math.min(found, MAX_COUNTED),
      hasMore: found > MAX_COUNTED,
      ...(skipped > 0 && { unreadable: skipped }),
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return { state: "error", endpoint, error: classifyProblemsError(err) };
  }
}

/**
 * Problems result for the active tenant: the cached one while it is fresh, a new
 * query otherwise. `forced` bypasses the refresh interval (Refresh / Retry).
 */
export async function loadProblems(forced: boolean): Promise<ProblemsResult> {
  const prefs = getPreferenceValues<Preferences>();
  // Reading the active tenant is local and free; only the Grail query is throttled.
  const tenant = await getActiveTenant();
  // "No tenant" is never cached: it must clear as soon as a tenant is added.
  if (!tenant) return { state: "no-tenant" };

  // Tenant, credentials, scopes, lookback and filter all change what the cached result means.
  // The Cache is plain files: credentials enter only as a hash, so a new secret or token
  // (e.g. after an auth error) refetches at once instead of after the retry delay.
  // Stored as a hash: the URL, scopes and filter in it need not be readable on disk.
  const signature = createHash("sha256")
    .update(
      JSON.stringify([
        CACHE_VERSION,
        tenant.id,
        tenant.tenantEndpoint,
        credentialsFingerprint(tenant),
        [...tenant.scopes].sort(),
        prefs.lookback,
        prefs.extraFilter,
      ]),
    )
    .digest("hex");
  const signatureChanged = cache.get(PREFS_KEY) !== signature;

  // A fetch already running in this process is shared, never duplicated.
  if (inflight) return inflight;

  const last = readCachedResult();
  const lastFetchedAt = Number(cache.get(LAST_FETCH_KEY)) || undefined;
  const intervalMinutes = intervalMinutesOf(prefs);
  const force = forced || signatureChanged;
  const willFetch = !last || shouldFetch({ now: Date.now(), lastFetchedAt, intervalMinutes, force });
  // Every query is billable: reuse the last result until the chosen interval has elapsed.
  if (last && !willFetch) return last;

  inflight = fetchAndStore(tenant, prefs, signature).finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function fetchAndStore(tenant: TenantConfig, prefs: Preferences, signature: string): Promise<ProblemsResult> {
  const result = await fetchResult(tenant, prefs);
  // Config errors (scopes, credentials, bad filter) are cached too, so the menu does not
  // re-query every wake-up while the user has not fixed anything.
  cache.set(LAST_RESULT_KEY, JSON.stringify(result));
  // Any failure is re-checked soon: a timeout is transient, and a config error may have been fixed on the
  // Dynatrace side (e.g. a scope added to the OAuth client) without anything changing locally.
  const intervalMs = intervalMinutesOf(prefs) * 60_000;
  const backdate = result.state === "error" ? intervalMs - RETRY_AFTER_ERROR_MS : 0;
  cache.set(LAST_FETCH_KEY, String(Date.now() - Math.max(0, backdate)));
  cache.set(PREFS_KEY, signature);
  return result;
}
