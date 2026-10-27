import { List, ActionPanel, Action, Icon, Color, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useRef, useState } from "react";
import { listLogs, LOG_MAX_LIMIT, LOG_PAGE_SIZE, LOGS_REQUIRED_SCOPES, type LogLevel } from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant, useDebouncedValue } from "../../hooks";
import { emptyDescription } from "../../lib/scopeHint";
import { parseTimeframe } from "../../lib/parseTimeframe";
import {
  LOG_LEVELS,
  TIMEFRAMES,
  pickLevel,
  pickLimit,
  pickTimeframe,
  timeframeTitle,
  type TimeframeValue,
} from "../../lib/listArgs";
import EmptyTenantState from "../../components/EmptyTenantState";
import TenantActions, { ManageTenantsAction } from "../../components/TenantActions";
import LogDetail from "./LogDetail";

interface CommandArguments {
  timeframe?: string;
  query?: string;
  limit?: string;
}

/** Server-side search runs a billable query, so wait for the user to stop typing. */
const SEARCH_DEBOUNCE_MS = 500;

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
  const args = props.arguments ?? {};

  const { push } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const [level, setLevel] = useState<LogLevel>(() => pickLevel(args.query));
  const [timeframe, setTimeframe] = useState<TimeframeValue>(() => pickTimeframe(args.timeframe));
  const initialLimit = pickLimit(args.limit, LOG_MAX_LIMIT) ?? LOG_PAGE_SIZE;
  const [loadedMore, setLoadedMore] = useState<{ key: string; limit: number }>();
  const abortable = useRef<AbortController>(null);

  const { tenant, tenants, isLoading: tenantLoading, error: tenantError, reload: reloadTenants } = useActiveTenant();
  const tenantActions = <TenantActions tenant={tenant} tenants={tenants} onChanged={reloadTenants} />;

  // Load More raises the limit for the current search only: a new search text,
  // level, timeframe or tenant starts again at the first page, not at up to 1,000
  // billable records per keystroke.
  const searchKey = JSON.stringify([search, level, timeframe, tenant?.id]);
  const limit = loadedMore?.key === searchKey ? loadedMore.limit : initialLimit;

  const {
    data: fetched,
    isLoading,
    error,
    revalidate,
  } = usePromise(
    async (lvl: LogLevel, tf: TimeframeValue, lim: number, q: string, tenantId: string) => {
      const page = await listLogs(liveTransport, tenant!, {
        level: lvl,
        timeframeDql: tf,
        timeframe: parseTimeframe(tf),
        limit: lim,
        search: q,
        signal: abortable.current?.signal,
      });
      return { ...page, tenantId };
    },
    [level, timeframe, limit, search, tenant?.id ?? ""],
    { execute: !!tenant, abortable },
  );

  // usePromise keeps the previous result while the next one loads: after a tenant
  // switch that would list the old tenant's logs under the new tenant's name.
  const data = fetched?.tenantId === tenant?.id ? fetched : undefined;
  const entries = data?.entries ?? [];
  const skipped = data?.skipped ?? 0;
  // A full page means more logs probably exist in the timeframe.
  const canLoadMore = entries.length + skipped >= limit && limit < LOG_MAX_LIMIT;

  // The tenant goes in the section title: Raycast asks root commands to keep their navigation title.
  const sectionTitle = data
    ? [
        `${entries.length} log${entries.length === 1 ? "" : "s"}`,
        timeframeTitle(timeframe),
        search ? `“${search}”` : undefined,
        tenant?.name,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const sectionSubtitle = skipped
    ? `${skipped} record${skipped === 1 ? "" : "s"} could not be read`
    : canLoadMore
      ? "More available — ⌘L to load more"
      : undefined;

  const listActions = (
    <ActionPanel.Section>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={() => revalidate()}
      />
      {canLoadMore && (
        <Action
          title="Load More"
          icon={Icon.Plus}
          shortcut={{ modifiers: ["cmd"], key: "l" }}
          onAction={() => setLoadedMore({ key: searchKey, limit: Math.min(limit + LOG_PAGE_SIZE, LOG_MAX_LIMIT) })}
        />
      )}
      <ActionPanel.Submenu
        title="Change Timeframe"
        icon={Icon.Clock}
        shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
      >
        {TIMEFRAMES.map((t) => (
          <Action
            key={t.value}
            title={t.title}
            icon={t.value === timeframe ? Icon.Checkmark : undefined}
            onAction={() => setTimeframe(t.value)}
          />
        ))}
      </ActionPanel.Submenu>
    </ActionPanel.Section>
  );
  const allListActions = (
    <>
      {listActions}
      {tenantActions}
    </>
  );

  // A corrupted tenant store must surface as an error, not as "no tenant".
  if (tenantError) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could Not Load Tenants"
          description={tenantError}
          actions={
            <ActionPanel>
              <ManageTenantsAction onChanged={reloadTenants} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!tenantLoading && !tenant) {
    return (
      <List isLoading={false}>
        <EmptyTenantState onChanged={reloadTenants} />
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
              {tenantActions}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading || tenantLoading}
      searchBarPlaceholder="Search log content or service in Dynatrace…"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Log level" value={level} onChange={(v) => setLevel(pickLevel(v))}>
          {LOG_LEVELS.map((l) => (
            <List.Dropdown.Item key={l.value} title={l.title} value={l.value} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={searchText.trim() !== search ? "Searching…" : "No logs found"}
        description={emptyDescription(
          tenant,
          LOGS_REQUIRED_SCOPES,
          `Nothing in ${timeframeTitle(timeframe).toLowerCase()}. Try another level, a longer timeframe (⌘⇧T), or different search text.`,
        )}
        actions={<ActionPanel>{allListActions}</ActionPanel>}
      />
      <List.Section title={sectionTitle} subtitle={sectionSubtitle}>
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
                  onAction={() => push(<LogDetail entry={entry} tenant={tenant ?? undefined} timeframe={timeframe} />)}
                />
                <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
                <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
                {allListActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
