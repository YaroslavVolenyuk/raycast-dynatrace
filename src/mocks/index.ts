/** mocks — MockTransport + a factory pre-loaded with resource fixtures. */
import { MockTransport } from "./transport";
import type { TenantConfig } from "../sdk/auth";
import logsSearchFixture from "../sdk/resources/__fixtures__/logs.search.json";

export { MockTransport } from "./transport";

/**
 * A placeholder tenant for mock mode. The MockTransport ignores tenant fields,
 * so commands can run end-to-end (no real OAuth tenant needed) when the
 * `useMockData` preference is on. Never used for real network calls.
 */
export const MOCK_TENANT: TenantConfig = {
  id: "mock",
  name: "Mock Tenant",
  tenantEndpoint: "https://mock.dynatrace.local",
  clientId: "mock",
  clientSecret: "mock",
  ssoEndpoint: "https://mock.sso.local",
  scopes: ["mock"],
};

/**
 * Builds a MockTransport pre-loaded with every resource's sample fixture.
 * As resources are migrated, register their fixtures here so mock mode covers
 * the whole app from one place.
 */
export function createMockTransport(): MockTransport {
  return new MockTransport().registerDql((q) => q.includes("fetch logs"), logsSearchFixture);
}
