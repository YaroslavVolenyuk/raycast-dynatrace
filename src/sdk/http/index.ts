/**
 * SDK · http — the single REST transport.
 *
 * Every Config/Platform REST call goes through here: timeout, retry-once-on-401,
 * rate-limit handling, pagination (nextPageKey / offset), classic-proxy
 * resolution, and structured errors.
 *
 * Mock mode will return as a swappable MockTransport (per REWRITE_PLAN), not as
 * `if (isMockMode())` branching inside this client.
 */
export {
  dynatraceRest,
  dynatraceRestPaginated,
  type RestClientOptions,
  type RestResponse,
} from "./transport";
export { RestError, ValidationError, DavisCopilotUnavailableError } from "./errors";
