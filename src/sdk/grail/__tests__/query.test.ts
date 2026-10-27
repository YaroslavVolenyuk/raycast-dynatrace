// Tests for executeDqlQuery in src/sdk/grail/query.ts.
//
// Strategy: mock fetch globally and mock ../../auth so we can control token
// responses. OAuthError is kept real (via requireActual) because query.ts checks
// `instanceof OAuthError`.

import type { TenantConfig } from "../../auth";

jest.mock("../../auth", () => {
  const actual = jest.requireActual<typeof import("../../auth")>("../../auth");
  return {
    ...actual,
    getAccessToken: jest.fn(),
    invalidateTokenCache: jest.fn(),
  };
});

import { executeDqlQuery } from "../query";
import { getAccessToken, invalidateTokenCache, OAuthError } from "../../auth";

const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const mockInvalidateTokenCache = invalidateTokenCache as jest.MockedFunction<typeof invalidateTokenCache>;

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const TENANT: TenantConfig = {
  id: "t1",
  name: "Test Tenant",
  tenantEndpoint: "https://test.live.dynatrace.com",
  clientId: "dt0s02.CLIENT",
  clientSecret: "dt0s02.CLIENT.SECRET",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["storage:logs:read"],
};

function grailOk(records: Record<string, unknown>[], state = "SUCCEEDED") {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ state, result: { records } }),
  };
}

function grailError(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: false, status, text: async () => text };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("access-token");
});

describe("happy path", () => {
  it("returns records on success", async () => {
    const records = [{ timestamp: "2026-01-01T00:00:00Z", content: "hello" }];
    mockFetch.mockResolvedValueOnce(grailOk(records));

    const result = await executeDqlQuery(TENANT, "fetch logs");
    expect(result).toEqual(records);
  });

  it("returns [] when result is absent (no result field in response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ state: "SUCCEEDED" }),
    });

    expect(await executeDqlQuery(TENANT, "fetch logs")).toEqual([]);
  });

  it("sends Authorization header with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce(grailOk([]));

    await executeDqlQuery(TENANT, "fetch logs");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer access-token");
  });

  it("forwards timeframe to payload", async () => {
    mockFetch.mockResolvedValueOnce(grailOk([]));
    const timeframe = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z" };

    await executeDqlQuery(TENANT, "fetch logs", { timeframe });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.defaultTimeframeStart).toBe(timeframe.start);
    expect(body.defaultTimeframeEnd).toBe(timeframe.end);
  });

  it("forwards maxResultRecords to payload when provided", async () => {
    mockFetch.mockResolvedValueOnce(grailOk([]));

    await executeDqlQuery(TENANT, "fetch logs", { maxResultRecords: 100 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.maxResultRecords).toBe(100);
  });
});

describe("401 retry", () => {
  it("invalidates token cache and retries once on first 401", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "unauthorized" })
      .mockResolvedValueOnce(grailOk([{ id: "r1" }]));

    const result = await executeDqlQuery(TENANT, "fetch logs");

    expect(mockInvalidateTokenCache).toHaveBeenCalledWith(TENANT.id);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: "r1" }]);
  });

  it("throws auth error on second consecutive 401 (no infinite retry)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("Authentication failed");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("HTTP error responses", () => {
  it("throws scopes error on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "forbidden" });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("missing required scopes");
  });

  it("names the caller's required scopes in the 403 message", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "forbidden" });

    await expect(executeDqlQuery(TENANT, "fetch logs", { requiredScopes: ["storage:logs:read"] })).rejects.toThrow(
      "(storage:logs:read)",
    );
  });

  it("names the platform token on 403 for a token tenant", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "forbidden" });

    await expect(executeDqlQuery({ ...TENANT, platformToken: "dt0s16.X" }, "fetch logs")).rejects.toThrow(
      /platform token is missing required scopes.*Manage Tenants/,
    );
  });

  it("does not retry a 401 for a platform token: the same token would be sent again", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" });

    await expect(executeDqlQuery({ ...TENANT, platformToken: "dt0s16.X" }, "fetch logs")).rejects.toThrow(
      /platform token was rejected/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses error.message from JSON body on non-ok", async () => {
    const body = { error: { code: 400, message: "Invalid DQL syntax at position 5" } };
    mockFetch.mockResolvedValueOnce(grailError(400, body));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("Invalid DQL syntax at position 5");
  });

  it("falls back to HTTP status line for non-ok plain text body", async () => {
    mockFetch.mockResolvedValueOnce(grailError(500, "Internal Server Error"));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("HTTP 500");
  });

  it("detects HTML body on non-ok and suggests checking the endpoint URL", async () => {
    mockFetch.mockResolvedValueOnce(grailError(502, "<html><body>Bad Gateway</body></html>"));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("Check your tenant endpoint URL");
  });
});

describe("response body errors", () => {
  it("throws when 200 response body is HTML (e.g. login redirect)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "<html>Login</html>",
    });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("HTML page instead of JSON");
  });

  it("throws when state is RUNNING but no requestToken is returned", async () => {
    mockFetch.mockResolvedValueOnce(grailOk([], "RUNNING"));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("no request token");
  });

  it("throws with the Grail error message when state is FAILED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ state: "FAILED", error: { code: 400, message: "bad query" } }),
    });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("bad query");
  });

  it("throws with field names on Zod schema mismatch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ notState: "bad" }),
    });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("Unexpected Grail response format");
  });
});

describe("long-running query polling", () => {
  function grailRunning(token: string) {
    return {
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ state: "RUNNING", requestToken: token, progress: 10 }),
    };
  }

  it("polls query:poll with the URL-encoded request token until SUCCEEDED", async () => {
    const records = [{ content: "late result" }];
    mockFetch
      .mockResolvedValueOnce(grailRunning("tok+en=")) // execute → RUNNING
      .mockResolvedValueOnce(grailRunning("tok+en=")) // poll 1 → still RUNNING
      .mockResolvedValueOnce(grailOk(records)); // poll 2 → SUCCEEDED

    const result = await executeDqlQuery(TENANT, "fetch logs");
    expect(result).toEqual(records);

    const pollUrl = mockFetch.mock.calls[1][0] as string;
    expect(pollUrl).toContain("/platform/storage/query/v1/query:poll");
    expect(pollUrl).toContain(`request-token=${encodeURIComponent("tok+en=")}`);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: "GET" });
  });

  it("gives up when the poll deadline expires", async () => {
    mockFetch.mockResolvedValue(grailRunning("tok"));

    await expect(executeDqlQuery(TENANT, "fetch logs", { pollDeadlineMs: 0 })).rejects.toThrow(
      "did not finish in time",
    );
  });

  it("surfaces poll HTTP errors with status", async () => {
    mockFetch
      .mockResolvedValueOnce(grailRunning("tok"))
      .mockResolvedValueOnce({ ok: false, status: 410, text: async () => "gone" });

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("HTTP 410 while polling");
  });

  /** Lets the fire-and-forget cancel request reach fetch. */
  const flush = () => new Promise((r) => setImmediate(r));
  const cancelCalls = () =>
    mockFetch.mock.calls.filter(([url]) => String(url).includes("/platform/storage/query/v1/query:cancel"));

  it("cancels the query server-side when the deadline expires", async () => {
    mockFetch.mockResolvedValue(grailRunning("tok+en="));

    await expect(executeDqlQuery(TENANT, "fetch logs", { pollDeadlineMs: 0 })).rejects.toThrow();
    await flush();

    expect(cancelCalls()).toHaveLength(1);
    const [url, init] = cancelCalls()[0];
    expect(url).toContain(`request-token=${encodeURIComponent("tok+en=")}`);
    expect(init).toMatchObject({ method: "POST" });
  });

  it("cancels the query server-side when the caller aborts while polling", async () => {
    const ctrl = new AbortController();
    mockFetch.mockResolvedValueOnce(grailRunning("tok")).mockImplementationOnce(async () => {
      ctrl.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });

    await expect(executeDqlQuery(TENANT, "fetch logs", { signal: ctrl.signal })).rejects.toThrow("aborted");
    await flush();

    expect(cancelCalls()).toHaveLength(1);
  });

  it("does not cancel a query that finished", async () => {
    mockFetch.mockResolvedValueOnce(grailRunning("tok")).mockResolvedValueOnce(grailOk([]));

    await executeDqlQuery(TENANT, "fetch logs");
    await flush();

    expect(cancelCalls()).toHaveLength(0);
  });

  it("swallows errors from the cancel request", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("query:cancel")) throw new Error("offline");
      return grailRunning("tok");
    });

    await expect(executeDqlQuery(TENANT, "fetch logs", { pollDeadlineMs: 0 })).rejects.toThrow("did not finish");
    await flush();
  });
});

describe("result notifications", () => {
  it("passes Grail notifications to onNotifications", async () => {
    const notifications = [{ severity: "WARNING", notificationType: "RESULT_TRUNCATED", message: "Result truncated" }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ state: "SUCCEEDED", result: { records: [], metadata: { grail: { notifications } } } }),
    });
    const onNotifications = jest.fn();

    await executeDqlQuery(TENANT, "fetch logs", { onNotifications });

    expect(onNotifications).toHaveBeenCalledWith([expect.objectContaining(notifications[0])]);
  });

  it("ignores metadata in an unexpected shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ state: "SUCCEEDED", result: { records: [{ a: 1 }], metadata: "weird" } }),
    });
    const onNotifications = jest.fn();

    expect(await executeDqlQuery(TENANT, "fetch logs", { onNotifications })).toEqual([{ a: 1 }]);
    expect(onNotifications).not.toHaveBeenCalled();
  });
});

describe("auth errors from getAccessToken", () => {
  it("wraps OAuthError in a user-friendly message", async () => {
    mockGetAccessToken.mockRejectedValueOnce(new OAuthError(401, "invalid_client"));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("OAuth error: check client_id / client_secret");
  });

  it("re-throws non-OAuth errors as-is", async () => {
    mockGetAccessToken.mockRejectedValueOnce(new Error("Network failure"));

    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow("Network failure");
  });
});

describe("timeout and abort", () => {
  it("throws timeout error when fetch takes longer than timeoutMs", async () => {
    mockFetch.mockImplementation((_url: unknown, opts: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = opts.signal as AbortSignal | undefined;
        const abort = () => reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    });

    await expect(executeDqlQuery(TENANT, "fetch logs", { timeoutMs: 50 })).rejects.toThrow("not responding");
  }, 5000);

  it("re-throws AbortError when cancelled by caller (not a timeout)", async () => {
    const userCtrl = new AbortController();

    mockFetch.mockImplementation(() => {
      userCtrl.abort();
      return Promise.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
    });

    await expect(
      executeDqlQuery(TENANT, "fetch logs", { signal: userCtrl.signal, timeoutMs: 30_000 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("network failures", () => {
  it("names a non-existent environment host", async () => {
    mockGetAccessToken.mockResolvedValueOnce("token");
    mockFetch.mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow(
      "Environment URL not found: test.live.dynatrace.com",
    );
  });

  it("reports an unreachable SSO as a network problem", async () => {
    mockGetAccessToken.mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }),
    );
    await expect(executeDqlQuery(TENANT, "fetch logs")).rejects.toThrow(
      "Cannot reach the SSO endpoint sso.dynatrace.com",
    );
  });
});
