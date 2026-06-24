import { Detail, ActionPanel, Action, Color } from "@raycast/api";
import type { LogEntry } from "../../../sdk/resources";
import { formatLogContent } from "../../lib/formatLogContent";

function levelColor(level: string, status?: string): Color {
  const st = status?.toUpperCase();
  if (st === "SUCCESS" || st === "OK") return Color.Green;
  if (st === "ERROR" || st === "FAILED" || st === "FAILURE") return Color.Red;
  switch (level.toUpperCase()) {
    case "WARN":
    case "WARNING":
      return Color.Yellow;
    case "ERROR":
    case "FATAL":
    case "CRITICAL":
      return Color.Red;
    case "INFO":
      return Color.Blue;
    default:
      return Color.SecondaryText;
  }
}

export default function LogDetail({ entry }: { entry: LogEntry }) {
  const formatted = formatLogContent(entry.content) ?? "_No content available_";

  const header = [`\`${entry.level}\``, entry.status && entry.status !== entry.level ? `\`${entry.status}\`` : null]
    .filter(Boolean)
    .join("  ·  ");

  const markdown = [
    header,
    formatted,
    "**Raw Fields**",
    `\`\`\`json\n${JSON.stringify(entry.raw, null, 2)}\n\`\`\``,
  ].join("\n\n");

  return (
    <Detail
      navigationTitle={`${entry.service ?? "Log"} — ${entry.level}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
          <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
          {entry.traceId && <Action.CopyToClipboard title="Copy Trace ID" content={entry.traceId} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Level">
            <Detail.Metadata.TagList.Item text={entry.level} color={levelColor(entry.level, entry.status)} />
          </Detail.Metadata.TagList>
          {entry.status && <Detail.Metadata.Label title="Status" text={entry.status} />}
          <Detail.Metadata.Label title="Timestamp" text={new Date(entry.timestamp).toLocaleString()} />
          {entry.service && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.TagList title="Service">
                <Detail.Metadata.TagList.Item text={entry.service} color={Color.Blue} />
              </Detail.Metadata.TagList>
            </>
          )}
          {entry.host && <Detail.Metadata.Label title="Host" text={entry.host} />}
          {entry.source && <Detail.Metadata.Label title="Log Source" text={entry.source} />}
          {entry.traceId && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Trace ID" text={entry.traceId} />
            </>
          )}
        </Detail.Metadata>
      }
    />
  );
}
