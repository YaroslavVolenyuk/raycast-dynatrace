import { formatCell, pickTitleColumn, summarizeRecord, recordMatches, toCsv, recordMarkdownTable } from "../dqlRecord";

describe("formatCell", () => {
  it("renders objects as JSON, not [object Object]", () => {
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
  });
  it("summarizes long arrays (timeseries)", () => {
    expect(formatCell(Array.from({ length: 60 }, (_, i) => i))).toBe("[60 values]");
  });
  it("collapses whitespace and truncates", () => {
    expect(formatCell("a\n  b")).toBe("a b");
    expect(formatCell("x".repeat(10), 5)).toBe("xxxx…");
  });
  it("shows a dash for null", () => {
    expect(formatCell(null)).toBe("—");
  });
});

describe("pickTitleColumn", () => {
  it("prefers a known descriptive field", () => {
    expect(pickTitleColumn(["timestamp", "loglevel", "content"])).toBe("content");
  });
  it("falls back to the first non-time column", () => {
    expect(pickTitleColumn(["timestamp", "count()"])).toBe("count()");
  });
  it("is undefined without columns", () => {
    expect(pickTitleColumn([])).toBeUndefined();
  });
});

describe("summarizeRecord", () => {
  it("lists the remaining columns", () => {
    const r = { content: "hi", "service.name": "api", n: 3 };
    expect(summarizeRecord(r, Object.keys(r), ["content"])).toBe("service.name: api · n: 3");
  });
});

describe("recordMatches", () => {
  it("searches nested values case-insensitively", () => {
    expect(recordMatches({ a: { deep: "Payment" } }, "payment")).toBe(true);
    expect(recordMatches({ a: 1 }, "zzz")).toBe(false);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks; empty for missing", () => {
    const csv = toCsv([{ a: 'x,"y"', b: "l1\nl2" }, { a: 1 }], ["a", "b"]);
    expect(csv).toBe('a,b\n"x,""y""","l1\nl2"\n1,');
  });

  it("neutralizes text a spreadsheet would run as a formula", () => {
    const csv = toCsv(
      [{ a: '=HYPERLINK("http://x")', b: "+1", c: "@SUM(A1)", d: "-cmd", e: "\tx" }],
      ["a", "b", "c", "d", "e"],
    );
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""http://x"")",'+1,'@SUM(A1),'-cmd,'\tx`);
  });

  it("keeps numbers and ordinary text as they are", () => {
    expect(toCsv([{ n: -1, s: "a=b", t: "1-2" }], ["n", "s", "t"]).split("\n")[1]).toBe("-1,a=b,1-2");
  });
});

describe("recordMarkdownTable", () => {
  it("escapes pipes", () => {
    expect(recordMarkdownTable({ q: "a | b" }, ["q"])).toContain("a \\| b");
  });
});
