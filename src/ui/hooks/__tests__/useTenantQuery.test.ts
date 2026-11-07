// Tests for useTenantQuery: results must follow the tenant's configuration, not only its id.

import type { TenantConfig } from "../../../sdk/auth";

const usePromise = jest.fn();
jest.mock("@raycast/utils", () => ({ usePromise: (...args: unknown[]) => usePromise(...args) }));
jest.mock("react", () => ({ ...jest.requireActual("react"), useRef: () => ({ current: null }) }));

import { tenantQueryKey, useTenantQuery } from "../useTenantQuery";

const A: TenantConfig = {
  id: "t1",
  name: "Prod",
  tenantEndpoint: "https://aaa11111.apps.dynatrace.com",
  clientId: "",
  clientSecret: "",
  ssoEndpoint: "",
  scopes: ["storage:logs:read"],
  platformToken: "dt0s16.A.secret",
};
// The same tenant after Edit Tenant: same id, another environment.
const editedToB: TenantConfig = { ...A, tenantEndpoint: "https://bbb22222.apps.dynatrace.com" };

const query = jest.fn();

beforeEach(() => usePromise.mockReset());

describe("tenantQueryKey", () => {
  it("is stable for an unchanged tenant", () => {
    expect(tenantQueryKey({ ...A })).toBe(tenantQueryKey(A));
  });

  it("changes when the environment URL or the credentials change under the same id", () => {
    expect(tenantQueryKey(editedToB)).not.toBe(tenantQueryKey(A));
    expect(tenantQueryKey({ ...A, platformToken: "dt0s16.A.other" })).not.toBe(tenantQueryKey(A));
  });

  it("never contains the token itself", () => {
    expect(tenantQueryKey(A)).not.toContain("secret");
  });

  it("is empty without a tenant", () => {
    expect(tenantQueryKey(null)).toBe("");
  });
});

describe("useTenantQuery", () => {
  it("refetches when an edit changes the environment", () => {
    usePromise.mockReturnValue({ data: undefined });
    useTenantQuery(A, query, ["x"]);
    useTenantQuery(editedToB, query, ["x"]);
    const [depsBefore, depsAfter] = usePromise.mock.calls.map((c) => c[1]);
    expect(depsAfter).not.toEqual(depsBefore);
  });

  it("never shows records fetched for the tenant's previous configuration", () => {
    // usePromise still holds A's result while B's request runs.
    usePromise.mockReturnValue({ data: { entries: ["from A"], tenantKey: tenantQueryKey(A) } });
    expect(useTenantQuery(editedToB, query, ["x"]).data).toBeUndefined();
    expect(useTenantQuery(A, query, ["x"]).data).toMatchObject({ entries: ["from A"] });
  });
});
