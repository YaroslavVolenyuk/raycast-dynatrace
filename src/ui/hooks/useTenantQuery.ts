import { usePromise } from "@raycast/utils";
import { useRef } from "react";
import type { TenantConfig } from "../../sdk/auth";

/**
 * Runs `query` against the active tenant whenever `args` or the tenant change,
 * aborting the request it replaces. Nothing runs until a tenant is loaded.
 */
export function useTenantQuery<A extends unknown[], T extends object>(
  tenant: TenantConfig | null,
  query: (tenant: TenantConfig, args: A, signal: AbortSignal | undefined) => Promise<T>,
  args: A,
) {
  const abortable = useRef<AbortController>(null);
  const {
    data: fetched,
    isLoading,
    error,
    revalidate,
  } = usePromise(
    async (tenantId: string, ...queryArgs: A) => {
      const page = await query(tenant!, queryArgs, abortable.current?.signal);
      return { ...page, tenantId };
    },
    [tenant?.id ?? "", ...args],
    { execute: !!tenant, abortable },
  );

  // usePromise keeps the previous result while the next one loads: after a tenant
  // switch that would list the old tenant's records under the new tenant's name.
  const data = fetched?.tenantId === tenant?.id ? fetched : undefined;
  return { data, isLoading, error, revalidate };
}
