import { listProblems, liveTransport, type TenantConfig } from "../../../sdk";
import { classifyProblemsError } from "../problemsError";

// The rules match the wording of the errors the SDK throws, so the errors here
// come from the real producers (listProblems → executeDqlQuery → fetch), not from
// copied strings: rewording an SDK message must fail this file.
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const TOKEN_TENANT = {
  id: "t1",
  name: "Prod",
  tenantEndpoint: "https://abc12345.apps.dynatrace.com",
  clientId: "",
  clientSecret: "",
  ssoEndpoint: "",
  scopes: [],
  platformToken: "dt0s16.A.B",
} as TenantConfig;
const OAUTH_TENANT = {
  ...TOKEN_TENANT,
  clientId: "dt0s02.A",
  clientSecret: "dt0s02.A.B",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  platformToken: undefined,
} as TenantConfig;

const respond = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

/** Classifies what listProblems throws for the given responses. */
async function classifyFailure(tenant: TenantConfig, ...responses: unknown[]) {
  for (const r of responses) {
    if (r instanceof Error) mockFetch.mockRejectedValueOnce(r);
    else mockFetch.mockResolvedValueOnce(r);
  }
  const err = await listProblems(liveTransport, tenant).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  return classifyProblemsError(err);
}

beforeEach(() => mockFetch.mockReset());
afterEach(() => jest.restoreAllMocks());

describe("classifyProblemsError, fed by the SDK's own errors", () => {
  it("names the missing scope from a 403", async () => {
    const r = await classifyFailure(TOKEN_TENANT, respond(403, "forbidden"));
    expect(r).toMatchObject({ kind: "config", summary: "Missing scope: storage:buckets:read, storage:events:read" });
  });

  it("treats a rejected token or OAuth client as config", async () => {
    expect((await classifyFailure(TOKEN_TENANT, respond(401, ""))).kind).toBe("config");
    const oauth = await classifyFailure(OAUTH_TENANT, respond(401, '{"error":"invalid_client"}'));
    expect(oauth).toMatchObject({ kind: "config", summary: "Authentication failed — check credentials" });
  });

  it("points a query Grail rejects at the Extra DQL Filter", async () => {
    const r = await classifyFailure(TOKEN_TENANT, respond(400, { error: { code: 400, message: "Syntax error" } }));
    expect(r).toMatchObject({ kind: "config", summary: "Query rejected — check Extra DQL Filter in preferences" });
  });

  it("flags an invalid Extra DQL Filter without querying", async () => {
    const err = await listProblems(liveTransport, TOKEN_TENANT, { extraFilter: "a | limit 1" }).catch((e) => e);
    expect(classifyProblemsError(err).kind).toBe("config");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("treats a non-existent environment host as config, not as a network outage", async () => {
    const dns = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    expect(await classifyFailure(TOKEN_TENANT, dns)).toMatchObject({
      kind: "config",
      summary: "Environment URL not found — check the tenant",
    });
  });

  it("says the endpoint looks wrong when it answers with an HTML page", async () => {
    expect((await classifyFailure(TOKEN_TENANT, respond(200, "<html>login</html>"))).summary).toBe(
      "Tenant endpoint looks wrong",
    );
  });

  it("treats a query that did not finish as transient", async () => {
    let now = 0;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 3_600_000)); // every look at the clock: an hour later
    const running = respond(202, { state: "RUNNING", requestToken: "tok" });
    expect(await classifyFailure(TOKEN_TENANT, running, respond(200, ""))).toMatchObject({
      kind: "transient",
      summary: "Dynatrace is not responding",
    });
  });

  it("does not blame the network for records it could not parse", async () => {
    const bad = { "event.id": "p1", "event.name": 42, "event.status": "ACTIVE", "event.start": "t" };
    const r = await classifyFailure(TOKEN_TENANT, respond(200, { state: "SUCCEEDED", result: { records: [bad] } }));
    expect(r).toMatchObject({ kind: "transient", summary: "Unexpected data from Dynatrace — copy error details" });
  });

  it("treats anything else as transient", () => {
    expect(classifyProblemsError("boom")).toMatchObject({ kind: "transient", summary: "Could not reach Dynatrace" });
  });
});

describe("classifyProblemsError — scope list extraction", () => {
  const summary = (msg: string) => classifyProblemsError(new Error(msg)).summary;

  it("takes the first parenthesised group containing a colon", () => {
    expect(summary("missing required scopes (storage:buckets:read, storage:events:read). x")).toBe(
      "Missing scope: storage:buckets:read, storage:events:read",
    );
  });

  // scopeListIn replaced the regex /\(([^)]*:[^)]*)\)/ (ReDoS); these are the cases where the two could differ.
  it("matches the regex it replaced on odd parentheses", () => {
    expect(summary("access denied (no colon) then (a:b)")).toBe("Missing scope: a:b");
    expect(summary("access denied a (b (c:d)")).toBe("Missing scope: b (c:d");
    expect(summary("access denied (a:b")).toBe("Missing scope");
    expect(summary("access denied )(:)")).toBe("Missing scope: :");
  });

  it("stays linear on repeated open-colon input", () => {
    const msg = "access denied " + "(:".repeat(20000);
    const start = performance.now();
    expect(summary(msg)).toBe("Missing scope");
    expect(performance.now() - start).toBeLessThan(200);
  });
});
