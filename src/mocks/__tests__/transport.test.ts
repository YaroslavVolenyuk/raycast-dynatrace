import { MockTransport } from "../transport";
import type { TenantConfig } from "../../sdk/auth";

const TENANT = { id: "t1" } as TenantConfig;

describe("MockTransport", () => {
  it("returns records for a matching DQL fixture", async () => {
    const t = new MockTransport().registerDql((q) => q.includes("fetch logs"), [{ content: "hello" }]);
    const records = await t.executeDql(TENANT, "fetch logs | limit 10");
    expect(records).toEqual([{ content: "hello" }]);
  });

  it("throws a loud error when no DQL fixture matches", async () => {
    const t = new MockTransport();
    await expect(t.executeDql(TENANT, "fetch events")).rejects.toThrow(/no DQL fixture/);
  });

  it("picks the first matching DQL fixture in registration order", async () => {
    const t = new MockTransport()
      .registerDql((q) => q.includes("logs"), [{ a: 1 }])
      .registerDql(() => true, [{ b: 2 }]);
    expect(await t.executeDql(TENANT, "fetch logs")).toEqual([{ a: 1 }]);
    expect(await t.executeDql(TENANT, "fetch problems")).toEqual([{ b: 2 }]);
  });

  it("returns a RestResponse for a matching REST fixture", async () => {
    const t = new MockTransport().registerRest((p) => p.startsWith("/api/v2/slo"), { slo: [] });
    const res = await t.rest(TENANT, "/api/v2/slo?pageSize=50");
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ slo: [] });
  });

  it("throws when no REST fixture matches", async () => {
    const t = new MockTransport();
    await expect(t.rest(TENANT, "/api/v2/unknown")).rejects.toThrow(/no REST fixture/);
  });
});
