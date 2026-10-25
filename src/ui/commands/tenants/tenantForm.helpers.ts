// Pure, framework-free helpers for the Manage Tenants form. Kept separate from
// the JSX so the parsing / validation / config-building logic is unit-testable
// without rendering Raycast components.

import type { TenantConfig } from "../../../sdk/auth";
import { PROD_SSO_ENDPOINT } from "../../../sdk/auth";

/**
 * Dynatrace SSO token endpoint for production SaaS environments. Used when the
 * SSO field is blank; other environments set it manually in the form.
 */
export const DEFAULT_SSO_ENDPOINT = PROD_SSO_ENDPOINT;

/**
 * Least-privilege, read-only scope set. Only includes scopes for commands that
 * have been migrated into this extension. Add a scope here only when the
 * corresponding command ships.
 *
 * Current commands:
 *   - dt-search-logs   → storage:logs:read  (verified live 2026-06-26)
 *   - dt-search-traces → storage:spans:read
 *   - all Grail reads  → storage:buckets:read (without it Grail silently returns
 *                        empty results instead of a 403)
 */
export const READ_ONLY_SCOPES = ["storage:buckets:read", "storage:logs:read", "storage:spans:read"] as const;

/** Raw values straight off the Raycast <Form>. All strings (checkbox aside). */
export interface TenantFormValues {
  name: string;
  tenantEndpoint: string;
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

  // SSO endpoint is optional — left blank it falls back to the prod default.
  // Only validate an explicit override.
  const sso = normalizeUrl(values.ssoEndpoint);
  if (sso && !isHttpsUrl(sso)) errors.ssoEndpoint = "Must be a valid https:// URL";

  if (parseScopes(values.scopes).length === 0) errors.scopes = "At least one scope is required";

  return errors;
}

/**
 * Builds a normalized {@link TenantConfig} from validated form values. Reuses
 * `existingId` when editing so the saved record updates in place; otherwise a
 * fresh id is generated.
 */
export function buildTenantConfig(values: TenantFormValues, existingId?: string): TenantConfig {
  const tenantEndpoint = normalizeUrl(values.tenantEndpoint);
  return {
    id: existingId ?? generateTenantId(),
    name: values.name.trim(),
    tenantEndpoint,
    clientId: values.clientId.trim(),
    clientSecret: values.clientSecret.trim(),
    ssoEndpoint: normalizeUrl(values.ssoEndpoint) || DEFAULT_SSO_ENDPOINT,
    scopes: parseScopes(values.scopes),
  };
}

function generateTenantId(): string {
  // Node 22 (Raycast runtime) exposes globalThis.crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `tenant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
