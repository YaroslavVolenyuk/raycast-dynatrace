// Encapsulates the local-override tenant pattern used by commands that support
// in-command tenant switching (entities, problems).
//
// The hook syncs the active tenant on mount, then lets the user switch tenants
// without leaving the command by keeping a local copy in state.

import { useState, useEffect } from "react";
import type { TenantConfig } from "../../sdk/auth";
import { setActiveTenant, listTenants } from "../../services/tenants";
import { useActiveTenant } from "./useActiveTenant";

interface LocalTenantResult {
  tenant: TenantConfig | null;
  tenantChecked: boolean;
  allTenants: TenantConfig[];
  handleTenantChange: (id: string) => Promise<void>;
}

export function useLocalTenant(): LocalTenantResult {
  const [localTenant, setLocalTenant] = useState<TenantConfig | null>(null);
  const { tenant: activeTenant, tenants: allTenants, isLoading: tenantLoading } = useActiveTenant();

  useEffect(() => {
    if (activeTenant && !localTenant) {
      setLocalTenant(activeTenant);
    }
  }, [activeTenant, localTenant]);

  const tenant = localTenant ?? activeTenant;
  const tenantChecked = !tenantLoading;

  const handleTenantChange = async (id: string) => {
    await setActiveTenant(id);
    const all = await listTenants();
    const next = all.find((t) => t.id === id) ?? null;
    setLocalTenant(next);
  };

  return { tenant, tenantChecked, allTenants, handleTenantChange };
}
