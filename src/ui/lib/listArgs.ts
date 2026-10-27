// Whitelists for Search Logs / Search Traces arguments. Raycast passes
// arguments through deeplinks verbatim, so a value outside the manifest's
// dropdown list must never reach the DQL text (timeframes are interpolated
// into `from: now()-…`).

import type { LogLevel } from "../../sdk/resources";

export const TIMEFRAMES = [
  { value: "15m", title: "Last 15 min" },
  { value: "30m", title: "Last 30 min" },
  { value: "1h", title: "Last 1h" },
  { value: "6h", title: "Last 6h" },
  { value: "24h", title: "Last 24h" },
  { value: "3d", title: "Last 3d" },
  { value: "7d", title: "Last 7d" },
] as const;

export type TimeframeValue = (typeof TIMEFRAMES)[number]["value"];

export const LOG_LEVELS: ReadonlyArray<{ value: LogLevel; title: string }> = [
  { value: "all", title: "All Levels" },
  { value: "error", title: "Error" },
  { value: "warn", title: "Warn" },
  { value: "info", title: "Info" },
  { value: "none", title: "None" },
];

export const DEFAULT_TIMEFRAME: TimeframeValue = "24h";

export function pickTimeframe(arg: string | undefined): TimeframeValue {
  return TIMEFRAMES.find((t) => t.value === arg)?.value ?? DEFAULT_TIMEFRAME;
}

export function timeframeTitle(value: TimeframeValue): string {
  return TIMEFRAMES.find((t) => t.value === value)?.title ?? value;
}

export function pickLevel(arg: string | undefined): LogLevel {
  return LOG_LEVELS.find((l) => l.value === arg)?.value ?? "all";
}

/** A positive integer up to `max`, or undefined (use the resource default). */
export function pickLimit(arg: string | undefined, max: number): number | undefined {
  if (!arg || !/^\d+$/.test(arg)) return undefined;
  const n = Number(arg);
  return n > 0 ? Math.min(n, max) : undefined;
}
