// Guard: tenant configs carry client secrets and logs/spans/DQL results may
// carry PII, so none of them may go through Raycast's unencrypted on-disk
// Cache. The menu bar is the one allowed user: it caches problem titles only.

import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const UI_ROOT = join(__dirname, "..");
const ALLOWED = ["commands/menubar-problems"];
const FORBIDDEN = /\b(useCachedPromise|useCachedState|useFetch|useSQL|withCache|Cache)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const files = sourceFiles(UI_ROOT)
  .map((f) => relative(UI_ROOT, f))
  .filter((f) => !ALLOWED.some((dir) => f.startsWith(dir)));

describe("no on-disk cache for sensitive data", () => {
  it("scans the UI sources", () => {
    expect(files).toEqual(expect.arrayContaining(["commands/tenants/ManageTenants.tsx", "hooks/useActiveTenant.ts"]));
  });

  it.each(files)("%s does not use the Raycast Cache", (file) => {
    const code = readFileSync(join(UI_ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(code).not.toMatch(FORBIDDEN);
  });
});
