// Converts timeframe strings into ISO 8601 UTC { start, end } pairs.
//
// Supported formats:
//   Presets:    "15m" "30m" "1h" "2h" "6h" "12h" "24h" "3d" "7d"
//   Named:      "today" "yesterday"
//   ISO range:  "2024-01-01T00:00:00Z|2024-01-02T00:00:00Z"
//   Relative:   "-30m" "-2h" "-3d"
//   Literal:    "now"

export interface Timeframe {
  start: string;
  end: string;
}

const UNIT_TO_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const PRESET_LABELS: Record<string, string> = {
  "15m": "Last 15 min",
  "30m": "Last 30 min",
  "1h": "Last 1 hour",
  "2h": "Last 2 hours",
  "6h": "Last 6 hours",
  "12h": "Last 12 hours",
  "24h": "Last 24 hours",
  "3d": "Last 3 days",
  "7d": "Last 7 days",
  today: "Today",
  yesterday: "Yesterday",
};

/** Human-readable label for a saved timeframe string. */
export function timeframeLabel(tf: string): string {
  if (!tf) return "";

  if (tf.includes("|")) {
    const [start, end] = tf.split("|");
    const fmt = (s: string) =>
      new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `${fmt(start)} → ${fmt(end)}`;
  }

  return PRESET_LABELS[tf] ?? tf;
}

/**
 * Parse a single time expression into a Date.
 * Supports: "now", "-30m", "-2h", "-3d", or any string parseable by `new Date()`.
 * Returns null if unparseable.
 */
export function parseTimeExpression(expr: string): Date | null {
  const s = expr.trim().toLowerCase();
  if (!s || s === "now") return new Date();

  const rel = s.match(/^-(\d+)(m|h|d)$/);
  if (rel) {
    const amount = parseInt(rel[1], 10);
    const ms = UNIT_TO_MS[rel[2]];
    return ms ? new Date(Date.now() - amount * ms) : null;
  }

  const d = new Date(expr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Convert a saved timeframe string into { start, end }.
 * Falls back to last 24 hours for unrecognised input.
 */
export function parseTimeframe(input: string | undefined | null): Timeframe {
  const raw = (input ?? "").trim().toLowerCase();

  if (!raw) return relativeTimeframe(24, "h");

  // ISO range
  if (raw.includes("|")) {
    const [start, end] = input!.split("|");
    return { start, end };
  }

  // Named presets
  if (raw === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (raw === "yesterday") {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  // Duration: "30m", "2h", "7d" or legacy plain number (hours)
  const durationMatch = raw.match(/^(\d+)([mhd]?)$/);
  if (durationMatch) {
    const amount = parseInt(durationMatch[1], 10);
    const unit = (durationMatch[2] || "h") as "m" | "h" | "d";
    if (amount > 0 && UNIT_TO_MS[unit]) {
      return relativeTimeframe(amount, unit);
    }
  }

  return relativeTimeframe(24, "h");
}

function relativeTimeframe(amount: number, unit: "m" | "h" | "d"): Timeframe {
  const now = Date.now();
  return {
    start: new Date(now - amount * UNIT_TO_MS[unit]).toISOString(),
    end: new Date(now).toISOString(),
  };
}
