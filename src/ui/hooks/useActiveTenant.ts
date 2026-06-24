// Consolidates the repeated tenant-bootstrap pattern across commands:
// useState + useEffect + getActiveTenant + listTenants.

import { useState, useEffect } from "react";
import type { TenantConfig } from "../../sdk/auth";
import { getActiveTenant, listTenants } from "../../services/tenants";

interface ActiveTenantState {
  /** The currently active tenant, or null if none configured / still loading. */
  tenant: TenantConfig | null;
  /** All configured tenants (useful for tenant switcher UI). */
  tenants: TenantConfig[];
  /** True while the initial async load is in progress. */
  isLoading: boolean;
  /** Non-null if an error occurred fetching tenant data. */
  error: string | null;
}

/**
 * Loads the active tenant and full tenant list on mount.
 *
 * @example
 *   const { tenant, tenants, isLoading } = useActiveTenant();
 */
export function useActiveTenant(): ActiveTenantState {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getActiveTenant(), listTenants()])
      .then(([activeTenant, allTenants]) => {
        if (cancelled) return;
        setTenant(activeTenant);
        setTenants(allTenants);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load tenant configuration");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { tenant, tenants, isLoading, error };
}
