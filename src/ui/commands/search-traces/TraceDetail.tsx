import { Detail, ActionPanel, Action, Color } from "@raycast/api";
import type { SpanEntry } from "../../../sdk/resources";
import { formatDuration } from "../../../sdk/resources";
import type { TenantConfig } from "../../../sdk/auth";
import { buildTraceUrl } from "../../lib/deepLinks";
import { keyValueTable, fenceCode } from "../../lib/markdown";
import { copyTraceSpanActions, tenantBaseUrl, traceMetadataLink } from "../../components/TraceBlocks";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
type Row = readonly [string, string | undefined];

function val(v: unknown): string | undefined {
  if (v == null || v === "" || v === "N/A") return undefined;
  return String(v);
}

function statusColor(code: string): Color {
  switch (code.toUpperCase()) {
    case "ERROR":
      return Color.Red;
    case "OK":
      return Color.Green;
    default:
      return Color.SecondaryText;
  }
}

const hasHttp = (entry: SpanEntry) => !!(entry.httpMethod || entry.urlPath);
const hasDb = (entry: SpanEntry) => !!(entry.dbSystem || entry.dbOperation);
const hasRpc = (raw: Raw) => !!(val(raw["rpc.system"]) || val(raw["rpc.method"]));

// ── Markdown ──────────────────────────────────────────────────────────────────

function buildMarkdown(entry: SpanEntry, raw: Raw, durationStr: string): string {
  const rawVal = (key: string) => val(raw[key]);
  const server: Row[] = [
    ["server.address", rawVal("server.address")],
    ["server.port", rawVal("server.port")],
  ];

  // Summary header omitted — status/duration/start-time are shown in the right metadata pane.
  const groups: Array<{ heading: string; show: boolean; rows: Row[] }> = [
    {
      heading: "Span",
      show: true,
      rows: [
        ["trace.id", entry.traceId],
        ["span.id", entry.spanId],
        ["span.parent_id", entry.parentSpanId],
        ["span.kind", entry.kind],
        ["service.name", entry.service],
        ["endpoint.name", rawVal("endpoint.name")],
        ["duration", durationStr],
        ["status.message", entry.statusMessage],
      ],
    },
    {
      heading: "HTTP",
      show: hasHttp(entry),
      rows: [
        ["http.request.method", entry.httpMethod],
        ["url.path", entry.urlPath],
        ["http.route", entry.httpRoute],
        ["http.response.status_code", entry.httpStatusCode?.toString()],
        ...server,
      ],
    },
    {
      heading: "Database",
      show: hasDb(entry),
      rows: [
        ["db.system", entry.dbSystem],
        ["db.operation.name", entry.dbOperation],
        ["db.namespace", entry.dbNamespace],
        ["db.collection.name", rawVal("db.collection.name")],
        ...server,
      ],
    },
    {
      heading: "RPC",
      show: hasRpc(raw),
      rows: [
        ["rpc.system", rawVal("rpc.system")],
        ["rpc.service", rawVal("rpc.service")],
        ["rpc.method", rawVal("rpc.method")],
      ],
    },
  ];

  const sections = groups.flatMap(({ heading, show, rows }) => {
    const table = show ? keyValueTable(rows) : "";
    return table ? [`### ${heading}`, table] : [];
  });
  sections.push("### Raw Fields", fenceCode(JSON.stringify(raw, null, 2), "json"));

  return sections.join("\n\n");
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function httpMetadata(entry: SpanEntry) {
  if (!hasHttp(entry)) return null;
  return (
    <>
      <Detail.Metadata.Separator />
      {entry.httpMethod && entry.urlPath && (
        <Detail.Metadata.Label title="Request" text={`${entry.httpMethod} ${entry.urlPath}`} />
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
      {entry.dbSystem && <Detail.Metadata.Label title="DB System" text={entry.dbSystem} />}
      {entry.dbOperation && entry.dbNamespace && (
        <Detail.Metadata.Label title="Operation" text={`${entry.dbOperation} ${entry.dbNamespace}`} />
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

  return (
    <Detail
      navigationTitle={`${entry.service ?? "Span"} — ${entry.name}`}
      markdown={buildMarkdown(entry, raw, durationStr)}
      actions={
        <ActionPanel>
          {traceUrl && (
            <Action.OpenInBrowser
              title="Open in Distributed Traces"
              url={traceUrl}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            />
          )}
          {copyTraceSpanActions(entry.traceId, entry.spanId)}
          {traceUrl && <Action.CopyToClipboard title="Copy Trace Link" content={traceUrl} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item text={entry.statusCode} color={statusColor(entry.statusCode)} />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Kind" text={entry.kind} />
          <Detail.Metadata.Label title="Duration" text={durationStr} />
          <Detail.Metadata.Label title="Start Time" text={new Date(entry.startTime).toLocaleString()} />

          <Detail.Metadata.Separator />
          {entry.service && (
            <Detail.Metadata.TagList title="Service">
              <Detail.Metadata.TagList.Item text={entry.service} color={Color.Blue} />
            </Detail.Metadata.TagList>
          )}
          {entry.isRootSpan && <Detail.Metadata.Label title="Root Span" text="Yes" />}

          {httpMetadata(entry)}
          {dbMetadata(entry)}
          {traceMetadataLink(traceUrl)}
        </Detail.Metadata>
      }
    />
  );
}
