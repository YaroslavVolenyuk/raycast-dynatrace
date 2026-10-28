// Contract tests for query:verify / query:autocomplete against captured live
// responses, plus the HTTP behaviour shared with executeDqlQuery.

import { OAuthError, type TenantConfig } from "../../auth";

jest.mock("../../auth", () => {
  const actual = jest.requireActual<typeof import("../../auth")>("../../auth");
  return { ...actual, getAccessToken: jest.fn(), invalidateTokenCache: jest.fn() };
});

import { applySuggestion, autocompleteDql, normalizeCompletion, normalizeVerification, verifyDql } from "../assist";
import { getAccessToken, invalidateTokenCache } from "../../auth";
import fixture from "../__fixtures__/assist.json";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const TENANT = {
  id: "t1",
  tenantEndpoint: "https://abc.apps.dynatrace.com/",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
} as TenantConfig;

const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  (getAccessToken as jest.Mock).mockResolvedValue("token");
});

describe("normalizeVerification", () => {
  it("accepts a valid query", () => {
    expect(normalizeVerification(fixture.verifyValid)).toEqual({ valid: true, issues: [] });
  });

  it("keeps Grail's 1-based line and column", () => {
    const v = normalizeVerification(fixture.verifyInvalid);
    expect(v.valid).toBe(false);
    expect(v.issues[0]).toEqual({ severity: "ERROR", message: "There's no command `filtr`.", line: 2, column: 3 });
  });
});

describe("normalizeCompletion", () => {
  it("maps command suggestions with what they replace", () => {
    const c = normalizeCompletion(fixture.autocompleteCommand);
    expect(c.suggestions[0]).toMatchObject({ text: "fields ", replaceChars: 2, kind: "COMMAND_NAME", label: "fields" });
    expect(c.suggestions[0].synopsis).toContain("fields");
  });

  it("drops empty placeholders and extracts the command synopsis", () => {
    const c = normalizeCompletion(fixture.autocompleteFilter);
    expect(c.suggestions.every((s) => s.text.trim() !== "")).toBe(true);
    expect(c.context?.synopsis).toBe("filter condition");
    expect(c.suggestions.find((s) => s.text === "timestamp")).toMatchObject({
      kind: "FIELD_NAME",
      dataType: "timestamp",
    });
    expect(c.suggestions.find((s) => s.text === "abs(")).toMatchObject({ kind: "FUNCTION_NAME", label: "abs" });
  });

  it("suggests start commands for an empty query", () => {
    expect(normalizeCompletion(fixture.autocompleteEmpty).suggestions.map((s) => s.label)).toContain("fetch");
  });
});

describe("applySuggestion", () => {
  it("replaces the already typed characters", () => {
    expect(applySuggestion("fetch logs | fi", { text: "filter ", replaceChars: 2 })).toBe("fetch logs | filter ");
  });
  it("inserts at a cursor in the middle", () => {
    expect(applySuggestion("fetch | limit 1", { text: "logs ", replaceChars: 0 }, 6)).toBe("fetch logs | limit 1");
  });
});

describe("HTTP", () => {
  it("posts the query and cursor to query:autocomplete", async () => {
    mockFetch.mockResolvedValueOnce(ok(fixture.autocompleteCommand));
    await autocompleteDql(TENANT, "fetch logs | fi");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://abc.apps.dynatrace.com/platform/storage/query/v1/query:autocomplete");
    expect(JSON.parse(init.body)).toMatchObject({ query: "fetch logs | fi", cursorPosition: 15 });
  });

  it("retries once with a fresh token on 401", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" })
      .mockResolvedValueOnce(ok(fixture.verifyValid));
    await expect(verifyDql(TENANT, "fetch logs")).resolves.toMatchObject({ valid: true });
    expect(invalidateTokenCache).toHaveBeenCalledWith("t1");
  });

  it("surfaces the Dynatrace error message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 403, message: "missing scope" } }),
    });
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("Dynatrace: missing scope");
  });

  it("falls back to the status line when the error body is not JSON", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "<html>" });
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("HTTP 500 from query:verify");
  });

  it("falls back to the status line when the JSON body has no message", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => JSON.stringify({ error: {} }) });
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("HTTP 400 from query:verify");
  });

  it("retries a 401 only once", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "" });
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("HTTP 401 from query:verify");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(invalidateTokenCache).toHaveBeenCalledTimes(1);
  });

  it("maps an OAuth rejection to a credentials hint", async () => {
    (getAccessToken as jest.Mock).mockRejectedValueOnce(new OAuthError(401, "bad"));
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow(
      "OAuth error: check client_id / client_secret in Manage Tenants (401)",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps an SSO network failure", async () => {
    (getAccessToken as jest.Mock).mockRejectedValueOnce(
      new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    );
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow(
      "Cannot reach the SSO endpoint sso.dynatrace.com (ECONNREFUSED). Check your network.",
    );
  });

  it("rethrows other token errors unchanged", async () => {
    const boom = new Error("boom");
    (getAccessToken as jest.Mock).mockRejectedValueOnce(boom);
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toBe(boom);
  });

  it("maps an environment network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }));
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("Environment URL not found: abc.apps.dynatrace.com");
  });

  it("reports a timeout when the request is aborted by the internal timer", async () => {
    const expired = new AbortController();
    expired.abort();
    const spy = jest.spyOn(AbortSignal, "timeout").mockReturnValueOnce(expired.signal);
    mockFetch.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(verifyDql(TENANT, "fetch logs")).rejects.toThrow("Dynatrace is not responding (10s timeout)");
    spy.mockRestore();
  });

  it("rethrows the caller's abort", async () => {
    const ctrl = new AbortController();
    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const p = verifyDql(TENANT, "fetch logs", { signal: ctrl.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((r) => setImmediate(r));
    ctrl.abort();
    await assertion;
  });
});
