import { List, ActionPanel, Action, Icon, Color, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { listSpans, formatDuration, type SpanEntry, type SpanStatus } from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant } from "../../hooks";
import { parseTimeframe } from "../../lib/parseTimeframe";
import EmptyTenantState from "../../components/EmptyTenantState";
import TraceDetail from "./TraceDetail";

interface CommandArguments {
  timeframe?: string;
  /** Pre-filter to a specific trace ID (used when navigating from a log entry). */
  traceId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, Color> = {
  ERROR: Color.Red,
  OK: Color.Green,
  UNSET: Color.SecondaryText,
};

function statusColor(code: string): Color {
  return STATUS_COLORS[code.toUpperCase()] ?? Color.SecondaryText;
}

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

function relativeTime(timestamp: string): string {
  const diffMin = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
  return diffMin < 60
    ? `${diffMin}m`
    : diffMin < 1440
      ? `${Math.floor(diffMin / 60)}h`
      : `${Math.floor(diffMin / 1440)}d`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SearchTraces — can be launched as a top-level command (reads `arguments`) or
 * pushed via navigation from LogDetail (pass `initialTraceId` prop directly).
 */
export default function SearchTraces(props: { arguments?: CommandArguments; initialTraceId?: string }) {
  const { timeframe: timeframeArg, traceId: traceIdArg } = props.arguments ?? {};
  const timeframeStr = timeframeArg || "24h";
  // initialTraceId takes priority (log → trace navigation); fall back to argument
  const initialTraceId = props.initialTraceId ?? traceIdArg;

  const { push } = useNavigation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SpanStatus>("all");

  const { tenant, isLoading: tenantLoading, error: tenantError } = useActiveTenant();

  const { data, isLoading, error, revalidate } = useCachedPromise(
    (tf: string, tid: string | undefined, st: SpanStatus, tenantId: string) => {
      void tenantId;
      return listSpans(liveTransport, tenant!, {
        timeframeDql: tf,
        timeframe: parseTimeframe(tf),
        traceId: tid,
        status: st,
      });
    },
    [timeframeStr, initialTraceId, status, tenant?.id ?? ""],
    { execute: !!tenant, keepPreviousData: true },
  );

  const entries = useMemo<SpanEntry[]>(() => {
    const all = data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.service ?? "").toLowerCase().includes(q) || e.traceId.includes(q),
    );
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
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const navigationTitle = initialTraceId ? `Trace ${initialTraceId.slice(0, 8)}…` : undefined;

  return (
    <List
      isLoading={isLoading || tenantLoading}
      {...(navigationTitle ? { navigationTitle } : {})}
      searchBarPlaceholder="Filter by operation, service, or trace ID…"
      onSearchTextChange={setSearch}
      searchBarAccessory={
        <List.Dropdown tooltip="Span status" value={status} onChange={(v) => setStatus(v as SpanStatus)}>
          <List.Dropdown.Item title="All Statuses" value="all" />
          <List.Dropdown.Item title="Error" value="error" />
          <List.Dropdown.Item title="OK" value="ok" />
          <List.Dropdown.Item title="Unset" value="unset" />
        </List.Dropdown>
      }
      throttle
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title="No spans found"
        description="Try a different timeframe or remove the trace filter."
      />
      {entries.map((entry, index) => (
        <List.Item
          key={`${entry.traceId}-${entry.spanId}-${index}`}
          icon={{ source: kindIcon(entry.kind), tintColor: statusColor(entry.statusCode) }}
          title={entry.service ?? "Unknown service"}
          subtitle={entry.name.length > 55 ? entry.name.slice(0, 52) + "…" : entry.name}
          accessories={[
            ...(entry.durationUs != null
              ? [
                  {
                    icon: Icon.Clock,
                    text: formatDuration(entry.durationUs),
                    tooltip: `Duration: ${formatDuration(entry.durationUs)}`,
                  },
                ]
              : []),
            { text: relativeTime(entry.startTime), tooltip: entry.startTime },
            { tag: { value: entry.statusCode, color: statusColor(entry.statusCode) } },
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Open Details"
                icon={Icon.ArrowRight}
                onAction={() => push(<TraceDetail entry={entry} tenant={tenant ?? undefined} />)}
              />
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
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
