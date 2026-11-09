// Raycast-side steps shared by Manage Tenants and the tenant form: confirming a
// delete, and checking / saving a tenant. Kept out of the components so each
// flow reads as one call.

import { Alert, Icon, Toast, confirmAlert, showToast } from "@raycast/api";
import { credentialsKind, type TenantConfig } from "../../../sdk/auth";
import { testTenantConnection } from "../../../sdk";
import { deleteTenant, listTenants, saveTenant, setActiveTenant } from "../../../services";
import { describeScopeCheck, newForeignHosts } from "./tenantForm.helpers";

/** Asks for confirmation, then deletes the tenant. Resolves to false when the user cancels. */
export async function confirmAndDeleteTenant(tenant: TenantConfig): Promise<boolean> {
  const confirmed = await confirmAlert({
    title: `Delete “${tenant.name}”?`,
    message: "This removes the stored credentials from this machine. This cannot be undone.",
    icon: Icon.Trash,
    primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return false;
  await deleteTenant(tenant.id);
  await showToast({ style: Toast.Style.Success, title: "Tenant deleted", message: tenant.name });
  return true;
}

/**
 * Asks before credentials go to a host that is not Dynatrace SaaS (see
 * newForeignHosts). Resolves to false when the user cancels.
 */
export async function confirmForeignHosts(config: TenantConfig, hosts: string[]): Promise<boolean> {
  return confirmAlert({
    title: "Not a Dynatrace Host",
    message:
      `The ${credentialsKind(config)} will be sent to ${hosts.join(" and ")}. ` +
      "Continue only if this is your own proxy or Dynatrace Managed server: a lookalike address would receive your credentials.",
    icon: Icon.ExclamationMark,
    primaryAction: { title: "Send Credentials", style: Alert.ActionStyle.Destructive },
  });
}

/**
 * Tests the connection with a progress toast that ends as the result. Resolves to
 * true when the tenant is verified (so it may be saved), false after a failure
 * toast.
 */
export async function verifyTenantConnection(config: TenantConfig): Promise<boolean> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Testing connection…" });
  const result = await testTenantConnection(config);
  if (!result.valid) {
    toast.style = Toast.Style.Failure;
    toast.title = "Connection failed";
    toast.message = result.error;
    return false; // keep the form open so the user can fix credentials
  }
  const check = describeScopeCheck(config, result);
  if (check.style === "failure") {
    // Not saved: the next toast ("Tenant added") would hide this one at once.
    toast.style = Toast.Style.Failure;
    toast.title = check.title;
    toast.message = [check.message, "fix it, or keep the tenant with Save Without Testing"].filter(Boolean).join(" — ");
    return false;
  }
  toast.style = Toast.Style.Success;
  toast.title = check.title;
  if (check.message) toast.message = check.message;
  return true;
}

/** Saves the tenant; the first one added becomes active so commands work at once. */
export async function saveTenantAndActivateFirst(config: TenantConfig): Promise<void> {
  await saveTenant(config);
  const all = await listTenants();
  if (all.length === 1) await setActiveTenant(config.id);
}

/**
 * Confirm, test, save — in this order. The question about a foreign host comes
 * first because the test already hands the credentials to that host
 * (THREAT_MODEL.md C6). `onConfirmed` runs once nothing more is asked, to show
 * progress. Resolves to true when the tenant was saved.
 */
export async function checkAndSaveTenant(
  config: TenantConfig,
  previous: TenantConfig | undefined,
  { test, onConfirmed }: { test: boolean; onConfirmed?: () => void },
): Promise<boolean> {
  const foreignHosts = newForeignHosts(config, previous);
  if (foreignHosts.length > 0 && !(await confirmForeignHosts(config, foreignHosts))) return false;
  onConfirmed?.();
  if (test && !(await verifyTenantConnection(config))) return false;
  await saveTenantAndActivateFirst(config);
  return true;
}
