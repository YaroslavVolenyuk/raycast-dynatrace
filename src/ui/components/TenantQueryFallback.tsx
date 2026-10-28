// The views Search Logs and Search Traces show instead of their results: the
// tenants could not be loaded, none is configured, or the query failed.

import { Action, ActionPanel, Icon, List } from "@raycast/api";
import type { TenantConfig } from "../../sdk/auth";
import EmptyTenantState from "./EmptyTenantState";
import { ManageTenantsAction } from "./TenantActions";

interface TenantQueryState {
  tenant: TenantConfig | null;
  tenantLoading: boolean;
  tenantError: string | null;
  reloadTenants: () => void;
  isLoading: boolean;
  error: unknown;
  revalidate: () => void;
  tenantActions: ActionPanel.Props["children"];
}

/** The view to show in place of the results list, or null to show the list. */
export function tenantQueryFallback(state: TenantQueryState) {
  // A corrupted tenant store must surface as an error, not as "no tenant".
  if (state.tenantError) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could Not Load Tenants"
          description={state.tenantError}
          actions={
            <ActionPanel>
              <ManageTenantsAction onChanged={state.reloadTenants} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!state.tenantLoading && !state.tenant) {
    return (
      <List isLoading={false}>
        <EmptyTenantState onChanged={state.reloadTenants} />
      </List>
    );
  }

  if (state.error && !state.isLoading) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Query Failed"
          description={state.error instanceof Error ? state.error.message : String(state.error)}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => state.revalidate()} />
              {state.tenantActions}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return null;
}
