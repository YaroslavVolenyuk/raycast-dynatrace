import { List, ActionPanel, Action, Icon, Color, getPreferenceValues, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { listLogs, type LogEntry, type LogLevel } from "../../../sdk/resources";
import { resolveTransport } from "../../../services";
import { useActiveTenant } from "../../hooks";
import { parseTimeframe } from "../../lib/parseTimeframe";
import { MOCK_TENANT } from "../../../mocks";
import EmptyTenantState from "../../components/EmptyTenantState";
import LogDetail from "./LogDetail";

interface CommandArguments {
  timeframeValue?: string;
  timeframeUnit?: "m" | "h" | "d";
  query?: LogLevel;
}

const LEVEL_COLORS: Record<string, Color> = {
  ERROR: Color.Red,
  FATAL: Color.Red,
  WARN: Color.Yellow,
  WARNING: Color.Yellow,
  INFO: Color.Blue,
  DEBUG: Color.SecondaryText,
};

function levelColor(level: string): Color {
  return LEVEL_COLORS[level.toUpperCase()] ?? Color.SecondaryText;
}

function relativeTime(timestamp: string): string {
  const diffMin = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
  const raw = diffMin < 60 ? `${diffMin}m` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h` : `${Math.floor(diffMin / 1440)}d`;
  return raw.padStart(3, " ");
}

export default function SearchLogs(props: { arguments: CommandArguments }) {
  const { timeframeValue, timeframeUnit, query } = props.arguments ?? {};
  const level = (query || "all") as LogLevel;
  const timeframeStr = timeframeValue ? `${timeframeValue}${timeframeUnit || "h"}` : "24h";

  const { push } = useNavigation();
  const [search, setSearch] = useState("");

  const { useMockData } = getPreferenceValues<{ useMockData?: boolean }>();
  const { tenant: activeTenant, isLoading: tenantLoading } = useActiveTenant();
  // In mock mode the MockTransport ignores the tenant, so a placeholder lets the
  // command run end-to-end before the Manage Tenants command exists.
  const tenant = activeTenant ?? (useMockData ? MOCK_TENANT : null);

  const { data, isLoading, error, revalidate } = useCachedPromise(
    (lvl: LogLevel, tf: string, tenantId: string) => {
      void tenantId; // part of the cache key so a tenant switch refetches
      return listLogs(resolveTransport(), tenant!, { level: lvl, timeframe: parseTimeframe(tf) });
    },
    [level, timeframeStr, tenant?.id ?? ""],
    { execute: !!tenant, keepPreviousData: true },
  );

  const entries = useMemo<LogEntry[]>(() => {
    const all = data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((e) => e.content.toLowerCase().includes(q) || (e.service ?? "").toLowerCase().includes(q));
  }, [data, search]);

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
        description="Try a different log level, timeframe, or search."
      />
      {entries.map((entry, index) => (
        <List.Item
          key={`${entry.timestamp}-${index}`}
          icon={{ source: Icon.Document, tintColor: levelColor(entry.level) }}
          title={entry.service ?? "Unknown service"}
          subtitle={entry.content.length > 80 ? entry.content.slice(0, 77) + "…" : entry.content}
          accessories={[
            { icon: Icon.Clock, text: relativeTime(entry.timestamp), tooltip: entry.timestamp },
            { tag: { value: entry.level, color: levelColor(entry.level) } },
          ]}
          actions={
            <ActionPanel>
              <Action title="Open Details" icon={Icon.ArrowRight} onAction={() => push(<LogDetail entry={entry} />)} />
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
