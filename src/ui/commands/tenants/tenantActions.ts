// Raycast-side steps shared by Manage Tenants and the tenant form: confirming a
// delete, and checking / saving a tenant. Kept out of the components so each
// flow reads as one call.

import { Alert, Icon, Toast, confirmAlert, showToast } from "@raycast/api";
import type { TenantConfig } from "../../../sdk/auth";
import { testTenantConnection } from "../../../sdk";
import { deleteTenant, listTenants, saveTenant, setActiveTenant } from "../../../services";
import { describeScopeCheck } from "./tenantForm.helpers";

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
