import { findMissingScopes } from "../../sdk/auth";
import type { TenantConfig } from "../../sdk/auth";

/**
 * Empty-state description that names scopes missing from the tenant config.
 * Grail returns an empty result (not a 403) when e.g. `storage:buckets:read`
 * is absent, so an empty list is the only symptom the user sees.
 */
export function emptyDescription(
  tenant: Pick<TenantConfig, "scopes"> | null | undefined,
  required: readonly string[],
  fallback: string,
): string {
  const missing = tenant ? findMissingScopes(tenant, required) : [];
  if (missing.length === 0) return fallback;
  return `${fallback} Possibly missing OAuth scopes: ${missing.join(", ")} — add them in Manage Tenants and to the OAuth client.`;
}
