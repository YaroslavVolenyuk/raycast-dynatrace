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
  jest.clearAllMocks();
  // Reset module registry so the in-memory tokenCache is re-created per test.
  jest.resetModules();
});

async function loadAuth() {
  return import("../index");
}

test("getAccessToken returns token on first call", async () => {
  mockTokenResponse("fresh-token", 300);
  const { getAccessToken } = await loadAuth();
  const token = await getAccessToken(TENANT);
  expect(token).toBe("fresh-token");
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

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

test("invalidateTokenCache forces a refetch on next call", async () => {
  mockTokenResponse("token-1", 600);
  mockTokenResponse("token-2", 600);
  const { getAccessToken, invalidateTokenCache } = await loadAuth();
  expect(await getAccessToken(TENANT)).toBe("token-1");
  invalidateTokenCache(TENANT.id);
  expect(await getAccessToken(TENANT)).toBe("token-2");
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("validateTenantCredentials surfaces the SSO error reason (401)", async () => {
  mockErrorResponse(401, '{"error":"unauthorized"}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials(TENANT);
  expect(result.valid).toBe(false);
  expect(result.valid === false && result.error).toMatch(/unauthorized/i);
});

test("validateTenantCredentials hints at scopes on invalid_scope (400)", async () => {
  mockErrorResponse(400, '{"error":"invalid_scope","error_description":"scope storage:foo:read not allowed"}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials(TENANT);
  expect(result.valid === false && result.error).toMatch(/invalid_scope/);
  expect(result.valid === false && result.error).toMatch(/scopes are not granted/);
});

test("validateTenantCredentials hints at credentials on invalid_client (400)", async () => {
  mockErrorResponse(400, '{"error":"invalid_client"}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials(TENANT);
  expect(result.valid === false && result.error).toMatch(/invalid_client/);
  expect(result.valid === false && result.error).toMatch(/Client ID and Secret/);
});

describe("OAuthError — secret redaction", () => {
  it("redacts client_secret from the body", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(400, "client_secret=super-secret&grant_type=client_credentials");
    expect(err.message).not.toContain("super-secret");
    expect(err.message).toContain("[REDACTED]");
    expect(err.statusCode).toBe(400);
  });

  it("redacts multiple client_secret occurrences", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(400, "client_secret=secret1&code=abc&client_secret=secret2");
    expect(err.message).not.toContain("secret1");
    expect(err.message).not.toContain("secret2");
    expect(err.message).toMatch(/\[REDACTED\].*\[REDACTED\]/);
  });

  it("preserves non-secret information", async () => {
    const { OAuthError } = await loadAuth();
    const err = new OAuthError(401, "error=invalid_client&error_description=Client+authentication+failed");
    expect(err.message).toContain("invalid_client");
    expect(err.message).toContain("authentication");
  });
});

// Editing a tenant keeps its id; a cached token must not vouch for new credentials.
test("validateTenantCredentials re-checks after the secret changes", async () => {
  mockTokenResponse("good-token", 600);
  mockErrorResponse(401, '{"error":"invalid_client"}');
  const { getAccessToken, validateTenantCredentials } = await loadAuth();
  await getAccessToken(TENANT);
  const result = await validateTenantCredentials({ ...TENANT, clientSecret: "garbage" });
  expect(result.valid).toBe(false);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

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

// A wrong "SSO endpoint" pointing at a Dynatrace API answers { error: { code, message } }.
test("validateTenantCredentials never shows [object Object] for a nested error body", async () => {
  mockErrorResponse(404, '{"error":{"code":404,"message":"Not Found"}}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials({ ...TENANT, ssoEndpoint: "https://abc.apps.dynatrace.com" });
  expect(result.valid === false && result.error).not.toMatch(/object Object/i);
  expect(result.valid === false && result.error).toMatch(/Not Found/);
  expect(result.valid === false && result.error).toMatch(/not an SSO token endpoint/);
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
