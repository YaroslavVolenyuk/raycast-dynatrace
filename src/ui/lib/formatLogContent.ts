/**
 * Wraps untrusted content in a fenced code block whose fence is longer than the
 * longest backtick run in the content, preventing injection breakout.
 * (CommonMark: a longer fence always closes the block.)
 */
function fenceRaw(s: string, lang = ""): string {
  const longestRun = Math.max(0, ...(s.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${s}\n${fence}`;
}

/**
 * Formats log content for display in a Raycast Detail view.
 * ALL content is fenced to prevent markdown injection (images, links) from
 * untrusted log data triggering zero-click beacon requests.
 */
export function formatLogContent(content: string | null): string | null {
  if (!content) return content;

  try {
    const parsed = JSON.parse(content);
    return fenceRaw(JSON.stringify(parsed, null, 2), "json");
  } catch {
    // not JSON — fall through
  }

  // Stack traces and plain text are both fenced (injection-safe either way).
  return fenceRaw(content);
}
