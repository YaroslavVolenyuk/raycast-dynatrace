/** mocks — MockTransport + a factory pre-loaded with resource fixtures. */
import { MockTransport } from "./transport";
import logsSearchFixture from "../sdk/resources/__fixtures__/logs.search.json";

export { MockTransport } from "./transport";

/**
 * Builds a MockTransport pre-loaded with every resource's sample fixture.
 * As resources are migrated, register their fixtures here so mock mode covers
 * the whole app from one place.
 */
export function createMockTransport(): MockTransport {
  return new MockTransport().registerDql((q) => q.includes("fetch logs"), logsSearchFixture);
}
