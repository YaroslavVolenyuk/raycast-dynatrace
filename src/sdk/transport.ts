/**
 * Transport seam.
 *
 * Resources talk to Dynatrace through a `DynatraceTransport`, never by importing
 * `executeDqlQuery` / `dynatraceRest` directly. This is the single place where
 * "live vs mock" is decided: the live transport delegates to the real clients,
 * and a MockTransport (src/mocks) can be swapped in without resources knowing.
 *
 * The choice of which transport to use is made in the services/ui layer (it
 * depends on a Raycast preference), keeping this SDK layer Raycast-free.
 */

import type { TenantConfig } from "./auth";
import { executeDqlQuery, type GrailQueryOptions } from "./grail";
import { dynatraceRest, type RestClientOptions, type RestResponse } from "./http";

export interface DynatraceTransport {
  /** Execute a DQL query against Grail and return its records. */
  executeDql<T = Record<string, unknown>>(tenant: TenantConfig, query: string, options?: GrailQueryOptions): Promise<T[]>;
  /** Call a Config/Platform REST endpoint. */
  rest<T = unknown>(tenant: TenantConfig, path: string, options?: RestClientOptions<T>): Promise<RestResponse<T>>;
}

/** The real transport — delegates to the live Grail and REST clients. */
export const liveTransport: DynatraceTransport = {
  executeDql: (tenant, query, options) => executeDqlQuery(tenant, query, options),
  rest: (tenant, path, options) => dynatraceRest(tenant, path, options),
};
