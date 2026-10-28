// Tests for testTenantConnection: the environment is checked, not only the SSO.

import type { TenantConfig } from "../../auth";

jest.mock("../../auth", () => {
  const actual = jest.requireActual<typeof import("../../auth")>("../../auth");
  return {
    ...actual,
    getAccessToken: jest.fn().mockResolvedValue("token"),
    validateTenantCredentials: jest.fn().mockResolvedValue({ valid: true }),
  };
});

import { testTenantConnection } from "../verify";
import { validateTenantCredentials } from "../../auth";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const TENANT: TenantConfig = {
  id: "t1",
  name: "Test",
  tenantEndpoint: "https://abc12345.dev.apps.dynatracelabs.ua",
  clientId: "dt0s02.CLIENT",
  clientSecret: "dt0s02.CLIENT.SECRET",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["storage:logs:read"],
};

const respond = (status: number, body: string) => ({ ok: status < 400, status, text: async () => body });
const dnsFailure = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });

beforeEach(() => mockFetch.mockReset());

it("fails when the environment host does not exist, although the SSO answered", async () => {
  mockFetch.mockRejectedValueOnce(dnsFailure());
  const r = await testTenantConnection(TENANT);
  expect(r.valid).toBe(false);
  expect(r.valid === false && r.error).toMatch(/Environment URL not found: abc12345\.dev\.apps\.dynatracelabs\.ua/);
});

it("fails on an HTML page instead of the platform API", async () => {
  mockFetch.mockResolvedValueOnce(respond(200, "<html>login</html>"));
  const r = await testTenantConnection(TENANT);
  expect(r.valid === false && r.error).toMatch(/does not look like a Dynatrace platform environment/);
});

it("fails on 404", async () => {
  mockFetch.mockResolvedValueOnce(respond(404, '{"error":"not found"}'));
  expect((await testTenantConnection(TENANT)).valid).toBe(false);
});

it("fails when the environment rejects the token", async () => {
  mockFetch.mockResolvedValueOnce(respond(401, "{}"));
  const r = await testTenantConnection(TENANT);
  expect(r.valid === false && r.error).toMatch(/rejected the token/);
});

it("passes when the environment verifies the query", async () => {
  mockFetch.mockResolvedValueOnce(respond(200, '{"valid":true}'));
  expect(await testTenantConnection(TENANT)).toEqual({ valid: true });
  expect(mockFetch.mock.calls[0][0]).toContain("/platform/storage/query/v1/query:verify");
});

it("reports a 403 as reachable but access denied, not as a plain success", async () => {
  mockFetch.mockResolvedValueOnce(respond(403, '{"error":{"code":403}}'));
  expect(await testTenantConnection(TENANT)).toEqual({ valid: true, accessDenied: true });
});

it("names the platform token when the environment rejects it", async () => {
  mockFetch.mockResolvedValueOnce(respond(401, ""));
  const result = await testTenantConnection({ ...TENANT, platformToken: "dt0s16.X" });
  expect(result.valid === false && result.error).toMatch(/rejected the platform token/);
});

it("does not call the environment when the credentials are wrong", async () => {
  (validateTenantCredentials as jest.Mock).mockResolvedValueOnce({ valid: false, error: "invalid_client" });
  expect(await testTenantConnection(TENANT)).toEqual({ valid: false, error: "invalid_client" });
  expect(mockFetch).not.toHaveBeenCalled();
});

it("reports a timeout when the request is aborted", async () => {
  mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
  expect(await testTenantConnection(TENANT)).toEqual({
    valid: false,
    error: "Environment is not responding (15s timeout) — check the Environment URL",
  });
});

it("passes through other error messages, stringifying non-errors", async () => {
  mockFetch.mockRejectedValueOnce(new Error("boom"));
  expect(await testTenantConnection(TENANT)).toEqual({ valid: false, error: "boom" });
  mockFetch.mockRejectedValueOnce("plain");
  expect(await testTenantConnection(TENANT)).toEqual({ valid: false, error: "plain" });
});
