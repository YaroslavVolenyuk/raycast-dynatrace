// Add / edit a Dynatrace tenant. On submit the credentials are exchanged for a
// real OAuth token and the environment is asked to verify a query
// (testTenantConnection) so the user knows the tenant
// works before it is persisted — the whole point of this command is to get the
// extension talking to a live environment without relying on mock data.

import { Form, ActionPanel, Action, Icon, Alert, confirmAlert, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import { testTenantConnection } from "../../../sdk";
import { saveTenant, setActiveTenant, listTenants, deleteTenant } from "../../../services";
import {
  REQUIRED_SCOPES,
  buildTenantConfig,
  describeScopeCheck,
  validateForm,
  type TenantFormValues,
} from "./tenantForm.helpers";

interface TenantFormProps {
  /** Existing tenant to edit. Omit to create a new one. */
  tenant?: TenantConfig;
  /** Called after a successful save so the list can revalidate. */
  onSaved?: () => void;
}

export default function TenantForm({ tenant, onSaved }: TenantFormProps) {
  const { pop } = useNavigation();
  const isEdit = !!tenant;
  const [isSaving, setIsSaving] = useState(false);
  // Every field is controlled. Mixing uncontrolled (defaultValue) fields with the
  // controlled scopes field let a re-render wipe what the user had typed.
  const [values, setValues] = useState<TenantFormValues>({
    name: tenant?.name ?? "",
    tenantEndpoint: tenant?.tenantEndpoint ?? "",
    clientId: tenant?.clientId ?? "",
    clientSecret: tenant?.clientSecret ?? "",
    ssoEndpoint: tenant?.ssoEndpoint ?? "",
    scopes: (tenant?.scopes ?? REQUIRED_SCOPES).join("\n"),
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TenantFormValues, string>>>({});

  /** Props for a controlled field: value, change handler that also clears its error, and error. */
  const field = (id: keyof TenantFormValues) => ({
    id,
    value: values[id],
    error: fieldErrors[id],
    onChange: (value: string) => {
      setValues((v) => ({ ...v, [id]: value }));
      setFieldErrors((e) => ({ ...e, [id]: undefined }));
    },
  });

  async function persist(values: TenantFormValues, test: boolean) {
    const errors = validateForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      await showToast({ style: Toast.Style.Failure, title: "Validation error", message: firstError });
      return;
    }
    setFieldErrors({});

    const config = buildTenantConfig(values, tenant?.id);
    setIsSaving(true);
    try {
      if (test) {
        const toast = await showToast({ style: Toast.Style.Animated, title: "Testing connection…" });
        const result = await testTenantConnection(config);
        if (!result.valid) {
          toast.style = Toast.Style.Failure;
          toast.title = "Connection failed";
          toast.message = result.error;
          return; // keep the form open so the user can fix credentials
        }
        const check = describeScopeCheck(config);
        toast.style = check.style === "failure" ? Toast.Style.Failure : Toast.Style.Success;
        toast.title = check.title;
        if (check.message) toast.message = check.message;
      }

      await saveTenant(config);

      // First tenant added becomes active automatically so commands work at once.
      const all = await listTenants();
      if (all.length === 1) await setActiveTenant(config.id);

      await showToast({
        style: Toast.Style.Success,
        title: isEdit ? "Tenant updated" : "Tenant added",
        message: config.name,
      });
      onSaved?.();
      pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save tenant",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!tenant) return;
    const confirmed = await confirmAlert({
      title: `Delete “${tenant.name}”?`,
      message: "This removes the stored credentials from this machine. This cannot be undone.",
      icon: Icon.Trash,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    await deleteTenant(tenant.id);
    await showToast({ style: Toast.Style.Success, title: "Tenant deleted", message: tenant.name });
    onSaved?.();
    pop();
  }

  return (
    <Form
      isLoading={isSaving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Test & Save" icon={Icon.Plug} onSubmit={() => persist(values, true)} />
          <Action.SubmitForm
            title="Save Without Testing"
            icon={Icon.SaveDocument}
            onSubmit={() => persist(values, false)}
          />
          <Action
            title="Use Read-Only Environment Scopes"
            icon={Icon.Lock}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            onAction={() => field("scopes").onChange(REQUIRED_SCOPES.join("\n"))}
          />
          {isEdit && (
            <Action
              title="Delete Tenant"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={handleDelete}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Description text="Connect a Dynatrace environment using an OAuth client (client-credentials). Create one under Account Management → Identity & access management → OAuth clients." />
      <Form.TextField
        {...field("name")}
        title="Name"
        placeholder="Production"
        info="A label to identify this tenant in the switcher."
      />
      <Form.TextField
        {...field("tenantEndpoint")}
        title="Environment URL"
        placeholder="https://abc12345.apps.dynatrace.com"
        info="Your Dynatrace platform environment URL: https://<environment-id>.apps.dynatrace.com. A URL copied from the browser address bar is fine."
      />
      <Form.TextField {...field("clientId")} title="Client ID" placeholder="dt0s02.ABCDEFGH" />
      <Form.PasswordField
        {...field("clientSecret")}
        title="Client Secret"
        placeholder="dt0s02.ABCDEFGH.XXXXXXXX…"
        info="Stored in Raycast's encrypted local storage, on this machine only. Tokens stay in memory only."
      />
      <Form.Separator />
      <Form.TextArea
        {...field("scopes")}
        title="Scopes"
        placeholder={"storage:logs:read\nstorage:spans:read"}
        info="One scope per line. ⌘⇧R loads the read-only environment set. Do NOT mix account-level scopes (account-*, iam:*, app-engine:*) with environment scopes (storage:*, environment-api:*) in one tenant — Dynatrace rejects the combined token request as invalid_request."
      />
      <Form.TextField
        {...field("ssoEndpoint")}
        title="SSO Token Endpoint"
        placeholder="Default: sso.dynatrace.com"
        info="Leave blank to use sso.dynatrace.com. An OAuth client only works with the SSO it was created on — override only for special setups."
      />
    </Form>
  );
}
