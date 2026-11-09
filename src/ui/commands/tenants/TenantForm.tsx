// Add / edit a Dynatrace tenant, authenticated with a platform token or an
// OAuth client. On submit the credentials are checked (an OAuth client gets a
// real token from the SSO) and the environment is asked to verify a query
// (testTenantConnection), so the user knows the tenant works before it is
// persisted.

import { Form, ActionPanel, Action, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { TenantConfig } from "../../../sdk/auth";
import {
  REQUIRED_SCOPES,
  buildTenantConfig,
  initialFormValues,
  validateForm,
  type AuthType,
  type TenantFormValues,
} from "./tenantForm.helpers";
import { checkAndSaveTenant, confirmAndDeleteTenant } from "./tenantActions";

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
  const [values, setValues] = useState<TenantFormValues>(() => initialFormValues(tenant));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TenantFormValues, string>>>({});

  /** Props for a controlled field: value, change handler that also clears its error, and error. */
  const field = (id: Exclude<keyof TenantFormValues, "authType">) => ({
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
    try {
      if (!(await checkAndSaveTenant(config, tenant, { test, onConfirmed: () => setIsSaving(true) }))) return;

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
    if (!tenant || !(await confirmAndDeleteTenant(tenant))) return;
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
      <Form.Dropdown
        id="authType"
        title="Authentication"
        value={values.authType}
        onChange={(v) => setValues((current) => ({ ...current, authType: v as AuthType }))}
        info="Platform token: personal, queries run with your own permissions. Create it under Account Management → My platform tokens. OAuth client: a service client created by an account admin under Identity & access management → OAuth clients."
      >
        <Form.Dropdown.Item value="token" title="Platform Token" icon={Icon.Key} />
        <Form.Dropdown.Item value="oauth" title="OAuth Client" icon={Icon.Lock} />
      </Form.Dropdown>
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
      {values.authType === "token" ? (
        <Form.PasswordField
          {...field("platformToken")}
          title="Platform Token"
          placeholder="dt0s16.ABCDEFGH.XXXXXXXX…"
          info="Stored in Raycast's encrypted local storage, on this machine only."
        />
      ) : (
        <>
          <Form.TextField {...field("clientId")} title="Client ID" placeholder="dt0s02.ABCDEFGH" />
          <Form.PasswordField
            {...field("clientSecret")}
            title="Client Secret"
            placeholder="dt0s02.ABCDEFGH.XXXXXXXX…"
            info="Stored in Raycast's encrypted local storage, on this machine only. Tokens stay in memory only."
          />
        </>
      )}
      <Form.Separator />
      <Form.TextArea
        {...field("scopes")}
        title="Scopes"
        placeholder={"storage:logs:read\nstorage:spans:read"}
        info={
          values.authType === "token"
            ? "The scopes the platform token was created with, one per line. Dynatrace cannot report them, so they are listed here: they are used to warn about a missing scope before a query returns nothing. ⌘⇧R loads the read-only set."
            : "One scope per line; only these are requested. ⌘⇧R loads the read-only environment set. Do NOT mix account-level scopes (account-*, iam:*, app-engine:*) with environment scopes (storage:*, environment-api:*) in one tenant — Dynatrace rejects the combined token request as invalid_request."
        }
      />
      {values.authType === "oauth" && (
        <Form.TextField
          {...field("ssoEndpoint")}
          title="SSO Token Endpoint"
          placeholder="Default: derived from the Environment URL"
          info="Leave blank: sso.dynatrace.com for production environments, sso-dev / sso-sprint.dynatracelabs.com for dev and sprint ones. An OAuth client only works with the SSO it was created on — override only for special setups."
        />
      )}
    </Form>
  );
}
