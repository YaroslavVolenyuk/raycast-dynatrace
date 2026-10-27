// Guard: tenant configs carry client secrets and logs/spans/DQL results may
// carry PII, so none of them may go through Raycast's unencrypted on-disk
// Cache. The menu bar is the one allowed user: it caches problem titles only.

import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

// src/ui and src/services both handle tenants and query results. (src/sdk cannot
// import @raycast/api at all — CI enforces that.)
const SRC_ROOT = join(__dirname, "..", "..");
const SCANNED = ["ui", "services"];
const ALLOWED = ["ui/commands/menubar-problems"];
const FORBIDDEN = /\b(useCachedPromise|useCachedState|useFetch|useSQL|withCache|Cache)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const files = SCANNED.flatMap((dir) => sourceFiles(join(SRC_ROOT, dir)))
  .map((f) => relative(SRC_ROOT, f))
  .filter((f) => !ALLOWED.some((dir) => f.startsWith(dir)));

describe("no on-disk cache for sensitive data", () => {
  it("scans the UI and services sources", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "ui/commands/tenants/ManageTenants.tsx",
        "ui/hooks/useActiveTenant.ts",
        "services/tenants.ts",
      ]),
    );
  });

  it.each(files)("%s does not use the Raycast Cache", (file) => {
    const code = readFileSync(join(SRC_ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(code).not.toMatch(FORBIDDEN);
  });
});
