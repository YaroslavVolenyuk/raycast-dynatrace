// Shown when no tenant is configured. Points the user straight at the Manage
// Tenants command to add a live environment.

import { List, ActionPanel, Action, Icon, launchCommand, LaunchType } from "@raycast/api";

export default function EmptyTenantState() {
  return (
    <List.EmptyView
      icon={Icon.Globe}
      title="No tenant configured"
      description="Add a Dynatrace tenant via Manage Tenants."
      actions={
        <ActionPanel>
          <Action
            title="Manage Tenants"
            icon={Icon.Globe}
            onAction={() => launchCommand({ name: "dt-manage-tenants", type: LaunchType.UserInitiated })}
          />
        </ActionPanel>
      }
    />
  );
}
