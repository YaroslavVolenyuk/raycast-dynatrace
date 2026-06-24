import { escapeDqlString } from "../escape";

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
