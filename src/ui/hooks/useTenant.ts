import { useCachedPromise } from "@raycast/utils";
import { getActiveTenant } from "../../services/tenants";

/**
 * Loads the active tenant via useCachedPromise (keeps previous data while
 * revalidating). Thin wrapper for commands that only need the active tenant.
 */
export function useTenant() {
  const { data: tenant, isLoading, error } = useCachedPromise(getActiveTenant, [], { keepPreviousData: true });

  return {
    tenant: tenant ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}
