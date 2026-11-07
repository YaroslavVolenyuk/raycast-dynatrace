// Pure helpers for Log Detail: which fields go where, the context query and the
// trace link. Kept out of the JSX so they are unit-testable without rendering.

import type { LogEntry, TenantConfig } from "../../../sdk";
import { escapeDqlString } from "../../../sdk";
import { recordFieldGroup } from "../../lib/dqlRecord";
import { buildTraceUrl } from "../../lib/deepLinks";
import type { KeyValueGroup } from "../../lib/svg";
import { tenantBaseUrl } from "../../components/TraceBlocks";

export type Raw = Record<string, unknown>;

export function val(v: unknown): string | undefined {
  if (v == null || v === "" || v === "N/A") return undefined;
  return String(v);
}

function valArray(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const joined = v.filter(Boolean).join(", ");
    return joined || undefined;
  }
  return val(v);
}

/** "Open DQL Filter in Run DQL": logs of the same service, else app, else process. Telemetry values are escaped. */
export function buildLogContextQuery(raw: Raw, limit = 100): string {
  const service = raw["service.name"] ? String(raw["service.name"]) : undefined;
  if (service) {
    return `fetch logs\n| filter service.name == "${escapeDqlString(service)}"\n| limit ${limit}`;
  }
  const appName = raw["dt.app.name"] ? String(raw["dt.app.name"]) : undefined;
  if (appName) {
    return `fetch logs\n| filter dt.app.name == "${escapeDqlString(appName)}"\n| limit ${limit}`;
  }
  const processNameRaw = raw["dt.process.name"] || raw["dt.process_group.detected_name"];
  const processName = processNameRaw ? String(processNameRaw) : undefined;
  if (processName) {
    return `fetch logs\n| filter dt.process.name == "${escapeDqlString(processName)}"\n| limit ${limit}`;
  }
  return `fetch logs\n| limit ${limit}`;
}

// ── Field tables ───────────────────────────────────────────────────────────────

type Read = (raw: Raw, entry: LogEntry) => string | undefined;

/** First non-empty value among `keys` (in order, like `val(a) ?? val(b)`). */
const pick =
  (...keys: string[]): Read =>
  (raw) =>
    keys.map((k) => val(raw[k])).find((v) => v !== undefined);

/** A list-valued field, joined with ", ". */
const list =
  (key: string): Read =>
  (raw) =>
    valArray(raw[key]);

/** A markdown table row: the label, and how to read it (defaults to the raw field named by the label). */
type Row = readonly [label: string, read?: Read];

const GROUPS: ReadonlyArray<{ title: string; rows: readonly Row[] }> = [
  {
    title: "Topology",
    rows: [
      ["dt.source_entity", list("dt.source_entity")],
      ["dt.entity.host"],
      ["dt.entity.process_group_instance"],
      ["dt.entity.custom_device"],
      ["dt.entity.aws_lambda_function"],
    ],
  },
  {
    title: "Infrastructure",
    rows: [
      ["dt.host_group.id"],
      ["aws.availability_zone"],
      ["cloud.account.id", pick("aws.account.id", "cloud.account.id")],
      ["aws.arn"],
      ["dt.environment.id"],
    ],
  },
  { title: "Serverless", rows: [["faas.name"], ["faas.version"], ["faas.id"]] },
  {
    title: "Kubernetes",
    rows: [["k8s.node.name"], ["k8s.pod.uid"]],
  },
  {
    title: "Application",
    rows: [["dt.app.version"], ["process.technology", list("process.technology")], ["OperatorVersion"]],
  },
  {
    title: "Pipeline",
    rows: [
      ["dt.openpipeline.source"],
      ["dt.openpipeline.pipelines", list("dt.openpipeline.pipelines")],
      ["dt.auth.origin", pick("dt.auth.origin", "dt.auth_origin")],
    ],
  },
  {
    title: "Telemetry",
    rows: [["span_id"], ["event.type"]],
  },
];

/** Raw fields that the header, the metadata pane or an alias in GROUPS already shows. */
const SHOWN_ELSEWHERE = [
  "timestamp",
  "content",
  "loglevel",
  "status",
  "service.name",
  "dt.app.name",
  "host.name",
  "dt.process.name",
  "dt.process_group.detected_name",
  "log.source",
  "trace_id",
  "cloud.provider",
  "cloud.region",
  "aws.region",
  "aws.account.id",
  "k8s.cluster.name",
  "k8s.namespace.name",
  "deployment.environment",
  "environment",
  "dt.auth_origin",
];

const KNOWN_KEYS = new Set([...SHOWN_ELSEWHERE, ...GROUPS.flatMap(({ rows }) => rows.map(([label]) => label))]);

/** The field card: the known groups, then every other non-empty field under "Other". */
export function fieldGroups(raw: Raw, entry: LogEntry): KeyValueGroup[] {
  const groups = GROUPS.map(({ title, rows }) => ({
    title,
    rows: rows.flatMap(([label, read = pick(label)]) => {
      const value = read(raw, entry);
      return value ? [[label, value] as const] : [];
    }),
  }));
  // Everything the mapping above does not know about (custom attributes, new semantic fields) still has to be visible.
  const otherKeys = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k) && raw[k] != null && raw[k] !== "");
  return [...groups, recordFieldGroup(raw, otherKeys, "Other")];
}

/** The values of the metadata pane. Cloud and Kubernetes are "" when nothing is known. */
export function logSummary(raw: Raw, entry: LogEntry) {
  return {
    serviceName: val(raw["service.name"]),
    appName: val(raw["dt.app.name"]),
    processName: pick("dt.process.name", "dt.process_group.detected_name")(raw, entry),
    hostName: pick("host.name", "dt.entity.host")(raw, entry),
    envVal: pick("deployment.environment", "environment")(raw, entry),
    status: val(entry.status),
    cloud: [val(raw["cloud.provider"]), pick("aws.region", "cloud.region")(raw, entry)].filter(Boolean).join(" · "),
    k8s: [val(raw["k8s.namespace.name"]), val(raw["k8s.cluster.name"])].filter(Boolean).join(" · "),
  };
}

/** Link to the trace in Distributed Traces; needs both a trace id and a tenant. */
export function traceLink(tenant: TenantConfig | undefined, traceId: string | undefined): string | undefined {
  const baseUrl = tenantBaseUrl(tenant);
  return traceId && baseUrl ? buildTraceUrl(baseUrl, traceId) : undefined;
}
