import { Form, ActionPanel, Action, Icon, useNavigation } from "@raycast/api";
import type { LaunchProps } from "@raycast/api";
import { useEffect, useState } from "react";
import { getLastDqlQuery, getLastDqlTimeframe, setLastDqlQuery, setLastDqlTimeframe } from "../../../services";
import { useActiveTenant } from "../../hooks";
import { ManageTenantsAction } from "../../components/TenantActions";
import TenantForm from "../tenants/TenantForm";
import DqlResults from "./DqlResults";
import SuggestList from "./SuggestList";
import TemplateList from "./TemplateList";
import { useDqlVerification } from "./useDqlVerification";
import { DEFAULT_TIMEFRAME, TIMEFRAME_PRESETS } from "./timeframes";

interface RunDqlLaunchContext {
  /** Query to open the form with, e.g. from another command or a quicklink. */
  dql?: string;
}

interface FormValues {
  tenantId?: string;
  dql: string;
  timeframe: string;
  customFrom?: Date | null;
  customTo?: Date | null;
}

/**
 * Run DQL — can be launched as a top-level command (reads `launchContext.dql`)
 * or pushed from another view with `initialQuery` (e.g. from a log detail).
 */
export default function RunDql(
  props: Partial<LaunchProps<{ launchContext: RunDqlLaunchContext }>> & { initialQuery?: string },
) {
  const presetQuery = props.initialQuery ?? props.launchContext?.dql;

  const { push } = useNavigation();
  const { tenant, tenants, isLoading: tenantLoading, error: tenantError, reload: reloadTenants } = useActiveTenant();

  const [dql, setDql] = useState(presetQuery ?? "");
  const [dqlError, setDqlError] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(!presetQuery);
  /** A tenant other than the active one, picked in the dropdown; undefined follows the active tenant. */
  const [pickedTenantId, setPickedTenantId] = useState<string>();
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [rangeError, setRangeError] = useState<string | undefined>();

  // Restore the last timeframe, and the last query unless the command was opened with one.
  useEffect(() => {
    getLastDqlTimeframe()
      .then((last) => last && TIMEFRAME_PRESETS.some((p) => p.value === last) && setTimeframe(last))
      .catch(() => undefined);
    if (presetQuery) return;
    getLastDqlQuery()
      .then((last) => last && setDql((current) => current || last))
      .catch(() => undefined) // a missing history is not worth an error
      .finally(() => setHistoryLoading(false));
  }, []);

  // Follow the active tenant (also after a switch in Manage Tenants…) until the user
  // picks another one; fall back to it when the picked tenant was deleted.
  const tenantId = pickedTenantId && tenants.some((t) => t.id === pickedTenantId) ? pickedTenantId : (tenant?.id ?? "");

  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? tenant;
  const verification = useDqlVerification(selectedTenant, dql);
  // Only show an error that belongs to the text as it is now, not to an older version.
  const syntaxError = verification.checkedQuery === dql.trim() ? verification.error : undefined;

  function handleSubmit(values: FormValues) {
    const query = values.dql.trim();
    if (!query) {
      setDqlError("Enter a DQL query");
      return;
    }
    if (syntaxError) return; // already shown under the field; running it would only fail
    const selected = tenants.find((t) => t.id === (values.tenantId ?? tenantId)) ?? tenant;
    if (!selected) return;

    let timeframeKey = values.timeframe;
    if (values.timeframe === "custom") {
      if (!values.customFrom || !values.customTo || values.customFrom >= values.customTo) {
        setRangeError("Pick a start before the end");
        return;
      }
      timeframeKey = `${values.customFrom.toISOString()}|${values.customTo.toISOString()}`;
    }

    void setLastDqlQuery(query).catch(() => undefined);
    if (values.timeframe !== "custom") void setLastDqlTimeframe(values.timeframe).catch(() => undefined);
    push(<DqlResults tenant={selected} query={query} timeframeKey={timeframeKey} />);
  }

  if (tenantError) {
    return (
      <Form
        actions={
          <ActionPanel>
            <ManageTenantsAction onChanged={reloadTenants} />
          </ActionPanel>
        }
      >
        <Form.Description title="Could Not Load Tenants" text={tenantError} />
      </Form>
    );
  }

  if (!tenantLoading && !tenant) {
    return (
      <Form
        actions={
          <ActionPanel>
            <Action title="Add Tenant" icon={Icon.Plus} onAction={() => push(<TenantForm onSaved={reloadTenants} />)} />
            <ManageTenantsAction onChanged={reloadTenants} />
          </ActionPanel>
        }
      >
        <Form.Description
          title="No Tenant Configured"
          text="Add a Dynatrace environment with a platform token or an OAuth client."
        />
      </Form>
    );
  }

  return (
    <Form
      isLoading={tenantLoading || historyLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Query" icon={Icon.Play} onSubmit={handleSubmit} />
          {selectedTenant && (
            <Action
              title="Suggest Next…"
              icon={Icon.LightBulb}
              shortcut={{ modifiers: ["cmd"], key: "." }}
              onAction={() => push(<SuggestList tenant={selectedTenant} query={dql} onChange={setDql} />)}
            />
          )}
          <Action
            title="Insert Template…"
            icon={Icon.Code}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => push(<TemplateList currentQuery={dql} onPick={setDql} />)}
          />
          <Action
            title="Clear Query"
            icon={Icon.Trash}
            shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
            onAction={() => setDql("")}
          />
          <ManageTenantsAction onChanged={reloadTenants} />
        </ActionPanel>
      }
    >
      {tenants.length > 1 && (
        <Form.Dropdown
          id="tenantId"
          title="Tenant"
          value={tenantId}
          // Also called with the initial value on mount: picking the active tenant is not a choice to stick to.
          onChange={(id) => setPickedTenantId(id === tenant?.id ? undefined : id)}
        >
          {tenants.map((t) => (
            <Form.Dropdown.Item key={t.id} value={t.id} title={t.name} />
          ))}
        </Form.Dropdown>
      )}

      <Form.Dropdown
        id="timeframe"
        title="Timeframe"
        value={timeframe}
        onChange={(v) => {
          setTimeframe(v);
          setRangeError(undefined);
        }}
      >
        <Form.Dropdown.Section>
          {TIMEFRAME_PRESETS.map((p) => (
            <Form.Dropdown.Item key={p.value} value={p.value} title={p.title} />
          ))}
        </Form.Dropdown.Section>
        <Form.Dropdown.Section>
          <Form.Dropdown.Item value="custom" title="Custom Range…" />
        </Form.Dropdown.Section>
      </Form.Dropdown>

      {timeframe === "custom" && (
        <>
          <Form.DatePicker id="customFrom" title="From" error={rangeError} onChange={() => setRangeError(undefined)} />
          <Form.DatePicker id="customTo" title="To" onChange={() => setRangeError(undefined)} />
        </>
      )}

      <Form.TextArea
        id="dql"
        title="Query"
        placeholder={'fetch logs\n// Add filters by: | filter matchesValue(field, "value")\n| sort timestamp desc'}
        info="A from: / to: inside the query takes precedence over the timeframe. Like Dynatrace, results are capped at 1,000 records — add | limit to get fewer. Every run is a billable Grail query (scanned data counts, up to 100 GB per query): prefer short timeframes and filter early. A query still running after 3 minutes is canceled. ⌘. suggests what can come next, ⌘T inserts a template."
        value={dql}
        error={dqlError ?? syntaxError}
        onChange={(v) => {
          setDql(v);
          if (dqlError && v.trim()) setDqlError(undefined);
        }}
      />
    </Form>
  );
}
