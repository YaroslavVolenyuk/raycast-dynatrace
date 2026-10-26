/** SDK · grail — DQL execution, response schema, escapeDqlString. */
export { escapeDqlString } from "./escape";
export { grailResponseSchema } from "./schema";
export { executeDqlQuery, type GrailQueryOptions } from "./query";
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
