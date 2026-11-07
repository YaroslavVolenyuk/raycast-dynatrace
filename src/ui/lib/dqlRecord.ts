// Rendering helpers for free-form DQL records (Run DQL). The record shape is
// whatever the query returns, so everything here works on plain key/value maps.

import type { KeyValueGroup } from "./svg";

/** Fields that make a good row title, in order of preference. */
const TITLE_CANDIDATES = [
  "content",
  "event.name",
  "span.name",
  "name",
  "entity.name",
  "service.name",
  "host.name",
  "dt.process.name",
  "display_id",
];

/** Columns Grail uses for record time; shown as an accessory, not in the subtitle. */
const TIME_COLUMNS = ["timestamp", "start_time", "event.start"];

/**
 * One-line text for any DQL value. Objects and arrays are shown as compact JSON
 * (the PoC printed "[object Object]"); timeseries arrays get a short summary.
 */
export function formatCell(value: unknown, maxLength = 120): string {
  let text: string;
  if (value === null || value === undefined) text = "—";
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") text = String(value);
  else if (Array.isArray(value) && value.length > 10) text = `[${value.length} values]`;
  else text = JSON.stringify(value);
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Full, multi-line text of a value for the detail views. */
export function formatValueFull(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function findTimeColumn(columns: readonly string[]): string | undefined {
  return TIME_COLUMNS.find((c) => columns.includes(c));
}

/**
 * The column used as the row title: a well-known descriptive field if the query
 * returned one, else the first column that is not the time column.
 */
export function pickTitleColumn(columns: readonly string[]): string | undefined {
  const known = TITLE_CANDIDATES.find((c) => columns.includes(c));
  if (known) return known;
  const time = findTimeColumn(columns);
  return columns.find((c) => c !== time) ?? columns[0];
}

/** "key: value · key: value" for the columns not shown elsewhere in the row. */
export function summarizeRecord(
  record: Record<string, unknown>,
  columns: readonly string[],
  skip: readonly (string | undefined)[],
  maxLength = 100,
): string {
  const text = columns
    .filter((c) => !skip.includes(c) && record[c] !== undefined)
    .map((c) => `${c}: ${formatCell(record[c], 40)}`)
    .join(" · ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Case-insensitive match of the search text against every value of the record. */
export function recordMatches(record: Record<string, unknown>, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return Object.values(record).some((v) => formatValueFull(v).toLowerCase().includes(q));
}

// A cell starting with one of these is run as a formula by Excel, Numbers and
// Sheets; log content is attacker-controlled (e.g. `=HYPERLINK(...)`).
const FORMULA_START = /^[=+\-@\t\r]/;

function csvText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * RFC 4180 CSV of the records, one column per DQL field. Text that a
 * spreadsheet would evaluate as a formula is prefixed with `'` (OWASP); plain
 * numbers such as -1 are left alone.
 */
export function toCsv(records: readonly Record<string, unknown>[], columns: readonly string[]): string {
  const cell = (v: unknown) => {
    let text = csvText(v);
    if (typeof v !== "number" && typeof v !== "bigint" && FORMULA_START.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(cell).join(","), ...records.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}

/** One group with every defined field of a record, values flattened to text (escaping is the SVG builder's job). */
export function recordFieldGroup(
  record: Record<string, unknown>,
  columns: readonly string[],
  title = "Fields",
): KeyValueGroup {
  return {
    title,
    rows: columns.filter((c) => record[c] !== undefined).map((c) => [c, formatCell(record[c], 500)] as const),
  };
}
