// Starter queries for Run DQL (⌘T). Each was checked with query:verify on a live
// tenant (2026-10-26); keep them free of tenant-specific names. The span
// templates were rewritten afterwards to avoid the deprecated request.is_*
// fields (see sdk/resources/spans.ts) and still need a live re-check.

import { requiredScopesForQuery } from "../../../sdk/resources";

export interface DqlTemplate {
  title: string;
  /** List section: the data the query reads. */
  section: "Logs" | "Spans" | "Events" | "Metrics";
  query: string;
}

/** The scopes a template's query needs — shown so a 403 or an empty result is not a surprise. */
export function templateScopes(t: DqlTemplate): string[] {
  return requiredScopesForQuery(t.query);
}

export const DQL_TEMPLATES: DqlTemplate[] = [
  { section: "Logs", title: "Error logs", query: 'fetch logs\n| filter status == "ERROR"\n| sort timestamp desc' },
  {
    section: "Logs",
    title: "Errors by service",
    query:
      'fetch logs\n| filter status == "ERROR"\n| summarize errors = count(), by: {service.name}\n| sort errors desc',
  },
  {
    section: "Logs",
    title: "Search log content",
    query: 'fetch logs\n| filter contains(content, "exception")\n| sort timestamp desc',
  },
  { section: "Logs", title: "Log volume by status", query: "fetch logs\n| makeTimeseries count(), by: {status}" },
  {
    section: "Spans",
    title: "Failed requests",
    query: 'fetch spans\n| filter span.kind == "server" and span.status_code == "error"\n| sort start_time desc',
  },
  { section: "Spans", title: "Slowest spans", query: "fetch spans\n| sort duration desc\n| limit 20" },
  {
    section: "Spans",
    title: "Requests per service",
    query:
      "fetch spans\n| filter isNull(span.parent_id)\n| summarize requests = count(), by: {service.name}\n| sort requests desc",
  },
  {
    section: "Events",
    title: "Open problems",
    query:
      'fetch dt.davis.problems\n| dedup event.id, sort: {timestamp desc}\n| filter event.status != "CLOSED"\n| sort event.start desc',
  },
  { section: "Events", title: "Davis events", query: "fetch dt.davis.events\n| sort timestamp desc" },
  {
    section: "Events",
    title: "Business events by type",
    query: "fetch bizevents\n| summarize count(), by: {event.type}",
  },
  {
    section: "Metrics",
    title: "Host CPU usage",
    query: "timeseries cpu = avg(dt.host.cpu.usage), by: {dt.entity.host}",
  },
];
