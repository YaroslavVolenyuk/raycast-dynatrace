// CRUD operations for Dynatrace tenant configurations + active-tenant state.
//
// Data is stored in Raycast LocalStorage (Raycast's encrypted local
// database, machine-local, not synced). Access tokens are held in-memory only
// (see sdk/auth) and never written to disk.

import { LocalStorage } from "@raycast/api";
import { z } from "zod";
import type { TenantConfig } from "../sdk/auth";
import { StorageKeys } from "./storageKeys";

// ── Zod schema ────────────────────────────────────────────────────────────────

const tenantConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tenantEndpoint: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  ssoEndpoint: z.string().url(),
  scopes: z.array(z.string()),
  // NOTE: legacy stored tenants may carry extra keys (e.g. useClassicProxy);
  // z.object strips unknown keys, so they are dropped harmlessly on read.
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readAll(): Promise<TenantConfig[]> {
  const raw = await LocalStorage.getItem<string>(StorageKeys.tenants);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    // Per-item safeParse: one corrupted entry does not wipe the rest
    const items: TenantConfig[] = [];
    for (const item of Array.isArray(parsed) ? parsed : []) {
      const result = tenantConfigSchema.safeParse(item);
      if (result.success) items.push(result.data);
    }
    return items;
  } catch {
    // Raw key exists but can't be parsed at all — do NOT silently return []
    // (returning [] would cause the next saveTenant to overwrite all data)
    throw new Error("Tenant storage is corrupted. Please reset via Manage Tenants.");
  }
}

async function writeAll(tenants: TenantConfig[]): Promise<void> {
  await LocalStorage.setItem(StorageKeys.tenants, JSON.stringify(tenants));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantConfig[]> {
  return readAll();
}

export async function saveTenant(tenant: TenantConfig): Promise<void> {
  // readAll throws if storage is corrupted — do NOT overwrite in that case
  const tenants = await readAll();
  const idx = tenants.findIndex((t) => t.id === tenant.id);
  if (idx >= 0) {
    tenants[idx] = tenant;
  } else {
    tenants.push(tenant);
  }
  await writeAll(tenants);
}

export async function deleteTenant(id: string): Promise<void> {
  const tenants = await readAll();
  await writeAll(tenants.filter((t) => t.id !== id));

  // Clear active if deleted
  const activeId = await LocalStorage.getItem<string>(StorageKeys.tenantsActive);
  if (activeId === id) {
    await LocalStorage.removeItem(StorageKeys.tenantsActive);
  }
}

export async function getActiveTenant(): Promise<TenantConfig | null> {
  const tenants = await listTenants();
  if (tenants.length === 0) return null;

  const activeId = await LocalStorage.getItem<string>(StorageKeys.tenantsActive);
  if (activeId) {
    const found = tenants.find((t) => t.id === activeId);
    if (found) return found;
    // Active ID points to a deleted tenant — clean up dangling ref
    await LocalStorage.removeItem(StorageKeys.tenantsActive);
  }

  // Exactly one tenant: auto-select it without silently switching in multi-tenant setups
  if (tenants.length === 1) {
    await LocalStorage.setItem(StorageKeys.tenantsActive, tenants[0].id);
    return tenants[0];
  }

  // Multiple tenants and no active selection — require explicit choice
  return null;
}

export async function setActiveTenant(id: string): Promise<void> {
  await LocalStorage.setItem(StorageKeys.tenantsActive, id);
}
