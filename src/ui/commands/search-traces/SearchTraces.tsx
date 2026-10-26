import { List, ActionPanel, Action, Icon, Color, LaunchType, launchCommand, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import {
  listSpans,
  formatDuration,
  SPANS_REQUIRED_SCOPES,
  type SpanEntry,
  type SpanStatus,
} from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant } from "../../hooks";
import { emptyDescription } from "../../lib/scopeHint";
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

  const { data, isLoading, error, revalidate } = usePromise(
    (tf: string, tid: string | undefined, st: SpanStatus, tenantId: string) => {
      void tenantId; // in the deps so a tenant switch refetches
      return listSpans(liveTransport, tenant!, {
        timeframeDql: tf,
        timeframe: parseTimeframe(tf),
        traceId: tid,
        status: st,
      });
    },
    [timeframeStr, initialTraceId, status, tenant?.id ?? ""],
    { execute: !!tenant },
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
        description={emptyDescription(
          tenant,
          SPANS_REQUIRED_SCOPES,
          "Try a different timeframe or remove the trace filter.",
        )}
      />
      {entries.map((entry, index) => (
        <List.Item
          key={`${entry.traceId}-${entry.spanId}-${index}`}
          icon={{ source: kindIcon(entry.kind), tintColor: statusColor(entry.statusCode) }}
          title={{
            value: `${entry.service ?? "Unknown service"}${entry.durationUs != null ? ` · ${formatDuration(entry.durationUs)}` : ""}`,
            tooltip: entry.durationUs != null ? `Duration: ${formatDuration(entry.durationUs)}` : undefined,
          }}
          subtitle={entry.name.length > 55 ? entry.name.slice(0, 52) + "…" : entry.name}
          accessories={[{ tag: { value: entry.statusCode, color: statusColor(entry.statusCode) } }]}
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
