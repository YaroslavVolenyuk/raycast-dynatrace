import { Detail, ActionPanel, Action, Color } from "@raycast/api";
import type { SpanEntry } from "../../../sdk/resources";
import { formatDuration } from "../../../sdk/resources";
import type { TenantConfig } from "../../../sdk/auth";
import { buildTraceUrl } from "../../lib/deepLinks";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Insert a zero-width space before each dot so the markdown renderer doesn't
// autolink dotted names like trace.id / span.id (".id"/".name" look like TLDs).
const noAutolink = (s: string): string => s.replace(/\./g, "​.");

/** Renders key/value rows as a two-column markdown table. */
function mdKeyValues(rows: Array<[string, string | undefined]>): string {
  const valid = rows.filter((r): r is [string, string] => r[1] !== undefined && r[1] !== "");
  if (valid.length === 0) return "";
  return ["| Field | Value |", "|---|---|", ...valid.map(([k, v]) => `| ${noAutolink(k)} | ${v} |`)].join("\n");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TraceDetail({ entry, tenant }: { entry: SpanEntry; tenant?: TenantConfig }) {
  const raw = entry.raw as Record<string, unknown>;
  const baseUrl = tenant?.tenantEndpoint?.replace(/\/$/, "") ?? "";
  const traceUrl = baseUrl ? buildTraceUrl(baseUrl, entry.traceId) : undefined;

  const hasHttp = !!(entry.httpMethod || entry.urlPath);
  const hasDb = !!(entry.dbSystem || entry.dbOperation);
  const hasRpc = !!(val(raw["rpc.system"]) || val(raw["rpc.method"]));

  // ── Markdown sections ──────────────────────────────────────────────────────

  const sections: string[] = [];

  // Summary header omitted — status/duration/start-time are shown in the right metadata pane.
  const durationStr = entry.durationUs != null ? formatDuration(entry.durationUs) : "—";

  // Core fields table
  const coreRows: Array<[string, string | undefined]> = [
    ["trace.id", entry.traceId],
    ["span.id", entry.spanId],
    ["span.parent_id", entry.parentSpanId],
    ["span.kind", entry.kind],
    ["service.name", entry.service],
    ["endpoint.name", val(raw["endpoint.name"])],
    ["duration", durationStr],
    ["status.message", entry.statusMessage],
  ];
  const coreTable = mdKeyValues(coreRows);
  if (coreTable) sections.push("### Span", coreTable);

  // HTTP
  if (hasHttp) {
    const httpRows: Array<[string, string | undefined]> = [
      ["http.request.method", entry.httpMethod],
      ["url.path", entry.urlPath],
      ["http.route", entry.httpRoute],
      ["http.response.status_code", entry.httpStatusCode?.toString()],
      ["server.address", val(raw["server.address"])],
      ["server.port", val(raw["server.port"])],
    ];
    const httpTable = mdKeyValues(httpRows);
    if (httpTable) sections.push("### HTTP", httpTable);
  }

  // DB
  if (hasDb) {
    const dbRows: Array<[string, string | undefined]> = [
      ["db.system", entry.dbSystem],
      ["db.operation.name", entry.dbOperation],
      ["db.namespace", entry.dbNamespace],
      ["db.collection.name", val(raw["db.collection.name"])],
      ["server.address", val(raw["server.address"])],
      ["server.port", val(raw["server.port"])],
    ];
    const dbTable = mdKeyValues(dbRows);
    if (dbTable) sections.push("### Database", dbTable);
  }

  // RPC
  if (hasRpc) {
    const rpcRows: Array<[string, string | undefined]> = [
      ["rpc.system", val(raw["rpc.system"])],
      ["rpc.service", val(raw["rpc.service"])],
      ["rpc.method", val(raw["rpc.method"])],
    ];
    const rpcTable = mdKeyValues(rpcRows);
    if (rpcTable) sections.push("### RPC", rpcTable);
  }

  // Raw JSON
  sections.push("### Raw Fields", `\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\``);

  const markdown = sections.join("\n\n");

  return (
    <Detail
      navigationTitle={`${entry.service ?? "Span"} — ${entry.name}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          {traceUrl && (
            <Action.OpenInBrowser
              title="Open in Distributed Traces"
              url={traceUrl}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            />
          )}
          <Action.CopyToClipboard
            title="Copy Trace ID"
            content={entry.traceId}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
          />
          <Action.CopyToClipboard
            title="Copy Span ID"
            content={entry.spanId}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
          />
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

          {hasHttp && (
            <>
              <Detail.Metadata.Separator />
              {entry.httpMethod && entry.urlPath && (
                <Detail.Metadata.Label title="Request" text={`${entry.httpMethod} ${entry.urlPath}`} />
              )}
              {entry.httpStatusCode != null && (
                <Detail.Metadata.Label title="HTTP Status" text={String(entry.httpStatusCode)} />
              )}
            </>
          )}

          {hasDb && (
            <>
              <Detail.Metadata.Separator />
              {entry.dbSystem && <Detail.Metadata.Label title="DB System" text={entry.dbSystem} />}
              {entry.dbOperation && entry.dbNamespace && (
                <Detail.Metadata.Label title="Operation" text={`${entry.dbOperation} ${entry.dbNamespace}`} />
              )}
            </>
          )}

          {traceUrl && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Link title="Distributed Trace" target={traceUrl} text="Open in Explorer" />
            </>
          )}
        </Detail.Metadata>
      }
    />
  );
}
