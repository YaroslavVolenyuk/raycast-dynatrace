import { formatLogContent } from "../formatLogContent";

describe("formatLogContent", () => {
  it("returns null/empty unchanged", () => {
    expect(formatLogContent(null)).toBeNull();
    expect(formatLogContent("")).toBe("");
  });

  it("pretty-prints JSON in a json fence", () => {
    const out = formatLogContent('{"a":1}')!;
    expect(out).toContain("```json");
    expect(out).toContain('"a": 1');
  });

  it("keeps every number exactly as the log wrote it", () => {
    const out = formatLogContent('{"orderId":9007199254740993,"big":1e400,"amount":1.10,"n":[-0,2E3]}')!;
    expect(out).toContain('"orderId": 9007199254740993');
    expect(out).toContain('"big": 1e400');
    expect(out).toContain('"amount": 1.10');
    expect(out).toContain("-0,");
    expect(out).toContain("2E3");
  });

  it("fences plain text to block markdown injection", () => {
    const out = formatLogContent("![x](http://evil/beacon)")!;
    expect(out.startsWith("```")).toBe(true);
    // the image markdown stays inside the fence, never rendered
    expect(out).toContain("![x](http://evil/beacon)");
  });

  it("uses a longer fence than any backtick run in the content", () => {
    const out = formatLogContent("text with ``` inside")!;
    // opening fence must be at least 4 backticks so the inner ``` cannot close it
    expect(out).toMatch(/^````+/);
  });
});
