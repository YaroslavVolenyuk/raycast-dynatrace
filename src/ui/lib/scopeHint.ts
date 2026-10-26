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

/**
 * Error for a tenant whose configured scopes lack ones the command needs, or
 * undefined when all are present. The token only carries scopes listed in the
 * tenant, and Grail may answer an empty result instead of a 403 — checking up
 * front keeps a missing scope from looking like "nothing found". The message
 * contains "missing required scopes (…)" like the Grail 403 text, so
 * problemsError classifies both the same way.
 */
export function missingScopesError(
  tenant: Pick<TenantConfig, "scopes">,
  required: readonly string[],
): Error | undefined {
  const missing = findMissingScopes(tenant, required);
  if (missing.length === 0) return undefined;
  return new Error(
    `Tenant is missing required scopes (${missing.join(", ")}). Grant them to the OAuth client in Account Management and add them to the tenant's scopes in Manage Tenants.`,
  );
}
