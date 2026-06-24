/**
 * Layer 1 — Dynatrace SDK (public surface).
 *
 * A standalone TypeScript client for Dynatrace. This layer has ZERO Raycast
 * and ZERO React imports (enforced by eslint + CI grep) so it could be
 * published later as `@dynatrace-oss/dynatrace-ts-client`.
 *
 * Sub-modules:
 *   - auth/      OAuth client-credentials, token cache, TenantConfig
 *   - http/      single REST transport: timeout, 401-retry, rate-limit,
 *                pagination, classic-proxy resolution, structured errors
 *   - grail/     DQL execution + escapeDqlString
 *   - resources/ one module per resource (Phase 2)
 */
export {
  type TenantConfig,
  OAuthError,
  getAccessToken,
  invalidateTokenCache,
  validateTenantCredentials,
} from "./auth";
export {
  dynatraceRest,
  dynatraceRestPaginated,
  type RestClientOptions,
  type RestResponse,
  RestError,
  ValidationError,
  DavisCopilotUnavailableError,
} from "./http";
export {
  escapeDqlString,
  grailResponseSchema,
  type GrailResponse,
  executeDqlQuery,
  executeDqlQueryValidated,
  type GrailQueryOptions,
} from "./grail";
export { type DynatraceTransport, liveTransport } from "./transport";
