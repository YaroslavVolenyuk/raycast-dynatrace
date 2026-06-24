/**
 * MockTransport — a DynatraceTransport backed by registered fixtures.
 *
 * Mock mode is implemented here, as a swappable transport, rather than via
 * `if (isMockMode())` branches in resources or commands. Resources receive a
 * transport and cannot tell whether it is live or mock.
 *
 * Fixtures are registered by matcher (DQL query predicate / REST path predicate)
 * so a single transport can serve many resources. An unmatched call throws, so
 * a missing fixture is loud during development instead of silently returning [].
 */

import type { TenantConfig } from "../sdk/auth";
import type { DynatraceTransport, RestResponse } from "../sdk";

type DqlMatcher = (query: string) => boolean;
type RestMatcher = (path: string) => boolean;

interface DqlFixture {
  match: DqlMatcher;
  records: unknown[];
}

interface RestFixture {
  match: RestMatcher;
  data: unknown;
  status: number;
}

export class MockTransport implements DynatraceTransport {
  private dqlFixtures: DqlFixture[] = [];
  private restFixtures: RestFixture[] = [];

  /** Register records returned for any DQL query the matcher accepts. */
  registerDql(match: DqlMatcher, records: unknown[]): this {
    this.dqlFixtures.push({ match, records });
    return this;
  }

  /** Register a body returned for any REST path the matcher accepts. */
  registerRest(match: RestMatcher, data: unknown, status = 200): this {
    this.restFixtures.push({ match, data, status });
    return this;
  }

  async executeDql<T = Record<string, unknown>>(_tenant: TenantConfig, query: string): Promise<T[]> {
    const fixture = this.dqlFixtures.find((f) => f.match(query));
    if (!fixture) {
      throw new Error(`MockTransport: no DQL fixture registered for query:\n${query.slice(0, 120)}`);
    }
    return fixture.records as T[];
  }

  async rest<T = unknown>(_tenant: TenantConfig, path: string): Promise<RestResponse<T>> {
    const fixture = this.restFixtures.find((f) => f.match(path));
    if (!fixture) {
      throw new Error(`MockTransport: no REST fixture registered for path: ${path}`);
    }
    return {
      data: fixture.data as T,
      status: fixture.status,
      headers: new Headers({ "content-type": "application/json" }),
    };
  }
}
