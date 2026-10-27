/** SDK · grail — DQL execution, response schema, escapeDqlString. */
export { escapeDqlString } from "./escape";
export { grailResponseSchema, type GrailNotification } from "./schema";
export { executeDqlQuery, cancelGrailQuery, type GrailQueryOptions } from "./query";
export { testTenantConnection, type ConnectionTestResult } from "./verify";
export {
  verifyDql,
  autocompleteDql,
  applySuggestion,
  normalizeVerification,
  normalizeCompletion,
  type DqlIssue,
  type DqlVerification,
  type DqlSuggestion,
  type DqlCompletion,
} from "./assist";
