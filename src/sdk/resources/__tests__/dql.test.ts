import { runDql, collectColumns } from "../dql";
import type { DynatraceTransport } from "../../transport";
import type { TenantConfig } from "../../auth";

const TENANT = { id: "t1" } as TenantConfig;

function transportReturning(records: Record<string, unknown>[]) {
  const executeDql = jest.fn().mockResolvedValue(records);
  return { executeDql, transport: { executeDql } as unknown as DynatraceTransport };
}

describe("collectColumns", () => {
  it("unions keys of all records in order of first appearance", () => {
    expect(
      collectColumns([
        { a: 1, b: 2 },
        { c: 3, a: 4 },
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("runDql", () => {
  it("passes the trimmed query, limit, timeframe and base scope", async () => {
    const { executeDql, transport } = transportReturning([{ x: 1 }]);
    const timeframe = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z" };
    await runDql(transport, TENANT, "  fetch logs \n", { limit: 100, timeframe });
    const [, query, opts] = executeDql.mock.calls[0];
    expect(query).toBe("fetch logs");
    expect(opts).toMatchObject({ maxResultRecords: 100, timeframe, requiredScopes: ["storage:buckets:read"] });
  });

  it("reports truncation when the limit is reached", async () => {
    const { transport } = transportReturning([{ a: 1 }, { b: 2 }]);
    expect((await runDql(transport, TENANT, "fetch logs", { limit: 2 })).truncated).toBe(true);
    expect((await runDql(transport, TENANT, "fetch logs", { limit: 3 })).truncated).toBe(false);
  });

  it("rejects an empty query without calling Dynatrace", async () => {
    const { executeDql, transport } = transportReturning([]);
    await expect(runDql(transport, TENANT, "   ")).rejects.toThrow(/empty/);
    expect(executeDql).not.toHaveBeenCalled();
  });
});
