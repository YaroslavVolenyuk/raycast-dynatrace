import { List, ActionPanel, Action, Icon, useNavigation, Keyboard } from "@raycast/api";
import { useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import {
  listLogs,
  LOG_MAX_LIMIT,
  LOG_PAGE_SIZE,
  LOGS_REQUIRED_SCOPES,
  type LogEntry,
  type LogLevel,
} from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant, useDebouncedValue, usePagedLimit, useTenantQuery } from "../../hooks";
import { emptyDescription } from "../../lib/scopeHint";
import { parseTimeframe } from "../../lib/parseTimeframe";
import { logSeverity, severityIcon } from "../../lib/svg";
import {
  LOG_LEVELS,
  pickLevel,
  pickLimit,
  pickTimeframe,
  timeframeTitle,
  type TimeframeValue,
} from "../../lib/listArgs";
import { listSectionSubtitle, listSectionTitle } from "../../lib/sectionTitle";
import TenantActions from "../../components/TenantActions";
import { tenantQueryFallback } from "../../components/TenantQueryFallback";
import TimeframeSubmenu from "../../components/TimeframeSubmenu";
import LogDetail from "./LogDetail";

interface CommandArguments {
  timeframe?: string;
  query?: string;
  limit?: string;
}

/** Server-side search runs a billable query, so wait for the user to stop typing. */
const SEARCH_DEBOUNCE_MS = 500;

function relativeTime(timestamp: string): string {
  // Clamp: clock skew between machine and Dynatrace can put a timestamp in the future.
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  return `${Math.floor(diffMin / 1440)}d`;
}

function logSubtitle(content: string): string {
  // Strip leading [service-name] prefix since the title already shows the service
  const stripped = content.replace(/^\[[^\]]+\]\s*/, "");
  return stripped.length > 120 ? stripped.slice(0, 117) + "…" : stripped;
}

function LogItem(props: { entry: LogEntry; onOpen: () => void; listActions: ActionPanel.Props["children"] }) {
  const { entry } = props;
  return (
    <List.Item
      icon={{ value: severityIcon(logSeverity(entry.status, entry.level)), tooltip: entry.status || entry.level }}
      title={{
        value: `${relativeTime(entry.timestamp)} · ${entry.service ?? "Unknown service"}`,
        tooltip: new Date(entry.timestamp).toLocaleString(),
      }}
      subtitle={logSubtitle(entry.content)}
      actions={
        <ActionPanel>
          <Action title="Open Details" icon={Icon.ArrowRight} onAction={props.onOpen} />
          <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
          <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
          {props.listActions}
        </ActionPanel>
      }
    />
  );
}

function fetchLogs(
  tenant: TenantConfig,
  [lvl, tf, lim, q]: [LogLevel, TimeframeValue, number, string],
  signal: AbortSignal | undefined,
) {
  return listLogs(liveTransport, tenant, {
    level: lvl,
    timeframeDql: tf,
    timeframe: parseTimeframe(tf),
    limit: lim,
    search: q,
    signal,
  });
}

export default function SearchLogs(props: { arguments: CommandArguments }) {
  const args = props.arguments ?? {};

  const { push } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const [level, setLevel] = useState<LogLevel>(() => pickLevel(args.query));
  const [timeframe, setTimeframe] = useState<TimeframeValue>(() => pickTimeframe(args.timeframe));
  const initialLimit = pickLimit(args.limit, LOG_MAX_LIMIT) ?? LOG_PAGE_SIZE;

  const { tenant, tenants, isLoading: tenantLoading, error: tenantError, reload: reloadTenants } = useActiveTenant();
  const tenantActions = <TenantActions tenant={tenant} tenants={tenants} onChanged={reloadTenants} />;

  // Load More raises the limit for the current search only: a new search text,
  // level, timeframe or tenant starts again at the first page, not at up to 1,000
  // billable records per keystroke.
  const searchKey = JSON.stringify([search, level, timeframe, tenant?.id]);
  const {
    limit,
    canLoadMore: hasMore,
    loadMore,
  } = usePagedLimit(searchKey, initialLimit, LOG_PAGE_SIZE, LOG_MAX_LIMIT);

  const { data, isLoading, error, revalidate } = useTenantQuery(tenant, fetchLogs, [level, timeframe, limit, search]);

  const entries = data?.entries ?? [];
  const skipped = data?.skipped ?? 0;
  // A full page means more logs probably exist in the timeframe.
  const canLoadMore = hasMore(entries.length + skipped);

  // The tenant goes in the section title: Raycast asks root commands to keep their navigation title.
  const sectionTitle = data
    ? listSectionTitle(entries.length, "log", [
        timeframeTitle(timeframe),
        search ? `“${search}”` : undefined,
        tenant?.name,
      ])
    : undefined;
  const sectionSubtitle = listSectionSubtitle(skipped, canLoadMore);

  const listActions = (
    <ActionPanel.Section>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => revalidate()}
      />
      {canLoadMore && (
        <Action title="Load More" icon={Icon.Plus} shortcut={{ modifiers: ["cmd"], key: "l" }} onAction={loadMore} />
      )}
      <TimeframeSubmenu value={timeframe} onChange={setTimeframe} />
    </ActionPanel.Section>
  );
  const allListActions = (
    <>
      {listActions}
      {tenantActions}
    </>
  );

  const fallback = tenantQueryFallback({
    tenant,
    tenantLoading,
    tenantError,
    reloadTenants,
    isLoading,
    error,
    revalidate,
    tenantActions,
  });
  if (fallback) return fallback;

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
          <LogItem
            key={`${entry.timestamp}-${index}`}
            entry={entry}
            onOpen={() => push(<LogDetail entry={entry} tenant={tenant ?? undefined} timeframe={timeframe} />)}
            listActions={allListActions}
          />
        ))}
      </List.Section>
    </List>
  );
}
