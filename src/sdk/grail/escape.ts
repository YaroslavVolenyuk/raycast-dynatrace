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

/**
 * A relative duration (`30m`, `24h`, `7d`) for `from: now()-…`, which is not a
 * string literal and cannot be escaped: anything else is refused, so a value
 * that reaches a builder unchecked cannot add DQL commands (THREAT_MODEL.md Q2).
 */
export function dqlDuration(value: string): string {
  if (!/^\d{1,4}[smhd]$/.test(value)) throw new Error(`Invalid DQL duration: ${JSON.stringify(value)}`);
  return value;
}

/** A record limit for `| limit …`: a positive integer, or an error. */
export function dqlLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid DQL limit: ${value}`);
  return value;
}
