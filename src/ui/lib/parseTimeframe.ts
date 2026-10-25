// Converts timeframe strings into ISO 8601 UTC { start, end } pairs.
//
// Supported formats:
//   Presets:    "15m" "30m" "1h" "2h" "6h" "12h" "24h" "3d" "7d"
//   Named:      "today" "yesterday"
//   ISO range:  "2024-01-01T00:00:00Z|2024-01-02T00:00:00Z"

export interface Timeframe {
  start: string;
  end: string;
}

const UNIT_TO_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

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
