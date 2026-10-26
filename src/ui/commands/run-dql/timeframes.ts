// Timeframe presets of Run DQL — the same set as the Dynatrace timeframe picker.
// Values are parseTimeframe keys.

export const TIMEFRAME_PRESETS = [
  { value: "5m", title: "Last 5 minutes" },
  { value: "15m", title: "Last 15 minutes" },
  { value: "30m", title: "Last 30 minutes" },
  { value: "1h", title: "Last hour" },
  { value: "2h", title: "Last 2 hours" },
  { value: "6h", title: "Last 6 hours" },
  { value: "24h", title: "Last 24 hours" },
  { value: "3d", title: "Last 72 hours" },
  { value: "7d", title: "Last 7 days" },
  { value: "30d", title: "Last 30 days" },
  { value: "today", title: "Today" },
  { value: "yesterday", title: "Yesterday" },
] as const;

export const DEFAULT_TIMEFRAME = "2h";

/** Human label of a timeframe key; a custom "start|end" range is shown in local time. */
export function timeframeLabel(key: string): string {
  const preset = TIMEFRAME_PRESETS.find((p) => p.value === key);
  if (preset) return preset.title;
  const [start, end] = key.split("|");
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  return end ? `${fmt(start)} – ${fmt(end)}` : key;
}
