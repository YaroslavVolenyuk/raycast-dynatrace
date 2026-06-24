// Add / edit a Dynatrace tenant. On submit the credentials are exchanged for a
// real OAuth token (validateTenantCredentials) so the user knows the tenant
// works before it is persisted — the whole point of this command is to get the
// extension talking to a live environment without relying on mock data.

import { Form, ActionPanel, Action, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import { validateTenantCredentials } from "../../../sdk/auth";
import { saveTenant, setActiveTenant, listTenants } from "../../../services";
import {
  DEFAULT_SSO_ENDPOINT,
  DEFAULT_READONLY_SCOPES,
  buildTenantConfig,
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

  async function persist(values: TenantFormValues, test: boolean) {
    const errors = validateForm(values);
    if (Object.keys(errors).length > 0) {
      await showToast({ style: Toast.Style.Failure, title: "Please fix the highlighted fields" });
      return;
    }

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
        toast.style = Toast.Style.Success;
        toast.title = "Connection verified";
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
      />
      <Form.TextField
        id="tenantEndpoint"
        title="Environment URL"
        placeholder="https://abc12345.apps.dynatrace.com"
        defaultValue={tenant?.tenantEndpoint ?? ""}
        info="Your Dynatrace SaaS environment URL (the apps. or live. host)."
      />
      <Form.TextField
        id="clientId"
        title="Client ID"
        placeholder="dt0s02.ABCDEFGH"
        defaultValue={tenant?.clientId ?? ""}
      />
      <Form.PasswordField
        id="clientSecret"
        title="Client Secret"
        placeholder="dt0s02.ABCDEFGH.XXXXXXXX…"
        defaultValue={tenant?.clientSecret ?? ""}
        info="Stored in Raycast LocalStorage (unencrypted on disk). Tokens stay in memory only."
      />
      <Form.Separator />
      <Form.TextField
        id="scopes"
        title="Scopes"
        placeholder="storage:logs:read storage:problems:read"
        defaultValue={(tenant?.scopes ?? DEFAULT_READONLY_SCOPES).join(" ")}
        info="Space- or comma-separated OAuth scopes. Defaults to read-only Grail scopes."
      />
      <Form.TextField
        id="ssoEndpoint"
        title="SSO Token Endpoint"
        defaultValue={tenant?.ssoEndpoint ?? DEFAULT_SSO_ENDPOINT}
        info="Override only for non-default SSO (e.g. dev or sprint environments)."
      />
      <Form.TextField
        id="accountUrn"
        title="Account URN"
        placeholder="urn:dtaccount:… (optional)"
        defaultValue={tenant?.accountUrn ?? ""}
        info="Only needed for account-level OAuth clients."
      />
      <Form.Checkbox
        id="useClassicProxy"
        title="Classic API Proxy"
        label="Route classic API calls through /platform/classic/"
        defaultValue={tenant?.useClassicProxy ?? true}
        info="Disable if /platform/classic/ returns 404 on your environment."
      />
    </Form>
  );
}
