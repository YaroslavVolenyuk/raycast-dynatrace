import { fenceCode } from "./markdown";

/** JSON.parse source-text access (ES2026, Node 21+); TypeScript 5.8 has no types for it. */
const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;

/**
 * Indented JSON with every number exactly as written: through `number`,
 * 9007199254740993 would print as …992 and 1e400 as null, and a 64-bit order
 * or trace id would show wrong. Undefined where the runtime cannot keep the
 * source text; the content is then shown as is. Throws for text that is not JSON.
 */
function prettyJson(content: string): string | undefined {
  if (!rawJSON) {
    JSON.parse(content);
    return undefined;
  }
  const keepNumber = (_key: string, value: unknown, context?: { source?: string }) =>
    typeof value === "number" && context?.source !== undefined ? rawJSON(context.source) : value;
  return JSON.stringify(JSON.parse(content, keepNumber), null, 2);
}

/**
 * Formats log content for display in a Raycast Detail view.
 * ALL content is fenced to prevent markdown injection (images, links) from
 * untrusted log data triggering zero-click beacon requests.
 */
export function formatLogContent(content: string | null): string | null {
  if (!content) return content;

  try {
    const pretty = prettyJson(content);
    if (pretty !== undefined) return fenceCode(pretty, "json");
  } catch {
    // not JSON — fall through
  }

  // Stack traces and plain text are both fenced (injection-safe either way).
  return fenceCode(content);
}
