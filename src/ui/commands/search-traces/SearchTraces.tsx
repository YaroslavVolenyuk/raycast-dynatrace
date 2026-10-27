import { List, ActionPanel, Action, Icon, Color, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useMemo, useRef, useState } from "react";
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
import { pickTimeframe, timeframeTitle, type TimeframeValue } from "../../lib/listArgs";
import EmptyTenantState from "../../components/EmptyTenantState";
import TenantActions, { ManageTenantsAction } from "../../components/TenantActions";
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
  const timeframeStr = pickTimeframe(timeframeArg);
  // initialTraceId takes priority (log → trace navigation); fall back to argument
  const initialTraceId = props.initialTraceId ?? traceIdArg;

  const { push } = useNavigation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SpanStatus>("all");
  const abortable = useRef<AbortController>(null);

  const { tenant, tenants, isLoading: tenantLoading, error: tenantError, reload: reloadTenants } = useActiveTenant();
  const tenantActions = <TenantActions tenant={tenant} tenants={tenants} onChanged={reloadTenants} />;

  const {
    data: fetched,
    isLoading,
    error,
    revalidate,
  } = usePromise(
    async (tf: TimeframeValue, tid: string | undefined, st: SpanStatus, tenantId: string) => {
      const page = await listSpans(liveTransport, tenant!, {
        timeframeDql: tf,
        timeframe: parseTimeframe(tf),
        traceId: tid,
        status: st,
        signal: abortable.current?.signal,
      });
      return { ...page, tenantId };
    },
    [timeframeStr, initialTraceId, status, tenant?.id ?? ""],
    { execute: !!tenant, abortable },
  );

  // usePromise keeps the previous result while the next one loads: after a tenant
  // switch that would list the old tenant's spans under the new tenant's name.
  const data = fetched?.tenantId === tenant?.id ? fetched : undefined;
  const skipped = data?.skipped ?? 0;
  const entries = useMemo<SpanEntry[]>(() => {
    const all = data?.entries ?? [];
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

  const navigationTitle = [initialTraceId ? `Trace ${initialTraceId.slice(0, 8)}…` : "Search Traces", tenant?.name]
    .filter(Boolean)
    .join(" · ");
  const sectionTitle = data
    ? `${entries.length} span${entries.length === 1 ? "" : "s"} · ${timeframeTitle(timeframeStr)}`
    : undefined;
  const sectionSubtitle = skipped ? `${skipped} record${skipped === 1 ? "" : "s"} could not be read` : undefined;

  return (
    <List
      isLoading={isLoading || tenantLoading}
      navigationTitle={navigationTitle}
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
        actions={<ActionPanel>{tenantActions}</ActionPanel>}
      />
      <List.Section title={sectionTitle} subtitle={sectionSubtitle}>
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
                  shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                />
                <Action.CopyToClipboard
                  title="Copy Span ID"
                  content={entry.spanId}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={() => revalidate()}
                />
                {tenantActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
