// Pure, framework-free helpers for the Manage Tenants form. Kept separate from
// the JSX so the parsing / validation / config-building logic is unit-testable
// without rendering Raycast components.

import type { TenantConfig } from "../../../sdk/auth";

/** Dynatrace SSO token endpoint — same for every SaaS tenant. */
export const DEFAULT_SSO_ENDPOINT = "https://sso.dynatrace.com/sso/oauth2/token";

/**
 * Least-privilege, read-only Grail/platform scopes that cover the commands this
 * extension ships today (logs + future problems/entities/spans/events). Users
 * can trim or extend these in the form; this is the default a new tenant gets.
 */
export const READ_ONLY_SCOPES = [
  "storage:logs:read",
  "storage:problems:read",
  "storage:events:read",
  "storage:entities:read",
  "storage:spans:read",
  "storage:metrics:read",
  "storage:bizevents:read",
  "storage:buckets:read",
] as const;

/**
 * Write scopes — opt-in only. Not part of the default tenant; surfaced for the
 * future Read-only/Operate safety model (plan §Phase 3) where mutating commands
 * (workflow execute, settings write) require explicit elevation.
 */
export const WRITE_SCOPES = [
  "automation:workflows:write",
  "automation:workflows:run",
  "settings:objects:write",
] as const;

/** Raw values straight off the Raycast <Form>. All strings (checkbox aside). */
export interface TenantFormValues {
  name: string;
  tenantEndpoint: string;
  clientId: string;
  clientSecret: string;
  ssoEndpoint: string;
  scopes: string;
  accountUrn: string;
  useClassicProxy: boolean;
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

/** Trims and strips a trailing slash so endpoints concatenate predictably. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Field-level validation mirrored from the tenant zod schema, returned as a map
 * of field → message so the form can show errors inline. Empty map = valid.
 */
export function validateForm(values: TenantFormValues): Partial<Record<keyof TenantFormValues, string>> {
  const errors: Partial<Record<keyof TenantFormValues, string>> = {};

  if (!values.name.trim()) errors.name = "Name is required";

  const endpoint = normalizeUrl(values.tenantEndpoint);
  if (!endpoint) errors.tenantEndpoint = "Environment URL is required";
  else if (!isHttpsUrl(endpoint)) errors.tenantEndpoint = "Must be a valid https:// URL";

  if (!values.clientId.trim()) errors.clientId = "Client ID is required";
  if (!values.clientSecret.trim()) errors.clientSecret = "Client Secret is required";

  const sso = normalizeUrl(values.ssoEndpoint);
  if (!sso) errors.ssoEndpoint = "SSO endpoint is required";
  else if (!isHttpsUrl(sso)) errors.ssoEndpoint = "Must be a valid https:// URL";

  if (parseScopes(values.scopes).length === 0) errors.scopes = "At least one scope is required";

  return errors;
}

/**
 * Builds a normalized {@link TenantConfig} from validated form values. Reuses
 * `existingId` when editing so the saved record updates in place; otherwise a
 * fresh id is generated.
 */
export function buildTenantConfig(values: TenantFormValues, existingId?: string): TenantConfig {
  return {
    id: existingId ?? generateTenantId(),
    name: values.name.trim(),
    tenantEndpoint: normalizeUrl(values.tenantEndpoint),
    clientId: values.clientId.trim(),
    clientSecret: values.clientSecret.trim(),
    ssoEndpoint: normalizeUrl(values.ssoEndpoint) || DEFAULT_SSO_ENDPOINT,
    scopes: parseScopes(values.scopes),
    accountUrn: values.accountUrn.trim() || undefined,
    useClassicProxy: values.useClassicProxy,
  };
}

function generateTenantId(): string {
  // Node 22 (Raycast runtime) exposes globalThis.crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `tenant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
