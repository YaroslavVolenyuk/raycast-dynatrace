import { usePromise } from "@raycast/utils";
import { useRef } from "react";
import { credentialsFingerprint, type TenantConfig } from "../../sdk/auth";

/**
 * Which tenant, and which configuration of it, a result was fetched for. Editing
 * a tenant keeps its id, so the id alone would keep environment A's records on
 * screen after its URL was changed to B. The credentials enter only as a hash.
 */
export function tenantQueryKey(tenant: TenantConfig | null): string {
  return tenant ? JSON.stringify([tenant.id, tenant.tenantEndpoint, credentialsFingerprint(tenant)]) : "";
}

/**
 * Runs `query` against the active tenant whenever `args` or the tenant (or its
 * configuration) change, aborting the request it replaces. Nothing runs until a
 * tenant is loaded.
 */
export function useTenantQuery<A extends unknown[], T extends object>(
  tenant: TenantConfig | null,
  query: (tenant: TenantConfig, args: A, signal: AbortSignal | undefined) => Promise<T>,
  args: A,
) {
  const abortable = useRef<AbortController>(null);
  const tenantKey = tenantQueryKey(tenant);
  const {
    data: fetched,
    isLoading,
    error,
    revalidate,
  } = usePromise(
    async (key: string, ...queryArgs: A) => {
      const page = await query(tenant!, queryArgs, abortable.current?.signal);
      return { ...page, tenantKey: key };
    },
    [tenantKey, ...args],
    { execute: !!tenant, abortable },
  );

  // usePromise keeps the previous result while the next one loads: after a tenant
  // switch or edit that would list the old environment's records under the new name.
  const data = fetched?.tenantKey === tenantKey ? fetched : undefined;
  return { data, isLoading, error, revalidate };
}
