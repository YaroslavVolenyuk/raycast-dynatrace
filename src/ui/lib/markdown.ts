// Helpers for putting untrusted telemetry into Raycast Detail markdown.
// Grail data (log fields, span attributes, DQL records) is attacker-controlled.

/**
 * Wraps untrusted content in a fenced code block whose fence is longer than the
 * longest backtick run in the content, preventing injection breakout.
 * (CommonMark: a longer fence always closes the block.)
 */
export function fenceCode(s: string, lang = ""): string {
  const longestRun = Math.max(0, ...(s.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${s}\n${fence}`;
}
