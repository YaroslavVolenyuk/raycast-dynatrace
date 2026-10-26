import { classifyProblemsError } from "../problemsError";

describe("classifyProblemsError", () => {
  it("names the missing scope from a 403 message", () => {
    const r = classifyProblemsError(
      new Error(
        "Access denied — OAuth client is missing required scopes (storage:buckets:read, storage:events:read). Check Manage Tenants.",
      ),
    );
    expect(r.kind).toBe("config");
    expect(r.summary).toContain("storage:events:read");
  });

  it("treats auth failures as config", () => {
    expect(classifyProblemsError(new Error("Authentication failed — token rejected by Dynatrace.")).kind).toBe(
      "config",
    );
    expect(classifyProblemsError(new Error("OAuth error: check client_id / client_secret (401)")).kind).toBe("config");
  });

  it("treats timeouts and unknown errors as transient", () => {
    expect(classifyProblemsError(new Error("Dynatrace is not responding (15s timeout)")).kind).toBe("transient");
    expect(classifyProblemsError("boom").kind).toBe("transient");
  });
});

describe("classifyProblemsError — query errors", () => {
  it("points a rejected query at the Extra DQL Filter", () => {
    const r = classifyProblemsError(new Error("Dynatrace: Syntax error near 'foo' (code 400)"));
    expect(r.kind).toBe("config");
    expect(r.summary).toContain("Extra DQL Filter");
  });
  it("flags an invalid filter expression", () => {
    expect(classifyProblemsError(new Error("Extra DQL filter must be a single expression")).kind).toBe("config");
  });
});

describe("classifyProblemsError — environment URL", () => {
  it("treats a non-existent environment host as config, not as a network outage", () => {
    const r = classifyProblemsError(new Error("Environment URL not found: x.apps.dynatrace.ua does not exist."));
    expect(r.kind).toBe("config");
  });
});

describe("classifyProblemsError — unreadable records", () => {
  it("does not blame the network for records it could not parse", () => {
    const r = classifyProblemsError(new Error("Unexpected problem record format (event.name: expected string)"));
    expect(r.summary).toContain("Unexpected data");
  });
});
