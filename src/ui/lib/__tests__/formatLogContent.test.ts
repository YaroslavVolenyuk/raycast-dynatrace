import { formatLogContent, extractErrorMessage } from "../formatLogContent";

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

describe("extractErrorMessage", () => {
  it("returns the first error line", () => {
    const msg = extractErrorMessage("Exception: boom\n  at x");
    expect(msg).toBe("Exception: boom");
  });

  it("returns null when no error line is present", () => {
    expect(extractErrorMessage("just a log line")).toBeNull();
  });
});
