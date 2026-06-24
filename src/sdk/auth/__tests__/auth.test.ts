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

test("validateTenantCredentials maps 401 to a friendly error", async () => {
  mockErrorResponse(401, '{"error":"unauthorized"}');
  const { validateTenantCredentials } = await loadAuth();
  const result = await validateTenantCredentials(TENANT);
  expect(result.valid).toBe(false);
  expect(result.valid === false && result.error).toMatch(/Unauthorized/);
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
