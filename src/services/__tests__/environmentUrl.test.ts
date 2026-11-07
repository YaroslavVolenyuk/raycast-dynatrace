// Pins normalizeUrl behaviour (trim + strip trailing slashes) and its linear-time guarantee.

import { isDynatraceHost, normalizeUrl } from "../environmentUrl";

describe("isDynatraceHost", () => {
  it.each([
    ["https://abc12345.apps.dynatrace.com", true],
    ["https://abc.dev.apps.dynatracelabs.com/ui", true],
    ["https://sso.dynatrace.com/sso/oauth2/token", true],
    // lookalikes
    ["https://abc12345.apps.dynatrace.com.attacker.example", false],
    ["https://abc12345-apps-dynatrace.com", false],
    ["https://dynatrace.com@attacker.example", false],
    ["https://proxy.corp.example", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isDynatraceHost(url)).toBe(expected);
  });
});

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
