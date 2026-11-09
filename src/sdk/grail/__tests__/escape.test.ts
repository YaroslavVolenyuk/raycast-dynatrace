import { escapeDqlString } from "../escape";
import { buildLogsQuery, buildProblemsQuery, buildSpansQuery } from "../../resources";

test("escapes double quotes", () => {
  expect(escapeDqlString('say "hi"')).toBe('say \\"hi\\"');
});

test("escapes backslashes before quotes", () => {
  expect(escapeDqlString('a\\b"c')).toBe('a\\\\b\\"c');
});

test("leaves plain strings untouched", () => {
  expect(escapeDqlString("service.name")).toBe("service.name");
});

test("escapes backslash-quote sequence correctly", () => {
  // path\"file"  ->  path\\\"file\"
  expect(escapeDqlString('path\\"file"')).toBe('path\\\\\\"file\\"');
});

// Q2: `from: now()-…` and `limit …` are not string literals and cannot be escaped,
// so each builder refuses anything but a duration and a positive integer itself,
// whatever list the views check against.
describe("query builders refuse a duration or limit that could carry DQL", () => {
  const injected = '1h | fieldsAdd x = "y" //';
  test.each([
    ["logs", () => buildLogsQuery({ timeframeDql: injected })],
    ["spans", () => buildSpansQuery({ timeframeDql: injected })],
    ["problems", () => buildProblemsQuery({ lookback: injected })],
  ])("%s: duration", (_name, build) => expect(build).toThrow(/Invalid DQL duration/));

  test.each([
    ["logs", () => buildLogsQuery({ limit: Number("1 | fieldsAdd x") })],
    ["spans", () => buildSpansQuery({ limit: 0 })],
    ["problems", () => buildProblemsQuery({ limit: 1.5 })],
  ])("%s: limit", (_name, build) => expect(build).toThrow(/Invalid DQL limit/));

  test("accepts the durations the manifest offers", () => {
    expect(buildLogsQuery({ timeframeDql: "15m", limit: 50 })).toMatch(/^fetch logs, from: now\(\)-15m .* limit 50$/);
    expect(buildProblemsQuery({ lookback: "30d" })).toContain("from: now()-30d");
  });
});
