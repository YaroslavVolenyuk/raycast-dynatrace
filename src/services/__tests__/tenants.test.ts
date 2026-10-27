// Tests for src/services/tenants.ts — CRUD + data integrity.

import { LocalStorage } from "@raycast/api";
import {
  listTenants,
  saveTenant,
  deleteTenant,
  getActiveTenant,
  setActiveTenant,
  resetTenants,
  readTenantState,
} from "../tenants";
import type { TenantConfig } from "../../sdk/auth";
import { StorageKeys } from "../storageKeys";

// Reset in-memory LocalStorage mock between tests
const ls = LocalStorage as unknown as { _clear: () => void };

const countUnreadableTenants = async () => (await readTenantState()).unreadable;

beforeEach(() => {
  ls._clear();
  jest.clearAllMocks();
});

const makeTenant = (id: string): TenantConfig => ({
  id,
  name: `Tenant ${id}`,
  tenantEndpoint: `https://${id}.live.dynatrace.com`,
  clientId: `dt0s02.${id.toUpperCase()}`,
  clientSecret: `dt0s02.${id.toUpperCase()}.SECRET`,
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["storage:logs:read"],
});

describe("listTenants", () => {
  it("returns [] when storage is empty", async () => {
    expect(await listTenants()).toEqual([]);
  });

  it("returns stored tenants after saving", async () => {
    await saveTenant(makeTenant("t1"));
    await saveTenant(makeTenant("t2"));
    const result = await listTenants();
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("per-item safeParse: one invalid record does not corrupt others", async () => {
    const good = makeTenant("good");
    const invalid = { id: "", name: "" }; // fails tenantConfigSchema (empty strings)
    await LocalStorage.setItem("tenants:v1", JSON.stringify([good, invalid]));

    const result = await listTenants();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good");
  });

  it("keeps unreadable records across save and delete, and counts them", async () => {
    const invalid = { id: "", name: "broken" };
    await LocalStorage.setItem(StorageKeys.tenants, JSON.stringify([makeTenant("a"), invalid]));
    expect(await countUnreadableTenants()).toBe(1);

    await saveTenant(makeTenant("b"));
    await deleteTenant("a");

    const stored = JSON.parse((await LocalStorage.getItem(StorageKeys.tenants)) as string);
    expect(stored).toContainEqual(invalid);
    expect((await listTenants()).map((t) => t.id)).toEqual(["b"]);
    expect(await countUnreadableTenants()).toBe(1);
  });

  it("treats non-array JSON as corrupted instead of overwriting it", async () => {
    await LocalStorage.setItem(StorageKeys.tenants, JSON.stringify({ not: "a list" }));
    await expect(listTenants()).rejects.toThrow(/corrupted/);
    await expect(saveTenant(makeTenant("x"))).rejects.toThrow(/corrupted/);
  });
});

describe("saveTenant / deleteTenant round-trip", () => {
  it("saves and retrieves a tenant", async () => {
    await saveTenant(makeTenant("alpha"));
    const all = await listTenants();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: "alpha", name: "Tenant alpha" });
  });

  it("updates an existing tenant (same id)", async () => {
    await saveTenant(makeTenant("beta"));
    await saveTenant({ ...makeTenant("beta"), name: "Updated Beta" });
    const all = await listTenants();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Updated Beta");
  });

  it("deletes a tenant by id", async () => {
    await saveTenant(makeTenant("t1"));
    await saveTenant(makeTenant("t2"));
    await deleteTenant("t1");
    const all = await listTenants();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("t2");
  });

  it("clears the active key when the last tenant is deleted", async () => {
    await saveTenant(makeTenant("active-one"));
    await setActiveTenant("active-one");
    await deleteTenant("active-one");
    expect(await getActiveTenant()).toBeNull();
  });

  it("makes another tenant active when the active one is deleted", async () => {
    await saveTenant(makeTenant("first"));
    await saveTenant(makeTenant("second"));
    await setActiveTenant("second");
    await deleteTenant("second");
    expect(await LocalStorage.getItem(StorageKeys.tenantsActive)).toBe("first");
    expect((await getActiveTenant())?.id).toBe("first");
  });
});

describe("getActiveTenant", () => {
  it("returns null when no tenants stored", async () => {
    expect(await getActiveTenant()).toBeNull();
  });

  it("auto-selects a single tenant", async () => {
    await saveTenant(makeTenant("solo"));
    expect((await getActiveTenant())?.id).toBe("solo");
  });

  it("returns the explicitly set active tenant when multiple exist", async () => {
    await saveTenant(makeTenant("first"));
    await saveTenant(makeTenant("second"));
    await setActiveTenant("second");
    expect((await getActiveTenant())?.id).toBe("second");
  });

  it("falls back to the first tenant with multiple tenants and no active selection", async () => {
    await saveTenant(makeTenant("first"));
    await saveTenant(makeTenant("second"));
    expect((await getActiveTenant())?.id).toBe("first");
  });

  it("falls back to the first tenant when the active id is dangling", async () => {
    await saveTenant(makeTenant("first"));
    await saveTenant(makeTenant("second"));
    await setActiveTenant("gone");
    expect((await getActiveTenant())?.id).toBe("first");
  });
});

describe("resetTenants", () => {
  it("recovers from corrupted storage", async () => {
    await LocalStorage.setItem(StorageKeys.tenants, "{not json");
    await LocalStorage.setItem(StorageKeys.tenantsActive, "x");
    await expect(listTenants()).rejects.toThrow(/Reset Tenants/);
    await resetTenants();
    expect(await listTenants()).toEqual([]);
    expect(await LocalStorage.getItem(StorageKeys.tenantsActive)).toBeNull();
    await saveTenant(makeTenant("fresh"));
    expect((await listTenants()).map((t) => t.id)).toEqual(["fresh"]);
  });
});

describe("platform-token tenants", () => {
  const tokenTenant: TenantConfig = {
    id: "tok",
    name: "Token",
    tenantEndpoint: "https://abc.apps.dynatrace.com",
    clientId: "",
    clientSecret: "",
    ssoEndpoint: "",
    scopes: ["storage:buckets:read", "storage:logs:read"],
    platformToken: "dt0s16.AB.CD",
  };

  it("round-trips next to OAuth tenants", async () => {
    await saveTenant(makeTenant("oauth"));
    await saveTenant(tokenTenant);
    const state = await readTenantState();
    expect(state.tenants.map((t) => t.id)).toEqual(["oauth", "tok"]);
    expect(state.tenants[1]).toEqual(tokenTenant);
    expect(state.unreadable).toBe(0);
  });

  it("keeps an OAuth tenant without a secret as unreadable instead of using it", async () => {
    await LocalStorage.setItem(StorageKeys.tenants, JSON.stringify([{ ...makeTenant("x"), clientSecret: "" }]));
    const state = await readTenantState();
    expect(state.tenants).toEqual([]);
    expect(state.unreadable).toBe(1);
  });

  it("reads the active tenant once with the list", async () => {
    await saveTenant(makeTenant("a"));
    await saveTenant(tokenTenant);
    await setActiveTenant("tok");
    expect((await readTenantState()).active?.id).toBe("tok");
  });
});
