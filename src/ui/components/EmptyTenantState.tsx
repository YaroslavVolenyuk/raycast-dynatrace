// Shown when no tenant is configured. Until the Manage Tenants command lands,
// it points users at the extension preferences (where mock mode can be enabled
// to preview the UI without an OAuth tenant).

import { List, ActionPanel, Action, Icon, openExtensionPreferences } from "@raycast/api";

export default function EmptyTenantState() {
  return (
    <List.EmptyView
      icon={Icon.Globe}
      title="No tenant configured"
      description="Add a Dynatrace tenant via Manage Tenants, or enable “Use Mock Data” in preferences to preview the UI."
      actions={
        <ActionPanel>
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}
