/**
 * Transport seam.
 *
 * Resources talk to Dynatrace through a `DynatraceTransport`, never by importing
 * `executeDqlQuery` directly. This keeps resources decoupled from the concrete
 * Grail client implementation.
 */

import type { TenantConfig } from "./auth";
import { executeDqlQuery, type GrailQueryOptions } from "./grail";

export interface DynatraceTransport {
  /** Execute a DQL query against Grail and return its records. */
  executeDql<T = Record<string, unknown>>(
    tenant: TenantConfig,
    query: string,
    options?: GrailQueryOptions,
  ): Promise<T[]>;
}

/** The real transport — delegates to the live Grail client. */
export const liveTransport: DynatraceTransport = {
  executeDql: (tenant, query, options) => executeDqlQuery(tenant, query, options),
};
