import { buildProblemUrl, buildTraceUrl } from "../deepLinks";

const BASE = "https://abc.apps.dynatrace.com";

describe("buildProblemUrl", () => {
  it("matches the Problems app URL format", () => {
    expect(buildProblemUrl(BASE, "-245_1792676100000V2")).toBe(
      "https://abc.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/problem/-245_1792676100000V2",
    );
  });

  // Problem and trace IDs come from telemetry: they must not move the link off the tenant.
  it("keeps a hostile problem id inside the path of the tenant's own host", () => {
    const url = new URL(buildProblemUrl(BASE, "../../../../@attacker.example/x?y=1#z"));
    expect(url.host).toBe("abc.apps.dynatrace.com");
    expect(url.pathname.startsWith("/ui/apps/dynatrace.davis.problems/problem/")).toBe(true);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });
});

describe("buildTraceUrl", () => {
  it("keeps a hostile trace id inside the filter parameter of the tenant's own host", () => {
    const hostile = '"&filter=x#@attacker.example/';
    const url = new URL(buildTraceUrl(BASE, hostile));
    expect(url.host).toBe("abc.apps.dynatrace.com");
    expect([...url.searchParams.keys()]).toEqual(["filter"]);
    expect(url.searchParams.get("filter")).toBe(`trace.id="${hostile}"`);
    expect(url.hash).toBe("");
  });
});
