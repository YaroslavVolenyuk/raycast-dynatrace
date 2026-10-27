// Consolidates the repeated tenant-bootstrap pattern across commands:
// useState + useEffect + readTenantState.

import { useState, useEffect, useCallback } from "react";
import type { TenantConfig } from "../../sdk/auth";
import { readTenantState } from "../../services/tenants";

interface ActiveTenantState {
  /** The currently active tenant, or null if none configured / still loading. */
  tenant: TenantConfig | null;
  /** All configured tenants (useful for tenant switcher UI). */
  tenants: TenantConfig[];
  /** True while the initial async load is in progress. */
  isLoading: boolean;
  /** Non-null if an error occurred fetching tenant data. */
  error: string | null;
  /** Reads the tenants again, e.g. after Manage Tenants or a tenant switch. */
  reload: () => void;
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
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let cancelled = false;

    readTenantState()
      .then((state) => {
        if (cancelled) return;
        setTenant(state.active);
        setTenants(state.tenants);
        setError(null);
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
  }, [generation]);

  return { tenant, tenants, isLoading, error, reload };
}
