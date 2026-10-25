// Add / edit a Dynatrace tenant. On submit the credentials are exchanged for a
// real OAuth token (validateTenantCredentials) so the user knows the tenant
// works before it is persisted — the whole point of this command is to get the
// extension talking to a live environment without relying on mock data.

import { Form, ActionPanel, Action, Icon, Alert, confirmAlert, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import { validateTenantCredentials } from "../../../sdk/auth";
import { saveTenant, setActiveTenant, listTenants, deleteTenant } from "../../../services";
import {
  READ_ONLY_SCOPES,
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
  const [scopesText, setScopesText] = useState((tenant?.scopes ?? READ_ONLY_SCOPES).join("\n"));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TenantFormValues, string>>>({});

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
        const result = await validateTenantCredentials(config);
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
          <Action.SubmitForm
            title="Test & Save"
            icon={Icon.Plug}
            onSubmit={(values) => persist(values as unknown as TenantFormValues, true)}
          />
          <Action.SubmitForm
            title="Save Without Testing"
            icon={Icon.SaveDocument}
            onSubmit={(values) => persist(values as unknown as TenantFormValues, false)}
          />
          <Action
            title="Use Read-Only Environment Scopes"
            icon={Icon.Lock}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            onAction={() => {
              setScopesText(READ_ONLY_SCOPES.join("\n"));
            }}
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
        id="name"
        title="Name"
        placeholder="Production"
        defaultValue={tenant?.name ?? ""}
        info="A label to identify this tenant in the switcher."
        error={fieldErrors.name}
        onChange={() => setFieldErrors((e) => ({ ...e, name: undefined }))}
      />
      <Form.TextField
        id="tenantEndpoint"
        title="Environment URL"
        placeholder="https://abc12345.apps.dynatrace.com"
        defaultValue={tenant?.tenantEndpoint ?? ""}
        info="Your Dynatrace SaaS environment URL (the apps. or live. host)."
        error={fieldErrors.tenantEndpoint}
        onChange={() => setFieldErrors((e) => ({ ...e, tenantEndpoint: undefined }))}
      />
      <Form.TextField
        id="clientId"
        title="Client ID"
        placeholder="dt0s02.ABCDEFGH"
        defaultValue={tenant?.clientId ?? ""}
        error={fieldErrors.clientId}
        onChange={() => setFieldErrors((e) => ({ ...e, clientId: undefined }))}
      />
      <Form.PasswordField
        id="clientSecret"
        title="Client Secret"
        placeholder="dt0s02.ABCDEFGH.XXXXXXXX…"
        defaultValue={tenant?.clientSecret ?? ""}
        info="Stored in Raycast's encrypted local storage, on this machine only. Tokens stay in memory only."
        error={fieldErrors.clientSecret}
        onChange={() => setFieldErrors((e) => ({ ...e, clientSecret: undefined }))}
      />
      <Form.Separator />
      <Form.TextArea
        id="scopes"
        title="Scopes"
        placeholder={"storage:logs:read\nstorage:problems:read"}
        value={scopesText}
        onChange={(v) => {
          setScopesText(v);
          setFieldErrors((e) => ({ ...e, scopes: undefined }));
        }}
        info="One scope per line. ⌘⇧R loads the read-only environment set. Do NOT mix account-level scopes (account-*, iam:*, app-engine:*) with environment scopes (storage:*, environment-api:*) in one tenant — Dynatrace rejects the combined token request as invalid_request."
        error={fieldErrors.scopes}
      />
      <Form.TextField
        id="ssoEndpoint"
        title="SSO Token Endpoint"
        placeholder="Default: sso.dynatrace.com"
        defaultValue={tenant?.ssoEndpoint ?? ""}
        info="Leave blank to use sso.dynatrace.com. An OAuth client only works with the SSO it was created on — override only for special setups."
        error={fieldErrors.ssoEndpoint}
        onChange={() => setFieldErrors((e) => ({ ...e, ssoEndpoint: undefined }))}
      />
    </Form>
  );
}
