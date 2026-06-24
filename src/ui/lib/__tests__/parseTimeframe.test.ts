import { parseTimeframe, parseTimeExpression, timeframeLabel } from "../parseTimeframe";

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

  it("handles empty/nullish input as 24h", () => {
    const hours = (input: string | null) => {
      const { start, end } = parseTimeframe(input);
      return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000);
    };
    expect(hours("")).toBe(24);
    expect(hours(null)).toBe(24);
  });
});

describe("parseTimeExpression", () => {
  it("resolves 'now' to a date", () => {
    expect(parseTimeExpression("now")).toBeInstanceOf(Date);
  });

  it("resolves relative '-30m'", () => {
    const d = parseTimeExpression("-30m")!;
    expect(Math.round((Date.now() - d.getTime()) / 60000)).toBe(30);
  });

  it("returns null for unparseable input", () => {
    expect(parseTimeExpression("not-a-date")).toBeNull();
  });
});

describe("timeframeLabel", () => {
  it("maps known presets to friendly labels", () => {
    expect(timeframeLabel("24h")).toBe("Last 24 hours");
  });

  it("passes through unknown values", () => {
    expect(timeframeLabel("99h")).toBe("99h");
  });
});
