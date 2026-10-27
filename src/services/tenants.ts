// CRUD operations for Dynatrace tenant configurations + active-tenant state.
//
// Every tenant — platform token or OAuth client — is added in Manage Tenants
// and stored in Raycast LocalStorage (Raycast's encrypted local database,
// machine-local, not synced). Access tokens are held in-memory only (see
// sdk/auth) and never written to disk. Never pass tenants through
// useCachedPromise / Cache: that store is unencrypted files.

import { LocalStorage } from "@raycast/api";
import { z } from "zod";
import type { TenantConfig } from "../sdk/auth";
import { StorageKeys } from "./storageKeys";

// ── Zod schema ────────────────────────────────────────────────────────────────

const tenantConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tenantEndpoint: z.string().url(),
    // Empty for a platform-token tenant.
    clientId: z.string(),
    clientSecret: z.string(),
    ssoEndpoint: z.string(),
    scopes: z.array(z.string()),
    platformToken: z.string().min(1).optional(),
    // NOTE: legacy stored tenants may carry extra keys (e.g. useClassicProxy);
    // z.object strips unknown keys, so they are dropped harmlessly on read.
  })
  .refine(
    (t) =>
      t.platformToken !== undefined ||
      (t.clientId.length > 0 && t.clientSecret.length > 0 && z.string().url().safeParse(t.ssoEndpoint).success),
    { message: "A tenant needs a platform token or a complete OAuth client" },
  );

// ── Helpers ───────────────────────────────────────────────────────────────────

interface StoredTenants {
  tenants: TenantConfig[];
  /** Entries that failed validation, kept verbatim so a later write does not destroy them. */
  unreadable: unknown[];
}

async function readStore(): Promise<StoredTenants> {
  const raw = await LocalStorage.getItem<string>(StorageKeys.tenants);
  if (!raw) return { tenants: [], unreadable: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (!Array.isArray(parsed)) {
    // Raw key exists but is not a tenant list — do NOT silently return []
    // (returning [] would cause the next saveTenant to overwrite all data)
    throw new Error("Tenant storage is corrupted. Open Manage Tenants and choose Reset Tenants.");
  }
  // Per-item safeParse: one corrupted entry does not wipe the rest
  const store: StoredTenants = { tenants: [], unreadable: [] };
  for (const item of parsed) {
    const result = tenantConfigSchema.safeParse(item);
    if (result.success) store.tenants.push(result.data);
    else store.unreadable.push(item);
  }
  return store;
}

async function writeAll(tenants: TenantConfig[], unreadable: unknown[]): Promise<void> {
  await LocalStorage.setItem(StorageKeys.tenants, JSON.stringify([...tenants, ...unreadable]));
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TenantState {
  tenants: TenantConfig[];
  active: TenantConfig | null;
  /** Stored entries that could not be read. They are kept until Reset Tenants. */
  unreadable: number;
}

/** Everything Manage Tenants shows, from one read of the storage. */
export async function readTenantState(): Promise<TenantState> {
  const { tenants, unreadable } = await readStore();
  const activeId = await LocalStorage.getItem<string>(StorageKeys.tenantsActive);
  return {
    tenants,
    // No (valid) active selection while tenants exist: fall back to the first one.
    // Leaving none active made every command claim "no tenant" with tenants present.
    active: tenants.find((t) => t.id === activeId) ?? tenants[0] ?? null,
    unreadable: unreadable.length,
  };
}

export async function listTenants(): Promise<TenantConfig[]> {
  return (await readTenantState()).tenants;
}

export async function saveTenant(tenant: TenantConfig): Promise<void> {
  // readStore throws if storage is corrupted — do NOT overwrite in that case
  const { tenants, unreadable } = await readStore();
  const idx = tenants.findIndex((t) => t.id === tenant.id);
  if (idx >= 0) {
    tenants[idx] = tenant;
  } else {
    tenants.push(tenant);
  }
  await writeAll(tenants, unreadable);
}

export async function deleteTenant(id: string): Promise<void> {
  const { tenants, unreadable } = await readStore();
  await writeAll(
    tenants.filter((t) => t.id !== id),
    unreadable,
  );

  // Deleting the active tenant hands "active" to the first remaining one, so the
  // other commands keep working instead of asking the user to pick again.
  const activeId = await LocalStorage.getItem<string>(StorageKeys.tenantsActive);
  if (activeId === id) {
    const remaining = tenants.filter((t) => t.id !== id);
    if (remaining.length > 0) await LocalStorage.setItem(StorageKeys.tenantsActive, remaining[0].id);
    else await LocalStorage.removeItem(StorageKeys.tenantsActive);
  }
}

export async function getActiveTenant(): Promise<TenantConfig | null> {
  const { active } = await readTenantState();
  // Persist the fallback so the active tenant does not change when tenants are added later.
  if (active && (await LocalStorage.getItem<string>(StorageKeys.tenantsActive)) !== active.id) {
    await LocalStorage.setItem(StorageKeys.tenantsActive, active.id);
  }
  return active;
}

/** Removes every stored tenant and the active selection. The way out of corrupted storage. */
export async function resetTenants(): Promise<void> {
  await LocalStorage.removeItem(StorageKeys.tenants);
  await LocalStorage.removeItem(StorageKeys.tenantsActive);
}

export async function setActiveTenant(id: string): Promise<void> {
  await LocalStorage.setItem(StorageKeys.tenantsActive, id);
}
