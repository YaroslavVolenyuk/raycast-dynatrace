// Pins normalizeUrl behaviour (trim + strip trailing slashes) and its linear-time guarantee.

import { normalizeUrl } from "../environmentUrl";

describe("normalizeUrl", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    ["/", ""],
    ["///", ""],
    ["https://x///", "https://x"],
    ["https://x/a//", "https://x/a"],
    [" https://x/ \n", "https://x"],
    ["https://x//a//b", "https://x//a//b"],
    ["https://x", "https://x"],
    [" / / ", "/ "],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("stays linear on a long slash run followed by a non-slash", () => {
    const input = "https://x" + "/".repeat(100000) + "x";
    const start = performance.now();
    expect(normalizeUrl(input)).toBe(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
