// Section title and subtitle for the search commands' result lists.

/** "3 logs · Last 2 hours · Tenant": the count first, then the parts that are set. */
export function listSectionTitle(count: number, noun: string, parts: (string | undefined)[]): string {
  return [`${count} ${noun}${count === 1 ? "" : "s"}`, ...parts].filter(Boolean).join(" · ");
}

/** Unreadable records take precedence over the Load More hint. */
export function listSectionSubtitle(skipped: number, canLoadMore = false): string | undefined {
  if (skipped) return `${skipped} record${skipped === 1 ? "" : "s"} could not be read`;
  return canLoadMore ? "More available — ⌘L to load more" : undefined;
}
