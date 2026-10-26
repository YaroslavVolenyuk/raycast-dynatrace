import { missingScopesError } from "../scopeHint";
import { classifyProblemsError } from "../problemsError";

const REQUIRED = ["storage:buckets:read", "storage:events:read"];

describe("missingScopesError", () => {
  it("is undefined when every required scope is configured", () => {
    expect(missingScopesError({ scopes: [...REQUIRED, "storage:logs:read"] }, REQUIRED)).toBeUndefined();
  });

  // A tenant created with the default (required-only) scopes has no storage:events:read.
  it("names the missing scope and both places to add it", () => {
    const err = missingScopesError({ scopes: ["storage:buckets:read", "storage:logs:read"] }, REQUIRED);
    expect(err?.message).toContain("(storage:events:read)");
    expect(err?.message).toMatch(/OAuth client/);
    expect(err?.message).toMatch(/Manage Tenants/);
  });

  it("is shown in the menu bar as a config error naming the scope", () => {
    const err = missingScopesError({ scopes: ["storage:buckets:read"] }, REQUIRED)!;
    const info = classifyProblemsError(err);
    expect(info.kind).toBe("config");
    expect(info.summary).toBe("Missing OAuth scope: storage:events:read");
  });
});
