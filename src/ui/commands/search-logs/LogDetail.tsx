import { Detail, ActionPanel, Action, Color, Icon, environment, useNavigation, Keyboard } from "@raycast/api";
import { keyValueGroupsMarkdown, headerMarkdown, severityIcon, logSeverity, type KeyValueGroup } from "../../lib/svg";
import type { LogEntry } from "../../../sdk";
import type { TenantConfig } from "../../../sdk";
import { escapeDqlString } from "../../../sdk";
import { recordFieldGroup } from "../../lib/dqlRecord";
import { formatLogContent } from "../../lib/formatLogContent";
import { buildTraceUrl } from "../../lib/deepLinks";
import { fenceCode } from "../../lib/markdown";
import { severityColor } from "../../lib/severityColor";
import type { TimeframeValue } from "../../lib/listArgs";
import { tenantBaseUrl } from "../../components/TraceBlocks";
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

function environmentColor(env: string): Color {
  const e = env.toLowerCase();
  if (e === "prod" || e === "production") return Color.Green;
  return e.includes("stag") ? Color.Yellow : Color.SecondaryText;
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
  const processNameRaw = raw["dt.process.name"] || raw["dt.process_group.detected_name"];
  const processName = processNameRaw ? String(processNameRaw) : undefined;
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

function fieldGroups(raw: Raw, entry: LogEntry): KeyValueGroup[] {
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

function buildMarkdown(entry: LogEntry, raw: Raw, dqlFilter: string): string {
  const dark = environment.appearance === "dark";
  const sections: string[] = [
    headerMarkdown(
      {
        severity: logSeverity(entry.status, entry.level),
        title: entry.service ?? val(raw["dt.app.name"]) ?? "Unknown service",
        subtitle: entry.source ?? "",
      },
      dark,
    ),
    formatLogContent(entry.content) ?? "_No content available_",
  ];

  const fields = keyValueGroupsMarkdown(fieldGroups(raw, entry), dark);
  if (fields) sections.push(fields);

  // DQL filter
  sections.push("### DQL Filter *(⌘⇧Q to copy)*", fenceCode(dqlFilter));

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

  const serviceName = val(raw["service.name"]);
  const appName = val(raw["dt.app.name"]);
  const processName = pick("dt.process.name", "dt.process_group.detected_name")(raw, entry);

  const hostName = pick("host.name", "dt.entity.host")(raw, entry);
  const envVal = pick("deployment.environment", "environment")(raw, entry);
  const status = val(entry.status);
  const severity = logSeverity(entry.status, entry.level);
  const cloud = [val(raw["cloud.provider"]), pick("aws.region", "cloud.region")(raw, entry)]
    .filter(Boolean)
    .join(" · ");
  const k8s = [val(raw["k8s.namespace.name"]), val(raw["k8s.cluster.name"])].filter(Boolean).join(" · ");

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
              shortcut={Keyboard.Shortcut.Common.OpenWith}
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
          {status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text={status} color={severityColor(severity)} />
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Label title="Level" text={entry.level} icon={severityIcon(severity)} />
          <Detail.Metadata.Label
            title="Timestamp"
            text={new Date(entry.timestamp).toLocaleString()}
            icon={{ source: Icon.Clock, tintColor: Color.SecondaryText }}
          />
          {(processName || appName || envVal || hostName) && <Detail.Metadata.Separator />}
          {processName && (
            <Detail.Metadata.Label
              title="Process"
              text={processName}
              icon={{ source: Icon.Gear, tintColor: Color.Purple }}
            />
          )}
          {appName && (
            <Detail.Metadata.Label
              title="App"
              text={appName}
              icon={{ source: Icon.AppWindow, tintColor: Color.Purple }}
            />
          )}
          {envVal && (
            <Detail.Metadata.TagList title="Environment">
              <Detail.Metadata.TagList.Item text={envVal} color={environmentColor(envVal)} />
            </Detail.Metadata.TagList>
          )}
          {hostName && (
            <Detail.Metadata.Label
              title="Host"
              text={hostName}
              icon={{ source: Icon.ComputerChip, tintColor: Color.Purple }}
            />
          )}
          {(cloud || k8s) && <Detail.Metadata.Separator />}
          {cloud && (
            <Detail.Metadata.Label title="Cloud" text={cloud} icon={{ source: Icon.Cloud, tintColor: Color.Blue }} />
          )}
          {k8s && (
            <Detail.Metadata.Label title="Kubernetes" text={k8s} icon={{ source: Icon.Box, tintColor: Color.Blue }} />
          )}
          {traceId && <Detail.Metadata.Separator />}
          {traceId &&
            (traceUrl ? (
              <Detail.Metadata.Link title="Trace" target={traceUrl} text={traceId} />
            ) : (
              <Detail.Metadata.Label
                title="Trace"
                text={traceId}
                icon={{ source: Icon.Link, tintColor: Color.Green }}
              />
            ))}
        </Detail.Metadata>
      }
    />
  );
}
