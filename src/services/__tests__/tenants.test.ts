// Tests for src/services/tenants.ts — CRUD + data integrity.

import { LocalStorage } from "@raycast/api";
import { listTenants, saveTenant, deleteTenant, getActiveTenant, setActiveTenant } from "../tenants";
import type { TenantConfig } from "../../sdk/auth";
import { StorageKeys } from "../storageKeys";

// Reset in-memory LocalStorage mock between tests
const ls = LocalStorage as unknown as { _clear: () => void };

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
