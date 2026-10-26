import { TIMEFRAME_PRESETS, timeframeLabel } from "../timeframes";
import { parseTimeframe } from "../../../lib/parseTimeframe";

describe("timeframes", () => {
  it("every preset is understood by parseTimeframe (no silent 24h fallback)", () => {
    for (const { value } of TIMEFRAME_PRESETS) {
      if (value === "today" || value === "yesterday" || value === "24h") continue;
      const { start, end } = parseTimeframe(value);
      expect(Date.parse(end) - Date.parse(start)).not.toBe(24 * 3600_000);
    }
  });

  it("labels presets and custom ranges", () => {
    expect(timeframeLabel("30m")).toBe("Last 30 minutes");
    expect(timeframeLabel("2026-10-25T10:00:00Z|2026-10-26T10:00:00Z")).toContain("–");
  });
});
