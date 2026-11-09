import type { TenantConfig } from "../../../../sdk/auth";
import {
  checkAndSaveTenant,
  confirmAndDeleteTenant,
  saveTenantAndActivateFirst,
  verifyTenantConnection,
} from "../tenantActions";

const mockConfirmAlert = jest.fn();
const mockShowToast = jest.fn();
const mockTest = jest.fn();
const mockDelete = jest.fn();
const mockSave = jest.fn();
const mockList = jest.fn();
const mockSetActive = jest.fn();

jest.mock("@raycast/api", () => ({
  Alert: { ActionStyle: { Destructive: "destructive" } },
  Icon: { Trash: "trash", ExclamationMark: "exclamation" },
  Toast: { Style: { Animated: "animated", Success: "success", Failure: "failure" } },
  confirmAlert: (o: unknown) => mockConfirmAlert(o),
  showToast: (o: unknown) => mockShowToast(o),
}));
jest.mock("../../../../sdk", () => ({ testTenantConnection: (t: unknown) => mockTest(t) }));
jest.mock("../../../../services", () => ({
  deleteTenant: (id: string) => mockDelete(id),
  saveTenant: (t: unknown) => mockSave(t),
  listTenants: () => mockList(),
  setActiveTenant: (id: string) => mockSetActive(id),
}));

const tenant: TenantConfig = {
  id: "t1",
  name: "Prod",
  tenantEndpoint: "https://abc12345.apps.dynatrace.com",
  clientId: "",
  clientSecret: "",
  ssoEndpoint: "",
  platformToken: "dt0s16.A.B",
  scopes: ["storage:buckets:read", "storage:logs:read", "storage:spans:read", "storage:events:read"],
};

beforeEach(() => jest.clearAllMocks());

describe("confirmAndDeleteTenant", () => {
  it("does nothing when the user cancels", async () => {
    mockConfirmAlert.mockResolvedValue(false);
    expect(await confirmAndDeleteTenant(tenant)).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("deletes and toasts when confirmed", async () => {
    mockConfirmAlert.mockResolvedValue(true);
    expect(await confirmAndDeleteTenant(tenant)).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("t1");
    expect(mockShowToast).toHaveBeenCalledWith({ style: "success", title: "Tenant deleted", message: "Prod" });
  });
});

describe("verifyTenantConnection", () => {
  const toast = () => {
    const t = { style: "animated", title: "Testing connection…", message: undefined as string | undefined };
    mockShowToast.mockResolvedValue(t);
    return t;
  };

  it("fails the toast when the connection is invalid", async () => {
    const t = toast();
    mockTest.mockResolvedValue({ valid: false, error: "401" });
    expect(await verifyTenantConnection(tenant)).toBe(false);
    expect(t).toMatchObject({ style: "failure", title: "Connection failed", message: "401" });
  });

  it("fails with a hint to save without testing when scopes are missing", async () => {
    const t = toast();
    mockTest.mockResolvedValue({ valid: true });
    expect(await verifyTenantConnection({ ...tenant, scopes: ["storage:logs:read"] })).toBe(false);
    expect(t.style).toBe("failure");
    expect(t.message).toMatch(
      /^Queries may return empty results\. Add: .* — fix it, or keep the tenant with Save Without Testing$/,
    );
  });

  it("succeeds on a verified tenant", async () => {
    const t = toast();
    mockTest.mockResolvedValue({ valid: true });
    expect(await verifyTenantConnection(tenant)).toBe(true);
    expect(t).toMatchObject({ style: "success", title: "Connection verified", message: undefined });
  });
});

describe("saveTenantAndActivateFirst", () => {
  it("activates the tenant only when it is the only one", async () => {
    mockList.mockResolvedValue([tenant]);
    await saveTenantAndActivateFirst(tenant);
    expect(mockSave).toHaveBeenCalledWith(tenant);
    expect(mockSetActive).toHaveBeenCalledWith("t1");

    mockSetActive.mockClear();
    mockList.mockResolvedValue([tenant, { ...tenant, id: "t2" }]);
    await saveTenantAndActivateFirst(tenant);
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});

// THREAT_MODEL.md C6: the connection test already sends the credentials, so the
// question about a foreign host must come before it, and a "no" must send nothing.
describe("checkAndSaveTenant", () => {
  const foreign = { ...tenant, tenantEndpoint: "https://dt.example.com" };

  it("asks before testing a foreign host, and sends nothing after a no", async () => {
    mockConfirmAlert.mockResolvedValue(false);
    expect(await checkAndSaveTenant(foreign, undefined, { test: true })).toBe(false);
    expect(mockConfirmAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "Not a Dynatrace Host" }));
    expect(mockTest).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("confirms, then tests, then saves", async () => {
    const order: string[] = [];
    mockConfirmAlert.mockImplementation(async () => (order.push("confirm"), true));
    mockShowToast.mockResolvedValue({});
    mockTest.mockImplementation(async () => (order.push("test"), { valid: true }));
    mockSave.mockImplementation(async () => void order.push("save"));
    mockList.mockResolvedValue([foreign]);
    expect(await checkAndSaveTenant(foreign, undefined, { test: true })).toBe(true);
    expect(order).toEqual(["confirm", "test", "save"]);
  });

  it("does not ask about a Dynatrace host", async () => {
    mockShowToast.mockResolvedValue({});
    mockList.mockResolvedValue([tenant]);
    expect(await checkAndSaveTenant(tenant, undefined, { test: false })).toBe(true);
    expect(mockConfirmAlert).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith(tenant);
  });
});
