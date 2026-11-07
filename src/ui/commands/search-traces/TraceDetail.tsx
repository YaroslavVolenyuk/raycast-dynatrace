import { Detail, ActionPanel, Action, Color, Icon, environment, Keyboard } from "@raycast/api";
import type { SpanEntry } from "../../../sdk/resources";
import { formatDuration } from "../../../sdk/resources";
import type { TenantConfig } from "../../../sdk/auth";
import { fenceCode } from "../../lib/markdown";
import { severityColor } from "../../lib/severityColor";
import { headerMarkdown, keyValueGroupsMarkdown, severityOf } from "../../lib/svg";
import { copyTraceSpanActions } from "../../components/TraceBlocks";
import { fieldGroups, hasDb, hasHttp, traceLink, type Raw } from "./TraceDetail.helpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Markdown ──────────────────────────────────────────────────────────────────

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
  const traceUrl = traceLink(tenant, entry.traceId);
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
