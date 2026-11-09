// Unit tests for the OAuth 2.0 token service (sdk/auth).

import type { TenantConfig } from "../index";

const TENANT: TenantConfig = {
  id: "test-tenant",
  name: "Test",
  tenantEndpoint: "https://test.live.dynatrace.com",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["storage:logs:read"],
};

// Exact user-facing OAuth messages are pinned in the "message for" table only.

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function mockTokenResponse(access_token = "test-token", expires_in = 300) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ access_token, expires_in }),
  });
}

function mockErrorResponse(status: number, body: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

beforeEach(() => {
  jest.resetAllMocks(); // also drops queued mockResolvedValueOnce values, so a failing test cannot leak into the next
  jest.restoreAllMocks(); // the real Date.now after the expiry test
  // Reset module registry so the in-memory tokenCache is re-created per test.
  jest.resetModules();
});

async function loadAuth() {
  return import("../index");
}

test("getAccessToken uses cache on second call — fetch called only once", async () => {
  mockTokenResponse("cached-token", 600);
  const { getAccessToken } = await loadAuth();
  const token1 = await getAccessToken(TENANT);
  const token2 = await getAccessToken(TENANT);
  expect(token1).toBe("cached-token");
  expect(token2).toBe("cached-token");
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("getAccessToken throws OAuthError on non-OK response", async () => {
  mockErrorResponse(401, '{"error":"unauthorized"}');
  const { getAccessToken, OAuthError } = await loadAuth();
  await expect(getAccessToken(TENANT)).rejects.toThrow(OAuthError);
});

// Tokens live about 5 minutes; one is renewed 30 s before it expires so a query never starts with a dying token.
test("getAccessToken reuses a token until 30 s before it expires, then fetches a new one", async () => {
  let now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mockTokenResponse("token-1", 300);
  mockTokenResponse("token-2", 300);
  const { getAccessToken } = await loadAuth();
  expect(await getAccessToken(TENANT)).toBe("token-1");
  now += 269_000;
  expect(await getAccessToken(TENANT)).toBe("token-1");
  now += 2_000; // 29 s left
  expect(await getAccessToken(TENANT)).toBe("token-2");
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("invalidateTokenCache forces a refetch on next call", async () => {
  mockTokenResponse("token-1", 600);
  mockTokenResponse("token-2", 600);
  const { getAccessToken, invalidateTokenCache } = await loadAuth();
  expect(await getAccessToken(TENANT)).toBe("token-1");
  invalidateTokenCache(TENANT.id);
  expect(await getAccessToken(TENANT)).toBe("token-2");
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

describe("OAuthError — secret redaction", () => {
  it("redacts client_secret from the body", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(400, "client_secret=super-secret&grant_type=client_credentials");
    expect(err.message).not.toContain("super-secret");
    expect(err.message).toContain("[REDACTED]");
    expect(err.statusCode).toBe(400);
    // the UI message is built from the body
    expect(err.body).not.toContain("super-secret");
  });

  it("redacts multiple client_secret occurrences", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(400, "client_secret=secret1&code=abc&client_secret=secret2");
    expect(err.message).not.toContain("secret1");
    expect(err.message).not.toContain("secret2");
    expect(err.message).toMatch(/\[REDACTED\].*\[REDACTED\]/);
  });

  it("keeps an echoed secret out of the connection-test message", async () => {
    // An SSO or proxy error page that echoes the (decoded) request back.
    mockErrorResponse(400, `Bad request: client_id=x client_secret=${TENANT.clientSecret} scope=a`);
    const { validateTenantCredentials } = await loadAuth();
    const result = await validateTenantCredentials(TENANT);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).not.toContain(TENANT.clientSecret);
  });

  it("keeps a secret quoted without its key out of the message", async () => {
    mockErrorResponse(
      400,
      JSON.stringify({ error: "invalid_client", error_description: `bad: ${TENANT.clientSecret}` }),
    );
    const { validateTenantCredentials } = await loadAuth();
    const result = await validateTenantCredentials(TENANT);
    expect(result.valid === false && result.error).not.toContain(TENANT.clientSecret);
    expect(result.valid === false && result.error).toContain("invalid_client");
  });

  it("preserves non-secret information", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(401, "error=invalid_client&error_description=Client+authentication+failed");
    expect(err.message).toContain("invalid_client");
    expect(err.message).toContain("authentication");
  });
});

// A cached token must not vouch for the credentials: editing a tenant keeps its id,
// and the OAuth client may have been deleted meanwhile.
test("validateTenantCredentials does not trust a cached token for unchanged credentials", async () => {
  mockTokenResponse("token-1", 600);
  mockErrorResponse(401, '{"error":"invalid_client"}');
  const { getAccessToken, validateTenantCredentials } = await loadAuth();
  await getAccessToken(TENANT);
  // e.g. the OAuth client was deleted in Account Management meanwhile
  expect((await validateTenantCredentials(TENANT)).valid).toBe(false);
});

test("getAccessToken fetches a new token when credentials change under the same id", async () => {
  mockTokenResponse("token-a", 600);
  mockTokenResponse("token-b", 600);
  const { getAccessToken } = await loadAuth();
  expect(await getAccessToken(TENANT)).toBe("token-a");
  expect(await getAccessToken({ ...TENANT, clientSecret: "other" })).toBe("token-b");
});

// On 307/308 fetch would re-send the form body (client secret included) to the Location host.
test("the token request never follows a redirect", async () => {
  mockTokenResponse();
  const { getAccessToken } = await loadAuth();
  await getAccessToken(TENANT);
  expect(mockFetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
});

// Real fetch rejects a pending body read with AbortError when its signal aborts.
test("the SSO timeout also covers a body that stalls after the headers", async () => {
  jest.useFakeTimers();
  mockFetch.mockImplementationOnce(async (_url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    text: () =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        ),
      ),
  }));
  const { getAccessToken, OAuthError } = await loadAuth();
  const result = getAccessToken(TENANT).catch((e: unknown) => e);
  await jest.advanceTimersByTimeAsync(15_000);
  expect(await result).toBeInstanceOf(OAuthError);
  jest.useRealTimers();
});

test("validateTenantCredentials explains a refused SSO redirect", async () => {
  mockFetch.mockRejectedValueOnce(
    Object.assign(new TypeError("fetch failed"), { cause: new Error("unexpected redirect") }),
  );
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials(TENANT);
  expect(result.valid === false && result.error).toMatch(/redirect/);
  expect(result.valid === false && result.error).not.toMatch(/Cannot reach/);
});

// A wrong "SSO endpoint" pointing at a Dynatrace API answers { error: { code, message } }.
test("validateTenantCredentials never shows [object Object] for a nested error body", async () => {
  mockErrorResponse(404, '{"error":{"code":404,"message":"Not Found"}}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials({ ...TENANT, ssoEndpoint: "https://abc.apps.dynatrace.com" });
  expect(result.valid === false && result.error).not.toMatch(/object Object/i);
  expect(result.valid === false && result.error).toMatch(/Not Found/);
  expect(result.valid === false && result.error).toMatch(/not an SSO token endpoint/);
});

test.each([
  [400, "", "Invalid client credentials"],
  [400, '{"error":"invalid_client"}', "invalid_client — check the Client ID and Secret"],
  [
    400,
    '{"error":"invalid_scope","error_description":"invalid_client"}',
    "invalid_scope: invalid_client — one or more scopes are not granted to this OAuth client; remove the unsupported scopes",
  ],
  [
    400,
    '{"error":"invalid_request"}',
    "invalid_request — malformed token request; check Client ID, Secret, and SSO endpoint",
  ],
  [401, "plain text", "plain text"],
  [403, "", "Forbidden — check scopes and permissions"],
  [403, '{"error":"access_denied"}', "Forbidden: access_denied"],
  [500, "", "OAuth error 500"],
  [500, "boom", "OAuth 500: boom"],
  [
    502,
    "<html>bad</html>",
    "OAuth 502: <html>bad</html> — this is not an SSO token endpoint; leave SSO Token Endpoint blank to use the one that belongs to the Environment URL",
  ],
])("validateTenantCredentials message for %i with body %j", async (status, body, expected) => {
  mockErrorResponse(status, body);
  const { validateTenantCredentials } = await loadAuth();
  expect(await validateTenantCredentials(TENANT)).toEqual({ valid: false, error: expected });
});

describe("platform token", () => {
  const TOKEN_TENANT: TenantConfig = { ...TENANT, platformToken: "dt0s16.ABC.SECRET", scopes: [] };

  test("getAccessToken returns the token without asking the SSO", async () => {
    const { getAccessToken } = await loadAuth();
    expect(await getAccessToken(TOKEN_TENANT)).toBe("dt0s16.ABC.SECRET");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("validateTenantCredentials leaves the check to the environment", async () => {
    const { validateTenantCredentials } = await loadAuth();
    expect(await validateTenantCredentials(TOKEN_TENANT)).toEqual({ valid: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("findMissingScopes checks the scopes declared for the token", async () => {
    const { findMissingScopes } = await loadAuth();
    expect(findMissingScopes({ ...TOKEN_TENANT, scopes: ["storage:logs:read"] }, ["storage:logs:read"])).toEqual([]);
    expect(findMissingScopes(TOKEN_TENANT, ["storage:spans:read"])).toEqual(["storage:spans:read"]);
  });

  test("credentialsFingerprint changes with the token, never contains it", async () => {
    const { credentialsFingerprint } = await loadAuth();
    const a = credentialsFingerprint(TOKEN_TENANT);
    expect(a).not.toContain("SECRET");
    expect(credentialsFingerprint({ ...TOKEN_TENANT, platformToken: "dt0s16.OTHER" })).not.toBe(a);
  });
});
