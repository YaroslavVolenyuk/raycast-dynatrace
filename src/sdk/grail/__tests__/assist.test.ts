// Contract tests for query:verify / query:autocomplete against captured live
// responses, plus the HTTP behaviour shared with executeDqlQuery.

import type { TenantConfig } from "../../auth";

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
});
