/**
 * SDK · http — the single transport. (Phase 1)
 *
 * Every network call in the codebase goes through here: timeout, retry-once-on-401,
 * rate-limit, pagination (nextPageKey / offset), classic-proxy resolution,
 * structured DynatraceError. Mock mode is a transport implementation here
 * (MockTransport), not an `if (isMockMode())` sprinkled through commands.
 */
export {};
