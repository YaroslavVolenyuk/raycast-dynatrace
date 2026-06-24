// Shown when no tenant is configured. Points the user straight at the Manage
// Tenants command to add a live environment, with extension preferences (mock
// mode) as a secondary path for previewing the UI without OAuth credentials.

import { List, ActionPanel, Action, Icon, openExtensionPreferences, launchCommand, LaunchType } from "@raycast/api";

export default function EmptyTenantState() {
  return (
    <List.EmptyView
      icon={Icon.Globe}
      title="No tenant configured"
      description="Add a Dynatrace tenant via Manage Tenants, or enable “Use Mock Data” in preferences to preview the UI."
      actions={
        <ActionPanel>
          <Action
            title="Manage Tenants"
            icon={Icon.Globe}
            onAction={() => launchCommand({ name: "dt-manage-tenants", type: LaunchType.UserInitiated })}
          />
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}
