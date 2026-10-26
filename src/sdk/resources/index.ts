/**
 * SDK · resources — one module per resource.
 *
 * Each module = raw schema + normalizer (API → domain model) + query builder +
 * a `list*` call through the injected transport. Resources export normalized
 * domain models, never raw API shapes. Every resource ships a fixture under
 * __fixtures__/ with a contract test asserting `schema.parse(fixture)` succeeds.
 */
export {
  logRecordSchema,
  normalizeLog,
  buildLogsQuery,
  listLogs,
  LOG_PAGE_SIZE,
  LOGS_REQUIRED_SCOPES,
  type LogRecord,
  type LogEntry,
  type LogLevel,
  type ListLogsOptions,
} from "./logs";

export {
  spanRecordSchema,
  normalizeSpan,
  buildSpansQuery,
  listSpans,
  formatDuration,
  SPAN_PAGE_SIZE,
  SPANS_REQUIRED_SCOPES,
  type SpanRecord,
  type SpanEntry,
  type SpanStatus,
  type ListSpansOptions,
} from "./spans";

export {
  problemRecordSchema,
  normalizeProblem,
  buildProblemsQuery,
  validateExtraFilter,
  listProblems,
  PROBLEM_PAGE_SIZE,
  PROBLEMS_REQUIRED_SCOPES,
  type ProblemRecord,
  type ProblemEntry,
  type ListProblemsOptions,
} from "./problems";

export {
  runDql,
  collectColumns,
  DQL_DEFAULT_LIMIT,
  DQL_REQUIRED_SCOPES,
  type DqlResult,
  type RunDqlOptions,
} from "./dql";
