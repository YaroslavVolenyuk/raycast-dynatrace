// The menu bar command wakes on a fixed manifest interval; the user-chosen
// refresh interval is enforced here by skipping the (billable) query when the
// last successful fetch is still fresh.

/** Slack so a wake-up a few seconds early does not skip a whole cycle. */
const TOLERANCE_MS = 60_000;

export function shouldFetch(opts: { now: number; lastFetchedAt?: number; intervalMinutes: number; force?: boolean }) {
  const { now, lastFetchedAt, intervalMinutes, force } = opts;
  if (force || lastFetchedAt === undefined) return true;
  return now - lastFetchedAt >= intervalMinutes * 60_000 - TOLERANCE_MS;
}

/** Local wall-clock time of a fetch, e.g. "18:32". Absolute on purpose: the menu is not redrawn while closed, so a relative age would be frozen at the last render. */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
