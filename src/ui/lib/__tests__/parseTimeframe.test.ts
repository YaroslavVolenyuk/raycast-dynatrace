import { parseTimeframe } from "../parseTimeframe";

describe("parseTimeframe", () => {
  it("parses a duration preset into a start/end window", () => {
    const { start, end } = parseTimeframe("1h");
    const ms = new Date(end).getTime() - new Date(start).getTime();
    expect(Math.round(ms / 60000)).toBe(60);
  });

  it("treats a bare number as hours", () => {
    const { start, end } = parseTimeframe("2");
    const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
    expect(Math.round(hours)).toBe(2);
  });

  it("parses an explicit ISO range", () => {
    const tf = parseTimeframe("2024-01-01T00:00:00Z|2024-01-02T00:00:00Z");
    expect(tf.start).toBe("2024-01-01T00:00:00Z");
    expect(tf.end).toBe("2024-01-02T00:00:00Z");
  });

  it("falls back to 24h for unrecognised input", () => {
    const { start, end } = parseTimeframe("garbage");
    const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
    expect(Math.round(hours)).toBe(24);
  });

  it("covers the local calendar day for today and yesterday", () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 25, 15, 30) });
    try {
      expect(parseTimeframe("today")).toEqual({
        start: new Date(2026, 9, 25, 0, 0, 0, 0).toISOString(),
        end: new Date(2026, 9, 25, 23, 59, 59, 999).toISOString(),
      });
      expect(parseTimeframe("Yesterday")).toEqual({
        start: new Date(2026, 9, 24, 0, 0, 0, 0).toISOString(),
        end: new Date(2026, 9, 24, 23, 59, 59, 999).toISOString(),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("handles empty/nullish input as 24h", () => {
    const hours = (input: string | null) => {
      const { start, end } = parseTimeframe(input);
      return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000);
    };
    expect(hours("")).toBe(24);
    expect(hours(null)).toBe(24);
  });
});
