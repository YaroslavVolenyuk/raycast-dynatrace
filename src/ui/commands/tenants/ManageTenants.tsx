// Manage Tenants — the one place where Dynatrace tenants are set up, each with a
// platform token or an OAuth client. Add, edit, switch, test and remove them;
// every other command uses the active one. Also opened from inside Search Logs,
// Search Traces and Run DQL (Manage Tenants… action).

import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Alert,
  confirmAlert,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import type { TenantConfig } from "../../../sdk/auth";
import { testTenantConnection } from "../../../sdk";
import { describeScopeCheck } from "./tenantForm.helpers";
import { confirmAndDeleteTenant } from "./tenantActions";
import { setActiveTenant, resetTenants, readTenantState } from "../../../services";
import TenantForm from "./TenantForm";

export default function ManageTenants() {
  const { push } = useNavigation();

  // usePromise, not useCachedPromise: tenants carry client secrets, and the
  // Raycast Cache is plain files on disk.
  const { data, isLoading, error, revalidate } = usePromise(
    async () => {
      const state = await readTenantState();
      return { ...state, activeId: state.active?.id ?? null };
    },
    [],
    { failureToastOptions: { title: "Could not read tenants" } },
  );

  const tenants = data?.tenants ?? [];
  const activeId = data?.activeId ?? null;
  const unreadable = data?.unreadable ?? 0;

  async function handleSetActive(tenant: TenantConfig) {
    await setActiveTenant(tenant.id);
    await showToast({ style: Toast.Style.Success, title: "Active tenant set", message: tenant.name });
    revalidate();
  }

  async function handleTest(tenant: TenantConfig) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Testing ${tenant.name}…` });
    const result = await testTenantConnection(tenant);
    if (result.valid) {
      const check = describeScopeCheck(tenant, result);
      toast.style = check.style === "failure" ? Toast.Style.Failure : Toast.Style.Success;
      toast.title = check.title;
      if (check.message) toast.message = check.message;
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Connection failed";
      toast.message = result.error;
    }
  }

  async function handleDelete(tenant: TenantConfig) {
    if (await confirmAndDeleteTenant(tenant)) revalidate();
  }

  async function handleReset() {
    const confirmed = await confirmAlert({
      title: "Reset all tenants?",
      message: "This deletes every stored tenant and its credentials from this machine. This cannot be undone.",
      icon: Icon.Trash,
      primaryAction: { title: "Reset", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    try {
      await resetTenants();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Reset failed",
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    await showToast({ style: Toast.Style.Success, title: "Tenants reset" });
    revalidate();
  }

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          title="Tenant storage could not be read"
          description={`${error.message}\nReset removes all stored tenants so you can add them again.`}
          actions={
            <ActionPanel>
              <Action title="Reset Tenants" icon={Icon.Trash} style={Action.Style.Destructive} onAction={handleReset} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter tenants…">
      <List.EmptyView
        icon={Icon.Globe}
        title="No tenants configured"
        description="Add a Dynatrace environment with a platform token or an OAuth client."
        actions={
          <ActionPanel>
            <Action title="Add Tenant" icon={Icon.Plus} onAction={() => push(<TenantForm onSaved={revalidate} />)} />
          </ActionPanel>
        }
      />
      {unreadable > 0 && (
        <List.Section title="Storage">
          <List.Item
            icon={{ source: Icon.Warning, tintColor: Color.Orange }}
            title={`${unreadable} stored ${unreadable === 1 ? "tenant" : "tenants"} could not be read`}
            subtitle="Kept as is; Reset Tenants removes them"
            actions={
              <ActionPanel>
                <Action
                  title="Reset Tenants"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={handleReset}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
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
                {
                  text: `${tenant.platformToken ? "Token" : "OAuth"} · ${tenant.scopes.length} scopes`,
                  tooltip: tenant.platformToken ? "Platform token" : "OAuth client",
                },
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
