// Tenant actions for the work commands (Search Logs, Search Traces, Run DQL):
// switch the active tenant and open Manage Tenants without leaving the command.
// They live in the action panel because the search bar dropdown already holds
// each command's own filter.

import { Action, ActionPanel, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import type { TenantConfig } from "../../sdk/auth";
import { setActiveTenant } from "../../services/tenants";
import ManageTenants from "../commands/tenants/ManageTenants";

interface TenantActionsProps {
  tenant: TenantConfig | null;
  tenants: TenantConfig[];
  /** Called after a switch, and when Manage Tenants is closed. */
  onChanged: () => void;
}

export function ManageTenantsAction({ onChanged }: Pick<TenantActionsProps, "onChanged">) {
  const { push } = useNavigation();
  return (
    <Action
      title="Manage Tenants…"
      icon={Icon.Gear}
      shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
      onAction={() => push(<ManageTenants />, onChanged)}
    />
  );
}

export default function TenantActions({ tenant, tenants, onChanged }: TenantActionsProps) {
  return (
    <ActionPanel.Section title="Tenant">
      {tenants.length > 1 && (
        <ActionPanel.Submenu
          title="Switch Tenant"
          icon={Icon.Switch}
          shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
        >
          {tenants.map((t) => (
            <Action
              key={t.id}
              title={t.name}
              icon={t.id === tenant?.id ? Icon.Checkmark : undefined}
              onAction={async () => {
                if (t.id === tenant?.id) return;
                await setActiveTenant(t.id);
                await showToast({ style: Toast.Style.Success, title: "Active tenant set", message: t.name });
                onChanged();
              }}
            />
          ))}
        </ActionPanel.Submenu>
      )}
      <ManageTenantsAction onChanged={onChanged} />
    </ActionPanel.Section>
  );
}
