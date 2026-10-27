// Shown when no tenant is configured: adds one right here, or opens Manage Tenants.

import { List, ActionPanel, Action, Icon, useNavigation } from "@raycast/api";
import TenantForm from "../commands/tenants/TenantForm";
import { ManageTenantsAction } from "./TenantActions";

export default function EmptyTenantState({ onChanged }: { onChanged: () => void }) {
  const { push } = useNavigation();
  return (
    <List.EmptyView
      icon={Icon.Globe}
      title="No tenant configured"
      description="Add a Dynatrace environment with a platform token or an OAuth client."
      actions={
        <ActionPanel>
          <Action title="Add Tenant" icon={Icon.Plus} onAction={() => push(<TenantForm onSaved={onChanged} />)} />
          <ManageTenantsAction onChanged={onChanged} />
        </ActionPanel>
      }
    />
  );
}
