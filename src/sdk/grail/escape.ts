// Shared DQL string escaping — single source of truth for all DQL query builders.

/**
 * Escapes special characters in a string for safe interpolation into DQL query
 * strings. Escapes backslashes first, then double quotes.
 *
 * @example
 *   escapeDqlString('path\\to\\"file"') === 'path\\\\to\\\\"file\\"'
 */
export function escapeDqlString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
