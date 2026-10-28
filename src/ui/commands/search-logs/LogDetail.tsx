import { Detail, ActionPanel, Action, Color, Icon, useNavigation } from "@raycast/api";
import type { LogEntry } from "../../../sdk";
import type { TenantConfig } from "../../../sdk";
import { escapeDqlString } from "../../../sdk";
import { formatLogContent } from "../../lib/formatLogContent";
import { buildTraceUrl } from "../../lib/deepLinks";
import { keyValueTable, fenceCode } from "../../lib/markdown";
import type { TimeframeValue } from "../../lib/listArgs";
import { tenantBaseUrl, traceMetadataLink } from "../../components/TraceBlocks";
import SearchTraces from "../search-traces/SearchTraces";
import RunDql from "../run-dql/RunDql";

// ── Helpers ────────────────────────────────────────────────────────────────────

function val(v: unknown): string | undefined {
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

// Status wins over level; both are matched upper-cased. Maps, not object
// literals, so a value like "constructor" never hits the prototype.
const STATUS_COLORS = new Map<string, Color>([
  ["SUCCESS", Color.Green],
  ["OK", Color.Green],
  ["ERROR", Color.Red],
  ["FAILED", Color.Red],
  ["FAILURE", Color.Red],
]);
const LEVEL_COLORS = new Map<string, Color>([
  ["WARN", Color.Yellow],
  ["WARNING", Color.Yellow],
  ["ERROR", Color.Red],
  ["FATAL", Color.Red],
  ["CRITICAL", Color.Red],
  ["INFO", Color.Blue],
]);

function levelColor(level: string | undefined, status: string | undefined): Color {
  return (
    STATUS_COLORS.get(status?.toUpperCase() ?? "") ??
    LEVEL_COLORS.get(level?.toUpperCase() ?? "") ??
    Color.SecondaryText
  );
}

function environmentColor(env: string | undefined): Color {
  const e = env?.toLowerCase() ?? "";
  if (e === "prod" || e === "production") return Color.Green;
  if (e.includes("stag")) return Color.Yellow;
  return Color.SecondaryText;
}

function buildLogContextQuery(raw: Record<string, unknown>, limit = 100): string {
  const service = raw["service.name"] ? String(raw["service.name"]) : undefined;
  if (service) {
    return `fetch logs\n| filter service.name == "${escapeDqlString(service)}"\n| limit ${limit}`;
  }
  const appName = raw["dt.app.name"] ? String(raw["dt.app.name"]) : undefined;
  if (appName) {
    return `fetch logs\n| filter dt.app.name == "${escapeDqlString(appName)}"\n| limit ${limit}`;
  }
  const processName = raw["dt.process.name"]
    ? String(raw["dt.process.name"])
    : raw["dt.process_group.detected_name"]
      ? String(raw["dt.process_group.detected_name"])
      : undefined;
  if (processName) {
    return `fetch logs\n| filter dt.process.name == "${escapeDqlString(processName)}"\n| limit ${limit}`;
  }
  return `fetch logs\n| limit ${limit}`;
}

// ── Field tables ───────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
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

// Topology: entity refs
const TOPOLOGY_ROWS: readonly Row[] = [
  ["dt.source_entity", list("dt.source_entity")],
  ["dt.entity.host"],
  ["dt.entity.process_group_instance"],
  ["dt.entity.custom_device"],
  ["dt.entity.aws_lambda_function"],
];

// Fields section — Infrastructure, Cloud, FaaS, K8s, Process, Pipeline, Telemetry
const FIELD_ROWS: readonly Row[] = [
  ["host.name", pick("host.name", "dt.entity.host")],
  ["dt.host_group.id"],
  ["cloud.provider"],
  ["cloud.region", pick("aws.region", "cloud.region")],
  ["aws.availability_zone"],
  ["cloud.account.id", pick("aws.account.id", "cloud.account.id")],
  ["aws.arn"],

  ["faas.name"],
  ["faas.version"],
  ["faas.id"],

  ["k8s.cluster.name"],
  ["k8s.namespace.name"],
  ["k8s.node.name"],
  ["k8s.pod.uid"],

  ["dt.app.name"],
  ["dt.app.version"],
  ["dt.process.name", pick("dt.process.name", "dt.process_group.detected_name")],
  ["process.technology", list("process.technology")],
  ["log.source", (_, entry) => entry.source],
  ["OperatorVersion"],

  ["dt.openpipeline.source"],
  ["dt.openpipeline.pipelines", list("dt.openpipeline.pipelines")],
  ["dt.auth.origin", pick("dt.auth.origin", "dt.auth_origin")],

  ["trace_id", (_, entry) => entry.traceId],
  ["span_id"],

  ["event.type"],
  ["dt.environment.id", pick("dt.environment.id", "environment")],
];

function rowTable(rows: readonly Row[], raw: Raw, entry: LogEntry): string {
  return keyValueTable(rows.map(([label, read = pick(label)]) => [label, read(raw, entry)]));
}

function buildMarkdown(entry: LogEntry, raw: Raw, dqlFilter: string): string {
  const sections: string[] = [formatLogContent(entry.content) ?? "_No content available_"];

  const topologyTable = rowTable(TOPOLOGY_ROWS, raw, entry);
  if (topologyTable) sections.push("### Topology", topologyTable);

  const fieldsTable = rowTable(FIELD_ROWS, raw, entry);
  if (fieldsTable) sections.push("### Fields", fieldsTable);

  // DQL filter
  sections.push("### DQL Filter *(⌘D to copy)*", fenceCode(dqlFilter));

  // Raw JSON at the bottom
  sections.push("### Raw Fields", fenceCode(JSON.stringify(raw, null, 2), "json"));

  return sections.join("\n\n");
}

function traceLink(tenant: TenantConfig | undefined, traceId: string | undefined): string | undefined {
  const baseUrl = tenantBaseUrl(tenant);
  return traceId && baseUrl ? buildTraceUrl(baseUrl, traceId) : undefined;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LogDetail({
  entry,
  tenant,
  timeframe,
}: {
  entry: LogEntry;
  tenant?: TenantConfig;
  /** The Search Logs timeframe, so the trace is looked up as far back as the log. */
  timeframe?: TimeframeValue;
}) {
  const { push } = useNavigation();
  const raw = entry.raw as Raw;

  const status = val(entry.status);
  const serviceName = val(raw["service.name"]);
  const appName = val(raw["dt.app.name"]);
  const hostName = pick("host.name", "dt.entity.host")(raw, entry);
  const processName = pick("dt.process.name", "dt.process_group.detected_name")(raw, entry);
  const envVal = pick("dt.environment.id", "environment")(raw, entry);

  const traceId = entry.traceId;
  const traceUrl = traceLink(tenant, traceId);

  const dqlFilter = buildLogContextQuery(raw);

  return (
    <Detail
      navigationTitle={`${serviceName ?? appName ?? processName ?? "Log"} — ${entry.level}`}
      markdown={buildMarkdown(entry, raw, dqlFilter)}
      actions={
        <ActionPanel>
          {traceId && (
            <Action
              title="View Trace in Raycast"
              icon={Icon.MagnifyingGlass}
              shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
              onAction={() => push(<SearchTraces initialTraceId={traceId} initialTimeframe={timeframe} />)}
            />
          )}
          {traceUrl && (
            <Action.OpenInBrowser
              title="Open in Distributed Traces"
              url={traceUrl}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            />
          )}
          <Action
            title="Open DQL Filter in Run DQL"
            icon={Icon.Terminal}
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={() => push(<RunDql initialQuery={dqlFilter} />)}
          />
          <Action.CopyToClipboard
            title="Copy DQL Filter"
            content={dqlFilter}
            shortcut={{ modifiers: ["cmd", "shift"], key: "q" }}
          />
          <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
          <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
          {traceId && <Action.CopyToClipboard title="Copy Trace ID" content={traceId} />}
          {traceUrl && <Action.CopyToClipboard title="Copy Trace Link" content={traceUrl} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {/* ── Core: Status / Level / Time ───────────────────────────────── */}
          {status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text={status} color={levelColor(entry.level, status)} />
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Label title="Level" text={entry.level} />
          <Detail.Metadata.Label title="Timestamp" text={new Date(entry.timestamp).toLocaleString()} />

          {/* ── Service / Process ─────────────────────────────────────────── */}
          <Detail.Metadata.Separator />
          {serviceName && (
            <Detail.Metadata.TagList title="Service">
              <Detail.Metadata.TagList.Item text={serviceName} color={Color.Blue} />
            </Detail.Metadata.TagList>
          )}
          {processName && <Detail.Metadata.Label title="Process" text={processName} />}
          {appName && !serviceName && <Detail.Metadata.Label title="App" text={appName} />}
          {envVal && (
            <Detail.Metadata.TagList title="Environment">
              <Detail.Metadata.TagList.Item text={envVal} color={environmentColor(envVal)} />
            </Detail.Metadata.TagList>
          )}

          {/* ── Host ─────────────────────────────────────────────────────── */}
          {hostName && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Host" text={hostName} />
            </>
          )}

          {/* ── Telemetry link ────────────────────────────────────────────── */}
          {traceMetadataLink(traceUrl)}
        </Detail.Metadata>
      }
    />
  );
}
