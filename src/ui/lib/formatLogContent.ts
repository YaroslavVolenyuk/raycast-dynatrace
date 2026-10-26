import { fenceCode } from "./markdown";

/**
 * Formats log content for display in a Raycast Detail view.
 * ALL content is fenced to prevent markdown injection (images, links) from
 * untrusted log data triggering zero-click beacon requests.
 */
export function formatLogContent(content: string | null): string | null {
  if (!content) return content;

  try {
    const parsed = JSON.parse(content);
    return fenceCode(JSON.stringify(parsed, null, 2), "json");
  } catch {
    // not JSON — fall through
  }

  // Stack traces and plain text are both fenced (injection-safe either way).
  return fenceCode(content);
}
