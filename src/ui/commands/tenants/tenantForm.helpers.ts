// Pure, framework-free helpers for the Manage Tenants form. Kept separate from
// the JSX so the parsing / validation / config-building logic is unit-testable
// without rendering Raycast components.

import type { TenantConfig } from "../../../sdk/auth";
import { PROD_SSO_ENDPOINT, credentialsKind, findMissingScopes, ssoEndpointFor } from "../../../sdk/auth";
import {
  environmentUrlProblem,
  isHttpsUrl,
  normalizeEnvironmentUrl,
  normalizeUrl,
} from "../../../services/environmentUrl";

/** Dynatrace SSO token endpoint for production SaaS environments. */
export const DEFAULT_SSO_ENDPOINT = PROD_SSO_ENDPOINT;

/**
 * Least-privilege, read-only scope sets, split by who needs them.
 *
 * Required (Search Logs, Search Traces):
 *   - storage:logs:read, storage:spans:read
 *   - storage:buckets:read — without it Grail silently returns empty results
 *     instead of a 403
 *
 * Optional (single feature, soft warning only):
 *   - storage:events:read — Problems in Menu Bar (macOS)
 *
 * Only the required set is pre-filled for new tenants: requesting a scope the
 * OAuth client was not granted may fail the whole token request (invalid_scope),
 * which would break every command for the sake of one optional feature.
 */
export const REQUIRED_SCOPES = ["storage:buckets:read", "storage:logs:read", "storage:spans:read"] as const;
export const OPTIONAL_SCOPES = ["storage:events:read"] as const;

export interface ScopeCheckToast {
  style: "success" | "failure";
  title: string;
  message?: string;
}

/**
 * Toast content after a successful connection test. Missing required scopes are
 * a failure; a missing optional scope is only a hint on an otherwise green toast.
 */
export function describeScopeCheck(
  tenant: Pick<TenantConfig, "scopes" | "platformToken">,
  test: { accessDenied?: boolean; detail?: string } = {},
): ScopeCheckToast {
  const kind = credentialsKind(tenant);
  // The environment refused the test query: whatever the tenant lists, the real
  // token is not enough. Never report this as verified.
  if (test.accessDenied) {
    return {
      style: "failure",
      title: "Connected, but access denied",
      message: test.detail
        ? `${stripTrailingPeriod(test.detail)}. The ${kind} needs at least ${REQUIRED_SCOPES.join(", ")}, and must belong to this environment`
        : `The ${kind} lacks a scope or was created for another environment. It needs at least ${REQUIRED_SCOPES.join(", ")}`,
    };
  }
  const missingRequired = findMissingScopes(tenant, REQUIRED_SCOPES);
  if (missingRequired.length > 0) {
    return {
      style: "failure",
      title: "Connected, but scopes are missing",
      message: `Queries may return empty results. Add: ${missingRequired.join(", ")}`,
    };
  }
  const missingOptional = findMissingScopes(tenant, OPTIONAL_SCOPES);
  return {
    style: "success",
    title: "Connection verified",
    message: missingOptional.length > 0 ? optionalScopeHint(tenant, missingOptional) : undefined,
  };
}

function optionalScopeHint(tenant: Pick<TenantConfig, "platformToken">, missingOptional: string[]): string {
  const scopes = missingOptional.join(", ");
  return tenant.platformToken
    ? `Optional, for Problems in Menu Bar: a token with ${scopes}, listed in this tenant's scopes`
    : `Optional, for Problems in Menu Bar: grant ${scopes} to the OAuth client, then add it to this tenant's scopes`;
}

export type AuthType = "token" | "oauth";

/** Raw values straight off the Raycast <Form>. All strings. */
export interface TenantFormValues {
  authType: AuthType;
  name: string;
  tenantEndpoint: string;
  platformToken: string;
  clientId: string;
  clientSecret: string;
  ssoEndpoint: string;
  scopes: string;
}

/**
 * Splits the scopes field (one scope per line, but whitespace/commas also
 * tolerated) into a de-duped list.
 */
export function parseScopes(input: string): string[] {
  const parts = input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

/**
 * Field-level validation mirrored from the tenant zod schema, returned as a map
 * of field → message so the form can show errors inline. Empty map = valid.
 */
export function validateForm(values: TenantFormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.name.trim()) errors.name = "Name is required";

  const endpointProblem = environmentUrlProblem(normalizeEnvironmentUrl(values.tenantEndpoint));
  if (endpointProblem) errors.tenantEndpoint = endpointProblem;

  Object.assign(errors, values.authType === "token" ? validateTokenFields(values) : validateOAuthFields(values));

  if (parseScopes(values.scopes).length === 0) errors.scopes = "At least one scope is required";

  return errors;
}

type FormErrors = Partial<Record<keyof TenantFormValues, string>>;

function validateTokenFields(values: TenantFormValues): FormErrors {
  const token = values.platformToken.trim();
  if (!token) return { platformToken: "Platform token is required" };
  // Classic API tokens are rejected by the platform APIs with a bare 401.
  if (token.startsWith("dt0c01.")) {
    return { platformToken: "This is a classic API token; use a platform token (dt0s16.…)" };
  }
  return {};
}

function validateOAuthFields(values: TenantFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.clientId.trim()) errors.clientId = "Client ID is required";
  if (!values.clientSecret.trim()) errors.clientSecret = "Client Secret is required";

  // SSO endpoint is optional — left blank it falls back to the prod default.
  // Only validate an explicit override.
  const sso = normalizeUrl(values.ssoEndpoint);
  if (sso && !isHttpsUrl(sso)) errors.ssoEndpoint = "Must be a valid https:// URL";
  return errors;
}

/**
 * Initial values for the form: the tenant being edited, or blank values with the
 * read-only scopes pre-filled for a new one.
 */
export function initialFormValues(tenant?: TenantConfig): TenantFormValues {
  const blank: TenantFormValues = {
    // New tenants start with the platform token: no admin needed to create one.
    authType: "token",
    name: "",
    tenantEndpoint: "",
    platformToken: "",
    clientId: "",
    clientSecret: "",
    ssoEndpoint: "",
    scopes: REQUIRED_SCOPES.join("\n"),
  };
  if (!tenant) return blank;
  return {
    authType: tenant.platformToken ? "token" : "oauth",
    name: tenant.name ?? blank.name,
    tenantEndpoint: tenant.tenantEndpoint ?? blank.tenantEndpoint,
    platformToken: tenant.platformToken ?? blank.platformToken,
    clientId: tenant.clientId ?? blank.clientId,
    clientSecret: tenant.clientSecret ?? blank.clientSecret,
    ssoEndpoint: ssoEndpointOverride(tenant),
    scopes: (tenant.scopes ?? REQUIRED_SCOPES).join("\n"),
  };
}

/**
 * Builds a normalized {@link TenantConfig} from validated form values. Reuses
 * `existingId` when editing so the saved record updates in place; otherwise a
 * fresh id is generated.
 */
export function buildTenantConfig(values: TenantFormValues, existingId?: string): TenantConfig {
  const common = {
    id: existingId ?? generateTenantId(),
    name: values.name.trim(),
    tenantEndpoint: normalizeEnvironmentUrl(values.tenantEndpoint),
    scopes: parseScopes(values.scopes),
  };
  // Only the fields of the chosen method are kept: switching an existing tenant
  // to a token must not leave its old client secret behind, and vice versa.
  if (values.authType === "token") {
    return { ...common, clientId: "", clientSecret: "", ssoEndpoint: "", platformToken: values.platformToken.trim() };
  }
  return {
    ...common,
    clientId: values.clientId.trim(),
    clientSecret: values.clientSecret.trim(),
    // Left blank: the SSO of the environment's stage (production, dev or sprint).
    ssoEndpoint: normalizeUrl(values.ssoEndpoint) || ssoEndpointFor(common.tenantEndpoint),
  };
}

/**
 * The SSO endpoint to show in the form: blank when it is the one derived from the
 * environment URL, so a later change of the URL (prod → dev) derives a new one
 * instead of keeping the old stage's SSO.
 */
export function ssoEndpointOverride(tenant: Pick<TenantConfig, "tenantEndpoint" | "ssoEndpoint">): string {
  return tenant.ssoEndpoint === ssoEndpointFor(tenant.tenantEndpoint) ? "" : tenant.ssoEndpoint;
}

function stripTrailingPeriod(text: string): string {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

function generateTenantId(): string {
  // Node 22 (Raycast runtime) always exposes globalThis.crypto.randomUUID.
  return globalThis.crypto.randomUUID();
}
