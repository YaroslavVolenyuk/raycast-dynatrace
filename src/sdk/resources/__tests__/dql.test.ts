import { runDql, collectColumns, isTruncated, requiredScopesForQuery, DQL_POLL_DEADLINE_MS } from "../dql";
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
    expect(opts).toMatchObject({
      maxResultRecords: 100,
      timeframe,
      requiredScopes: ["storage:buckets:read", "storage:logs:read"],
      pollDeadlineMs: DQL_POLL_DEADLINE_MS,
    });
  });

  it("returns Grail notification messages as notices and uses them for truncation", async () => {
    const executeDql = jest.fn(async (_t, _q, opts) => {
      opts.onNotifications([
        { severity: "WARNING", notificationType: "RESULT_TRUNCATED", message: "The result was truncated." },
        { severity: "INFO", notificationType: "SCAN_LIMIT_GBYTES", message: "Scan limit reached." },
        { severity: "INFO", message: "Scan limit reached." },
      ]);
      return [{ a: 1 }];
    });
    const result = await runDql({ executeDql } as unknown as DynatraceTransport, TENANT, "fetch logs", { limit: 1000 });
    expect(result.truncated).toBe(true);
    expect(result.notices).toEqual(["The result was truncated.", "Scan limit reached."]);
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

describe("isTruncated", () => {
  it("is true at the record cap without an explicit limit", () => {
    expect(isTruncated(1000, 1000, "fetch logs", [])).toBe(true);
  });

  it("is false at the cap when the query sets its own | limit", () => {
    expect(isTruncated(1000, 1000, "fetch logs\n| limit 1000", [])).toBe(false);
  });

  it("is true at the cap when the query's own | limit is above it", () => {
    expect(isTruncated(1000, 1000, "fetch logs\n| limit 5000", [])).toBe(true);
  });

  it("is false below the cap with no notifications", () => {
    expect(isTruncated(10, 1000, "fetch logs", [])).toBe(false);
  });

  it("is true below the cap when Grail says the result was truncated (e.g. by bytes)", () => {
    expect(isTruncated(10, 1000, "fetch logs", [{ message: "Result has been truncated to 1 MB" }])).toBe(true);
  });

  it("ignores unrelated notifications", () => {
    expect(isTruncated(10, 1000, "fetch logs", [{ notificationType: "SAMPLING", message: "Sampling applied" }])).toBe(
      false,
    );
  });
});

describe("requiredScopesForQuery", () => {
  it.each([
    ["  fetch spans | limit 1", "storage:spans:read"],
    ["fetch dt.davis.problems", "storage:events:read"],
    ["timeseries avg(dt.host.cpu.usage)", "storage:metrics:read"],
  ])("%s needs %s", (query, scope) => {
    expect(requiredScopesForQuery(query)).toEqual(["storage:buckets:read", scope]);
  });

  it("falls back to the base scope for unknown sources", () => {
    expect(requiredScopesForQuery("data record(a = 1)")).toEqual(["storage:buckets:read"]);
  });
});
