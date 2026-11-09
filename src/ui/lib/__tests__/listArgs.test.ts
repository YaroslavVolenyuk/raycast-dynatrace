import { pickTimeframe, pickLevel, pickLimit, timeframeTitle, stringArg } from "../listArgs";

describe("pickTimeframe", () => {
  it("accepts manifest values", () => {
    expect(pickTimeframe("3d")).toBe("3d");
  });

  it("falls back to 24h for anything else, including DQL injection attempts", () => {
    expect(pickTimeframe(undefined)).toBe("24h");
    expect(pickTimeframe("1h | fetch spans")).toBe("24h");
    expect(pickTimeframe("2h")).toBe("24h");
  });

  it("has a title for every value", () => {
    expect(timeframeTitle("15m")).toBe("Last 15 min");
  });
});

describe("pickLevel", () => {
  it("accepts known levels and falls back to all", () => {
    expect(pickLevel("error")).toBe("error");
    expect(pickLevel('error" or true')).toBe("all");
    expect(pickLevel(undefined)).toBe("all");
  });
});

describe("pickLimit", () => {
  it("parses positive integers and caps them", () => {
    expect(pickLimit("250", 1000)).toBe(250);
    expect(pickLimit("5000", 1000)).toBe(1000);
  });

  it("rejects non-numbers, zero and partial numbers", () => {
    expect(pickLimit("abc", 1000)).toBeUndefined();
    expect(pickLimit("0", 1000)).toBeUndefined();
    expect(pickLimit("10; drop", 1000)).toBeUndefined();
    expect(pickLimit(undefined, 1000)).toBeUndefined();
  });
});

// A deeplink can put any JSON type where the manifest promises text (Run DQL called dql.trim() on it).
it("stringArg passes text through and drops other types", () => {
  expect([stringArg("fetch logs"), stringArg(123), stringArg({ dql: "x" }), stringArg(undefined)]).toEqual([
    "fetch logs",
    undefined,
    undefined,
    undefined,
  ]);
});
