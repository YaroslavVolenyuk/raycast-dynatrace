import { List, Detail, ActionPanel, Action, Icon, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useMemo, useRef, useState } from "react";
import { liveTransport, type TenantConfig } from "../../../sdk";
import { runDql, DQL_DEFAULT_LIMIT, requiredScopesForQuery, type DqlResult } from "../../../sdk/resources";
import { emptyDescription } from "../../lib/scopeHint";
import { parseTimeframe } from "../../lib/parseTimeframe";
import {
  findTimeColumn,
  formatCell,
  pickTitleColumn,
  recordMarkdownTable,
  recordMatches,
  summarizeRecord,
  toCsv,
} from "../../lib/dqlRecord";
import { fenceCode } from "../../lib/markdown";
import { timeframeLabel } from "./timeframes";

interface DqlResultsProps {
  /** The tenant chosen in the form — not re-read from the active tenant. */
  tenant: TenantConfig;
  query: string;
  /** parseTimeframe key ("2h", "today", "start|end"); resolved on every run so Rerun moves the window. */
  timeframeKey: string;
}

const EMPTY_RESULT: DqlResult = { records: [], columns: [], truncated: false, notices: [] };

function formatTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

export default function DqlResults({ tenant, query, timeframeKey }: DqlResultsProps) {
  const { pop } = useNavigation();
  const [search, setSearch] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const abortable = useRef<AbortController>(null);

  const { data, isLoading, error, revalidate } = usePromise(
    (q: string, tf: string) =>
      runDql(liveTransport, tenant, q, { timeframe: parseTimeframe(tf), signal: abortable.current?.signal }),
    [query, timeframeKey],
    { abortable },
  );

  const result: DqlResult = data ?? EMPTY_RESULT;
  const titleColumn = pickTitleColumn(result.columns);
  const timeColumn = findTimeColumn(result.columns);

  const rows = useMemo(
    () =>
      result.records.map((record, index) => ({ record, index })).filter(({ record }) => recordMatches(record, search)),
    [result.records, search],
  );

  // Built once per result, not once per row: every row's action panel shares them.
  const allJson = useMemo(() => JSON.stringify(result.records, null, 2), [result.records]);
  const allCsv = useMemo(() => toCsv(result.records, result.columns), [result.records, result.columns]);

  const queryActions = (
    <ActionPanel.Section title="Query">
      <Action
        title="Rerun Query"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={revalidate}
      />
      <Action title="Edit Query" icon={Icon.Pencil} shortcut={{ modifiers: ["cmd"], key: "e" }} onAction={pop} />
      <Action.CopyToClipboard title="Copy DQL" content={query} shortcut={{ modifiers: ["cmd", "shift"], key: "q" }} />
    </ActionPanel.Section>
  );

  if (error && !isLoading) {
    return (
      <List navigationTitle={`${tenant.name} · ${timeframeLabel(timeframeKey)}`}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Query Failed"
          description={error.message}
          actions={<ActionPanel>{queryActions}</ActionPanel>}
        />
      </List>
    );
  }

  const period = timeframeLabel(timeframeKey);
  const navigationTitle = `${tenant.name} · ${period}`;
  // Same cap as the Dynatrace UI: 1,000 records unless the query limits itself.
  const sectionTitle = data
    ? `${result.records.length} record${result.records.length === 1 ? "" : "s"}${result.truncated ? ` — truncated (max ${DQL_DEFAULT_LIMIT.toLocaleString("en-US")} records, 1 MB), narrow the query` : ""}`
    : undefined;
  // Grail's own warnings (scan limit, sampling, truncation) in its own words.
  const sectionSubtitle = result.notices.length ? result.notices.join(" · ") : undefined;

  return (
    <List
      navigationTitle={navigationTitle}
      isLoading={isLoading}
      isShowingDetail={showDetail && rows.length > 0}
      searchBarPlaceholder="Filter records…"
      onSearchTextChange={setSearch}
      throttle
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={search ? "No matching records" : "No records"}
        description={
          search
            ? "No record contains the filter text."
            : emptyDescription(
                tenant,
                requiredScopesForQuery(query),
                `Nothing found in the selected timeframe (${period}). Try a longer one, or a from: in the query.`,
              )
        }
        actions={<ActionPanel>{queryActions}</ActionPanel>}
      />
      <List.Section title={sectionTitle} subtitle={sectionSubtitle}>
        {rows.map(({ record, index }) => {
          const time = timeColumn ? formatTime(record[timeColumn]) : undefined;
          const json = JSON.stringify(record, null, 2);
          return (
            <List.Item
              key={index}
              icon={Icon.Document}
              title={titleColumn ? formatCell(record[titleColumn], 80) : `Record ${index + 1}`}
              subtitle={showDetail ? undefined : summarizeRecord(record, result.columns, [titleColumn, timeColumn])}
              accessories={time && !showDetail ? [{ text: time }] : undefined}
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      {result.columns
                        .filter((c) => record[c] !== undefined)
                        .map((c) => (
                          <List.Item.Detail.Metadata.Label key={c} title={c} text={formatCell(record[c], 200)} />
                        ))}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Show Record"
                    icon={Icon.Eye}
                    target={
                      <Detail
                        navigationTitle={`Record ${index + 1}`}
                        markdown={`${recordMarkdownTable(record, result.columns)}\n\n${fenceCode(json, "json")}`}
                        actions={
                          <ActionPanel>
                            <Action.CopyToClipboard title="Copy Record as JSON" content={json} />
                          </ActionPanel>
                        }
                      />
                    }
                  />
                  <Action
                    title={showDetail ? "Hide Details" : "Show Details"}
                    icon={Icon.Sidebar}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                    onAction={() => setShowDetail((v) => !v)}
                  />
                  <Action.CopyToClipboard title="Copy Record as JSON" content={json} />
                  <ActionPanel.Section title="All Records">
                    <Action.CopyToClipboard
                      title="Copy All as JSON"
                      content={allJson}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy All as CSV"
                      content={allCsv}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                  </ActionPanel.Section>
                  {queryActions}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
