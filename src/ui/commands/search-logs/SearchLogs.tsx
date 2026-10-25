import { List, ActionPanel, Action, Icon, Color, LaunchType, launchCommand, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { listLogs, LOGS_REQUIRED_SCOPES, type LogEntry, type LogLevel } from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant } from "../../hooks";
import { emptyDescription } from "../../lib/scopeHint";
import { parseTimeframe } from "../../lib/parseTimeframe";
import EmptyTenantState from "../../components/EmptyTenantState";
import LogDetail from "./LogDetail";

interface CommandArguments {
  timeframe?: string;
  query?: LogLevel;
  limit?: string;
}

// Dynatrace `status` field values (aggregated loglevel):
//   ERROR → SEVERE | ERROR | CRITICAL | ALERT | FATAL | EMERGENCY
//   WARN  → WARN
//   INFO  → INFO | DEBUG | NOTICE | TRACE
//   NONE  → NONE
const LEVEL_COLORS: Record<string, Color> = {
  ERROR: Color.Red,
  WARN: Color.Yellow,
  INFO: Color.Blue,
  NONE: Color.SecondaryText,
};

function levelColor(level: string): Color {
  return LEVEL_COLORS[level.toUpperCase()] ?? Color.SecondaryText;
}

function relativeTime(timestamp: string): string {
  // Clamp: clock skew between machine and Dynatrace can put a timestamp in the future.
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  return diffMin < 60
    ? `${diffMin}m`
    : diffMin < 1440
      ? `${Math.floor(diffMin / 60)}h`
      : `${Math.floor(diffMin / 1440)}d`;
}

export default function SearchLogs(props: { arguments: CommandArguments }) {
  const { timeframe: timeframeArg, query, limit: limitArg } = props.arguments ?? {};
  const level = (query || "all") as LogLevel;
  const timeframeStr = timeframeArg || "24h";
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const { push } = useNavigation();
  const [search, setSearch] = useState("");

  const { tenant, isLoading: tenantLoading, error: tenantError } = useActiveTenant();

  const { data, isLoading, error, revalidate } = useCachedPromise(
    (lvl: LogLevel, tf: string, lim: number | undefined, tenantId: string) => {
      void tenantId; // part of the cache key so a tenant switch refetches
      return listLogs(liveTransport, tenant!, {
        level: lvl,
        timeframeDql: tf,
        timeframe: parseTimeframe(tf),
        limit: lim,
      });
    },
    [level, timeframeStr, limit, tenant?.id ?? ""],
    { execute: !!tenant, keepPreviousData: true },
  );

  const entries = useMemo<LogEntry[]>(() => {
    const all = data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((e) => e.content.toLowerCase().includes(q) || (e.service ?? "").toLowerCase().includes(q));
  }, [data, search]);

  // A corrupted tenant store must surface as an error, not as "no tenant".
  if (tenantError) {
    return (
      <List isLoading={false}>
        <List.EmptyView icon={Icon.Warning} title="Could Not Load Tenants" description={tenantError} />
      </List>
    );
  }

  if (!tenantLoading && !tenant) {
    return (
      <List isLoading={false}>
        <EmptyTenantState />
      </List>
    );
  }

  if (error && !isLoading) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Query Failed"
          description={error instanceof Error ? error.message : String(error)}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
              <Action
                title="Open Manage Tenants"
                icon={Icon.Gear}
                onAction={() => launchCommand({ name: "dt-manage-tenants", type: LaunchType.UserInitiated })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading || tenantLoading}
      searchBarPlaceholder="Filter by content or service…"
      onSearchTextChange={setSearch}
      throttle
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title="No logs found"
        description={emptyDescription(tenant, LOGS_REQUIRED_SCOPES, "Try a different log level, timeframe, or search.")}
      />
      {entries.map((entry, index) => (
        <List.Item
          key={`${entry.timestamp}-${index}`}
          icon={{ source: Icon.Document, tintColor: levelColor(entry.level) }}
          title={{
            value: `${entry.service ?? "Unknown service"} · ${relativeTime(entry.timestamp)}`,
            tooltip: entry.timestamp,
          }}
          subtitle={(() => {
            // Strip leading [service-name] prefix since the title already shows the service
            const stripped = entry.content.replace(/^\[[^\]]+\]\s*/, "");
            return stripped.length > 55 ? stripped.slice(0, 52) + "…" : stripped;
          })()}
          accessories={[
            { tag: { value: entry.status ?? entry.level, color: levelColor(entry.status ?? entry.level) } },
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Open Details"
                icon={Icon.ArrowRight}
                onAction={() => push(<LogDetail entry={entry} tenant={tenant ?? undefined} />)}
              />
              <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
              <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
