/**
 * Layer 1 — Dynatrace SDK (public surface).
 *
 * A standalone TypeScript client for Dynatrace. This layer has ZERO Raycast
 * and ZERO React imports (enforced by eslint + CI grep) so it could be
 * published later as `@dynatrace-oss/dynatrace-ts-client`.
 *
 * Sub-modules (filled in during Phase 1):
 *   - auth/      OAuth client-credentials, token cache, TenantConfig
 *   - http/      single transport: timeout, 401-retry, rate-limit, pagination,
 *                classic-proxy resolution, structured DynatraceError
 *   - grail/     DQL execution, query builders, escapeDqlString
 *   - resources/ one module per resource (endpoints + zod schemas + normalizers)
 */
export {};
