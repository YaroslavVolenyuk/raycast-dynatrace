// Manage Tenants — the command that unblocks live usage. Lists configured
// Dynatrace tenants and lets the user add, edit, switch, test and remove them.
// Every other command resolves its tenant from what is configured here.

import { List, ActionPanel, Action, Icon, Color, Alert, confirmAlert, showToast, Toast, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import type { TenantConfig } from "../../../sdk/auth";
import { validateTenantCredentials } from "../../../sdk/auth";
import { listTenants, getActiveTenant, setActiveTenant, deleteTenant } from "../../../services";
import TenantForm from "./TenantForm";

export default function ManageTenants() {
  const { push } = useNavigation();

  const { data, isLoading, revalidate } = useCachedPromise(
    async () => {
      const [tenants, active] = await Promise.all([listTenants(), getActiveTenant()]);
      return { tenants, activeId: active?.id ?? null };
    },
    [],
    { keepPreviousData: true },
  );

  const tenants = data?.tenants ?? [];
  const activeId = data?.activeId ?? null;

  async function handleSetActive(tenant: TenantConfig) {
    await setActiveTenant(tenant.id);
    await showToast({ style: Toast.Style.Success, title: "Active tenant set", message: tenant.name });
    revalidate();
  }

  async function handleTest(tenant: TenantConfig) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Testing ${tenant.name}…` });
    const result = await validateTenantCredentials(tenant);
    if (result.valid) {
      toast.style = Toast.Style.Success;
      toast.title = "Connection verified";
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Connection failed";
      toast.message = result.error;
    }
  }

  async function handleDelete(tenant: TenantConfig) {
    const confirmed = await confirmAlert({
      title: `Delete “${tenant.name}”?`,
      message: "This removes the stored credentials from this machine. This cannot be undone.",
      icon: Icon.Trash,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    await deleteTenant(tenant.id);
    await showToast({ style: Toast.Style.Success, title: "Tenant deleted", message: tenant.name });
    revalidate();
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter tenants…">
      <List.EmptyView
        icon={Icon.Globe}
        title="No tenants configured"
        description="Add a Dynatrace environment to start querying live data."
        actions={
          <ActionPanel>
            <Action
              title="Add Tenant"
              icon={Icon.Plus}
              onAction={() => push(<TenantForm onSaved={revalidate} />)}
            />
          </ActionPanel>
        }
      />
      <List.Section title="Tenants" subtitle={tenants.length ? String(tenants.length) : undefined}>
        {tenants.map((tenant) => {
          const isActive = tenant.id === activeId;
          return (
            <List.Item
              key={tenant.id}
              icon={{
                source: isActive ? Icon.CheckCircle : Icon.Circle,
                tintColor: isActive ? Color.Green : Color.SecondaryText,
              }}
              title={tenant.name}
              subtitle={tenant.tenantEndpoint}
              accessories={[
                ...(isActive ? [{ tag: { value: "Active", color: Color.Green } }] : []),
                { text: `${tenant.scopes.length} scopes` },
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    {!isActive && (
                      <Action title="Set as Active" icon={Icon.Checkmark} onAction={() => handleSetActive(tenant)} />
                    )}
                    <Action
                      title="Edit Tenant"
                      icon={Icon.Pencil}
                      shortcut={{ modifiers: ["cmd"], key: "e" }}
                      onAction={() => push(<TenantForm tenant={tenant} onSaved={revalidate} />)}
                    />
                    <Action
                      title="Test Connection"
                      icon={Icon.Plug}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => handleTest(tenant)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Add Tenant"
                      icon={Icon.Plus}
                      shortcut={{ modifiers: ["cmd"], key: "n" }}
                      onAction={() => push(<TenantForm onSaved={revalidate} />)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Environment URL"
                      content={tenant.tenantEndpoint}
                      shortcut={{ modifiers: ["cmd"], key: "." }}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Delete Tenant"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleDelete(tenant)}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
