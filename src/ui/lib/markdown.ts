// Helpers for putting untrusted telemetry into Raycast Detail markdown.
// Grail data (log fields, span attributes, DQL records) is attacker-controlled:
// an unescaped `![](https://evil/x)` would load a remote image when the view
// opens (zero-click beacon), and a stray `|` or newline breaks the table.

/** Escapes inline markdown syntax and flattens line breaks so a value renders as literal text in one table cell. */
export function escapeMarkdown(s: string): string {
  return s.replace(/\r?\n|\r/g, " ").replace(/[\\`*_[\]()!<>|#~]/g, "\\$&");
}

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

// Zero-width spaces before dots and inside "://" stop GFM autolinking: field
// names like "host.name" look like domains, and URL values would turn into
// clickable links the user never asked for.
const noAutolink = (s: string): string => s.replace(/\./g, "\u200B.").replace(/:\/\//g, ":\u200B//");

/** escapeMarkdown plus autolink suppression: for untrusted values shown in table cells. */
export function escapeCell(s: string): string {
  return noAutolink(escapeMarkdown(s));
}

/** Two-column Field/Value table; empty values are skipped, everything is escaped. Returns "" when no rows remain. */
export function keyValueTable(rows: ReadonlyArray<readonly [string, string | undefined]>): string {
  const valid = rows.filter((r): r is readonly [string, string] => r[1] !== undefined && r[1] !== "");
  if (valid.length === 0) return "";
  return ["| Field | Value |", "|---|---|", ...valid.map(([k, v]) => `| ${escapeCell(k)} | ${escapeCell(v)} |`)].join(
    "\n",
  );
}
