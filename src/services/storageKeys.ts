// Central registry of all LocalStorage keys used by this extension.
// Never use string literals for storage keys outside this file.

export const StorageKeys = {
  // Tenant management
  tenants: "tenants:v1",
  tenantsActive: "tenants:active",

  // Saved queries
  savedQueries: "saved-queries:v1",

  // Alerts / background polling
  lastProblemCount: (tenantId: string) => `dt_last_problem_count:${tenantId}`,
  alertsLastSuccess: "alerts:last-success",
  alertsLastRunStart: "alerts:lastRunStart",

  // Search-logs filter persistence
  logTimeframe: "dt_last_timeframe",
  logLevel: "dt_last_log_level",
  logTimeframePreset: "dt_timeframe_preset",

  // DQL Runner inter-command preset
  dqlRunnerPreset: "dql-runner-preset",
} as const;
