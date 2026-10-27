/**
 * Layer 1 — Dynatrace SDK (public surface).
 *
 * A standalone TypeScript client for Dynatrace. This layer has ZERO Raycast
 * and ZERO React imports (enforced by eslint + CI grep) so it could be
 * published later as `@dynatrace-oss/dynatrace-ts-client`.
 *
 * Sub-modules:
 *   - auth/      OAuth client-credentials or platform token, token cache, TenantConfig
 *   - grail/     DQL execution, verify/autocomplete, escapeDqlString
 *   - resources/ one module per resource (logs, spans)
 */
export {
  type TenantConfig,
  OAuthError,
  getAccessToken,
  invalidateTokenCache,
  validateTenantCredentials,
  findMissingScopes,
  credentialsKind,
  credentialsFingerprint,
} from "./auth";
export {
  escapeDqlString,
  grailResponseSchema,
  executeDqlQuery,
  cancelGrailQuery,
  type GrailNotification,
  testTenantConnection,
  type GrailQueryOptions,
  type ConnectionTestResult,
  verifyDql,
  autocompleteDql,
  applySuggestion,
  type DqlIssue,
  type DqlVerification,
  type DqlSuggestion,
  type DqlCompletion,
} from "./grail";
export { type DynatraceTransport, liveTransport } from "./transport";
export * from "./resources";
