import { Detail, ActionPanel, Action, Color, Icon, environment, useNavigation, Keyboard } from "@raycast/api";
import { keyValueGroupsMarkdown, headerMarkdown, severityIcon, logSeverity } from "../../lib/svg";
import type { LogEntry } from "../../../sdk";
import type { TenantConfig } from "../../../sdk";
import { formatLogContent } from "../../lib/formatLogContent";
import { fenceCode } from "../../lib/markdown";
import { severityColor } from "../../lib/severityColor";
import type { TimeframeValue } from "../../lib/listArgs";
import { buildLogContextQuery, fieldGroups, logSummary, traceLink, val, type Raw } from "./LogDetail.helpers";
import SearchTraces from "../search-traces/SearchTraces";
import RunDql from "../run-dql/RunDql";

function environmentColor(env: string): Color {
  const e = env.toLowerCase();
  if (e === "prod" || e === "production") return Color.Green;
  return e.includes("stag") ? Color.Yellow : Color.SecondaryText;
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

  const { serviceName, appName, processName, hostName, envVal, status, cloud, k8s } = logSummary(raw, entry);
  const severity = logSeverity(entry.status, entry.level);

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
