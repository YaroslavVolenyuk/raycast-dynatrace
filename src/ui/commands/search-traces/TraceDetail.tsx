import { Detail, ActionPanel, Action, Color, Icon, environment, Keyboard } from "@raycast/api";
import type { SpanEntry } from "../../../sdk/resources";
import { formatDuration } from "../../../sdk/resources";
import type { TenantConfig } from "../../../sdk/auth";
import { buildTraceUrl } from "../../lib/deepLinks";
import { fenceCode } from "../../lib/markdown";
import { severityColor } from "../../lib/severityColor";
import { headerMarkdown, keyValueGroupsMarkdown, severityOf, type KeyValueGroup } from "../../lib/svg";
import { copyTraceSpanActions, tenantBaseUrl } from "../../components/TraceBlocks";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
type Row = readonly [string, string | undefined];

function val(v: unknown): string | undefined {
  if (v == null || v === "" || v === "N/A") return undefined;
  return String(v);
}

function kindIcon(kind: string): Icon {
  switch (kind.toLowerCase()) {
    case "server":
      return Icon.ArrowDown;
    case "client":
      return Icon.ArrowUp;
    case "producer":
      return Icon.Upload;
    case "consumer":
      return Icon.Download;
    default:
      return Icon.Dot;
  }
}

const hasHttp = (entry: SpanEntry) => !!(entry.httpMethod || entry.urlPath);
const hasDb = (entry: SpanEntry) => !!(entry.dbSystem || entry.dbOperation);
const hasRpc = (raw: Raw) => !!(val(raw["rpc.system"]) || val(raw["rpc.method"]));

// ── Markdown ──────────────────────────────────────────────────────────────────

// The status, kind, duration, start time, request, status code and database
// are in the metadata pane, so the field card holds only what is not there.
function fieldGroups(entry: SpanEntry, raw: Raw): KeyValueGroup[] {
  const rawVal = (key: string) => val(raw[key]);
  const server: Row[] = [
    ["server.address", rawVal("server.address")],
    ["server.port", rawVal("server.port")],
  ];
  const groups: Array<{ title: string; show: boolean; rows: Row[] }> = [
    {
      title: "Span",
      show: true,
      rows: [
        ["trace.id", entry.traceId],
        ["span.id", entry.spanId],
        ["span.parent_id", entry.parentSpanId],
        ["endpoint.name", rawVal("endpoint.name")],
        ["status.message", entry.statusMessage],
      ],
    },
    { title: "HTTP", show: hasHttp(entry), rows: [["http.route", entry.httpRoute], ...server] },
    {
      title: "Database",
      show: hasDb(entry),
      rows: [["db.namespace", entry.dbNamespace], ["db.collection.name", rawVal("db.collection.name")], ...server],
    },
    {
      title: "RPC",
      show: hasRpc(raw),
      rows: [
        ["rpc.system", rawVal("rpc.system")],
        ["rpc.service", rawVal("rpc.service")],
        ["rpc.method", rawVal("rpc.method")],
      ],
    },
  ];
  return groups.map(({ title, show, rows }) => ({
    title,
    rows: show ? rows.flatMap(([k, v]) => (v ? [[k, v] as const] : [])) : [],
  }));
}

function buildMarkdown(entry: SpanEntry, raw: Raw): string {
  const dark = environment.appearance === "dark";
  const sections = [
    headerMarkdown(
      { severity: severityOf(entry.statusCode), title: entry.name, subtitle: entry.service ?? "Unknown service" },
      dark,
    ),
  ];
  const fields = keyValueGroupsMarkdown(fieldGroups(entry, raw), dark);
  if (fields) sections.push(fields);
  sections.push("### Raw Fields", fenceCode(JSON.stringify(raw, null, 2), "json"));
  return sections.join("\n\n");
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function httpMetadata(entry: SpanEntry) {
  if (!hasHttp(entry)) return null;
  return (
    <>
      <Detail.Metadata.Separator />
      {(entry.httpMethod || entry.urlPath) && (
        <Detail.Metadata.Label
          title="Request"
          text={[entry.httpMethod, entry.urlPath].filter(Boolean).join(" ")}
          icon={{ source: Icon.Globe, tintColor: Color.Blue }}
        />
      )}
      {entry.httpStatusCode != null && (
        <Detail.Metadata.Label title="HTTP Status" text={String(entry.httpStatusCode)} />
      )}
    </>
  );
}

function dbMetadata(entry: SpanEntry) {
  if (!hasDb(entry)) return null;
  return (
    <>
      <Detail.Metadata.Separator />
      {entry.dbSystem && (
        <Detail.Metadata.Label
          title="DB System"
          text={entry.dbSystem}
          icon={{ source: Icon.HardDrive, tintColor: Color.Blue }}
        />
      )}
      {(entry.dbOperation || entry.dbNamespace) && (
        <Detail.Metadata.Label
          title="Operation"
          text={[entry.dbOperation, entry.dbNamespace].filter(Boolean).join(" ")}
        />
      )}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TraceDetail({ entry, tenant }: { entry: SpanEntry; tenant?: TenantConfig }) {
  const raw = entry.raw as Raw;
  const baseUrl = tenantBaseUrl(tenant);
  const traceUrl = baseUrl ? buildTraceUrl(baseUrl, entry.traceId) : undefined;
  const durationStr = entry.durationUs != null ? formatDuration(entry.durationUs) : "—";
  const severity = severityOf(entry.statusCode);

  return (
    <Detail
      navigationTitle={`${entry.service ?? "Span"} — ${entry.name}`}
      markdown={buildMarkdown(entry, raw)}
      actions={
        <ActionPanel>
          {traceUrl && (
            <Action.OpenInBrowser
              title="Open in Distributed Traces"
              url={traceUrl}
              shortcut={Keyboard.Shortcut.Common.OpenWith}
            />
          )}
          {copyTraceSpanActions(entry.traceId, entry.spanId)}
          {traceUrl && <Action.CopyToClipboard title="Copy Trace Link" content={traceUrl} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item text={entry.statusCode} color={severityColor(severity)} />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label
            title="Kind"
            text={entry.kind}
            icon={{ source: kindIcon(entry.kind), tintColor: Color.SecondaryText }}
          />
          <Detail.Metadata.Label
            title="Duration"
            text={durationStr}
            icon={{ source: Icon.Stopwatch, tintColor: Color.Purple }}
          />
          <Detail.Metadata.Label
            title="Start Time"
            text={new Date(entry.startTime).toLocaleString()}
            icon={{ source: Icon.Clock, tintColor: Color.SecondaryText }}
          />
          {entry.isRootSpan && (
            <Detail.Metadata.Label title="Root Span" text="Yes" icon={{ source: Icon.Flag, tintColor: Color.Green }} />
          )}
          {httpMetadata(entry)}
          {dbMetadata(entry)}
          <Detail.Metadata.Separator />
          {traceUrl ? (
            <Detail.Metadata.Link title="Trace" target={traceUrl} text={entry.traceId} />
          ) : (
            <Detail.Metadata.Label
              title="Trace"
              text={entry.traceId}
              icon={{ source: Icon.Link, tintColor: Color.Green }}
            />
          )}
        </Detail.Metadata>
      }
    />
  );
}
