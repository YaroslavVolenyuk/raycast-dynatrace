import { List, ActionPanel, Action, Icon, useNavigation, Keyboard } from "@raycast/api";
import { useMemo, useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import {
  listSpans,
  formatDuration,
  SPANS_REQUIRED_SCOPES,
  type SpanEntry,
  type SpanStatus,
} from "../../../sdk/resources";
import { liveTransport } from "../../../sdk";
import { useActiveTenant, useTenantQuery } from "../../hooks";
import { emptyDescription } from "../../lib/scopeHint";
import { parseTimeframe } from "../../lib/parseTimeframe";
import { severityIcon, severityOf } from "../../lib/svg";
import { pickTimeframe, stringArg, timeframeTitle, type TimeframeValue } from "../../lib/listArgs";
import { listSectionSubtitle, listSectionTitle } from "../../lib/sectionTitle";
import TenantActions from "../../components/TenantActions";
import { tenantQueryFallback } from "../../components/TenantQueryFallback";
import TimeframeSubmenu from "../../components/TimeframeSubmenu";
import { copyTraceSpanActions } from "../../components/TraceBlocks";
import TraceDetail from "./TraceDetail";

interface CommandArguments {
  timeframe?: string;
  /** Pre-filter to a specific trace ID (used when navigating from a log entry). */
  traceId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SpanItem(props: { entry: SpanEntry; onOpen: () => void; listActions: ActionPanel.Props["children"] }) {
  const { entry } = props;
  const duration = entry.durationUs != null ? formatDuration(entry.durationUs) : undefined;
  const service = entry.service ?? "Unknown service";
  return (
    <List.Item
      icon={{ value: severityIcon(severityOf(entry.statusCode)), tooltip: `${entry.statusCode} · ${entry.kind}` }}
      title={{
        value: duration !== undefined ? `${duration} · ${service}` : service,
        tooltip: new Date(entry.startTime).toLocaleString(),
      }}
      subtitle={entry.name.length > 120 ? entry.name.slice(0, 117) + "…" : entry.name}
      actions={
        <ActionPanel>
          <Action title="Open Details" icon={Icon.ArrowRight} onAction={props.onOpen} />
          {copyTraceSpanActions(entry.traceId, entry.spanId)}
          {props.listActions}
        </ActionPanel>
      }
    />
  );
}

function fetchSpans(
  tenant: TenantConfig,
  [tf, tid, st]: [TimeframeValue, string | undefined, SpanStatus],
  signal: AbortSignal | undefined,
) {
  return listSpans(liveTransport, tenant, {
    timeframeDql: tf,
    timeframe: parseTimeframe(tf),
    traceId: tid,
    status: st,
    signal,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SearchTraces — can be launched as a top-level command (reads `arguments`) or
 * pushed via navigation from LogDetail (pass `initialTraceId` and the log
 * search's `initialTimeframe` directly).
 */
export default function SearchTraces(props: {
  arguments?: CommandArguments;
  initialTraceId?: string;
  initialTimeframe?: TimeframeValue;
}) {
  const { timeframe: timeframeArg, traceId: traceIdArg } = props.arguments ?? {};
  const [timeframeStr, setTimeframe] = useState<TimeframeValue>(
    () => props.initialTimeframe ?? pickTimeframe(timeframeArg),
  );
  // initialTraceId takes priority (log → trace navigation); fall back to argument
  const initialTraceId = props.initialTraceId ?? stringArg(traceIdArg);

  const { push } = useNavigation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SpanStatus>("all");

  const { tenant, tenants, isLoading: tenantLoading, error: tenantError, reload: reloadTenants } = useActiveTenant();
  const tenantActions = <TenantActions tenant={tenant} tenants={tenants} onChanged={reloadTenants} />;

  const { data, isLoading, error, revalidate } = useTenantQuery(tenant, fetchSpans, [
    timeframeStr,
    initialTraceId,
    status,
  ]);

  const skipped = data?.skipped ?? 0;
  const entries = useMemo<SpanEntry[]>(() => {
    const all = data?.entries ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.service ?? "").toLowerCase().includes(q) || e.traceId.includes(q),
    );
  }, [data, search]);

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

  // Only the view pushed from a log detail gets its own title: Raycast asks root
  // commands to keep theirs, so the tenant goes in the section title instead.
  const navigationTitle = props.initialTraceId ? `Trace ${props.initialTraceId.slice(0, 8)}…` : undefined;
  const sectionTitle = data
    ? listSectionTitle(entries.length, "span", [timeframeTitle(timeframeStr), tenant?.name])
    : undefined;
  const timeframeActions = <TimeframeSubmenu value={timeframeStr} onChange={setTimeframe} />;
  const sectionSubtitle = listSectionSubtitle(skipped);

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
          "Try a longer timeframe (⌘⇧T) or remove the trace filter.",
        )}
        actions={
          <ActionPanel>
            {timeframeActions}
            {tenantActions}
          </ActionPanel>
        }
      />
      <List.Section title={sectionTitle} subtitle={sectionSubtitle}>
        {entries.map((entry, index) => (
          <SpanItem
            key={`${entry.traceId}-${entry.spanId}-${index}`}
            entry={entry}
            onOpen={() => push(<TraceDetail entry={entry} tenant={tenant ?? undefined} />)}
            listActions={
              <>
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={() => revalidate()}
                />
                {timeframeActions}
                {tenantActions}
              </>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
