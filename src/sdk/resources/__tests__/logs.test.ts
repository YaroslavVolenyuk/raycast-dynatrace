import { logRecordSchema, normalizeLog, buildLogsQuery, listLogs, type LogRecord } from "../logs";
import type { DynatraceTransport } from "../../transport";
import type { TenantConfig } from "../../auth";
import fixture from "../__fixtures__/logs.search.json";

const TENANT = { id: "t1" } as TenantConfig;

// ── Contract: schema parses the captured fixture ───────────────────────────────
// Fixture captured from live tenant via MCP execute_dql 2026-06-26.
// A failure here means the real API shape diverged from the schema.

describe("logRecordSchema contract", () => {
  it("parses every record in the fixture", () => {
    for (const record of fixture.records) {
      expect(() => logRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("fixture contains both NONE and ERROR status values", () => {
    const statuses = fixture.records.map((r) => (r as LogRecord).status);
    expect(statuses).toContain("NONE");
    expect(statuses).toContain("ERROR");
  });
});

// ── Normalizer ────────────────────────────────────────────────────────────────

describe("normalizeLog", () => {
  it("maps raw fields to the domain model (ERROR record)", () => {
    const errorRecord = fixture.records.find((r) => (r as LogRecord).status === "ERROR") as LogRecord;
    expect(errorRecord).toBeDefined();
    const entry = normalizeLog(errorRecord);
    expect(entry).toMatchObject({
      level: "ERROR",
      service: "function-runner",
      host: "srv-prod-lambda-01",
      status: "ERROR",
    });
    expect(entry.raw).toBeDefined();
  });

  it("maps raw fields to the domain model (NONE record)", () => {
    const noneRecord = fixture.records.find((r) => (r as LogRecord).status === "NONE") as LogRecord;
    expect(noneRecord).toBeDefined();
    const entry = normalizeLog(noneRecord);
    expect(entry).toMatchObject({
      level: "NONE",
      service: "entity-query-engine",
      host: "srv-prod-query-02",
      status: "NONE",
    });
  });

  it("prefers host.name over dt.entity.host", () => {
    // Real fixture records have host.name set; verify normalizer picks it up
    const record = fixture.records[0] as LogRecord;
    const entry = normalizeLog(record);
    expect(entry.host).toBe("srv-prod-query-02");
  });

  it("falls back to dt.entity.host when host.name is absent", () => {
    const entry = normalizeLog({ timestamp: "t", content: "c", loglevel: "info", "dt.entity.host": "HOST-abc" });
    expect(entry.host).toBe("HOST-abc");
  });

  it("upper-cases the level", () => {
    const entry = normalizeLog({ timestamp: "t", content: "c", loglevel: "warn" });
    expect(entry.level).toBe("WARN");
  });
});

// ── Query builder ─────────────────────────────────────────────────────────────

describe("buildLogsQuery", () => {
  it("adds no level filter for 'all'", () => {
    expect(buildLogsQuery({ level: "all" })).not.toContain("filter status");
  });

  it("maps warn -> status WARN", () => {
    expect(buildLogsQuery({ level: "warn" })).toContain('filter status == "WARN"');
  });

  it("maps error -> status ERROR", () => {
    expect(buildLogsQuery({ level: "error" })).toContain('filter status == "ERROR"');
  });

  it("maps info -> status INFO", () => {
    expect(buildLogsQuery({ level: "info" })).toContain('filter status == "INFO"');
  });

  it("maps none -> status NONE", () => {
    expect(buildLogsQuery({ level: "none" })).toContain('filter status == "NONE"');
  });

  it("always sorts desc and applies a limit", () => {
    const q = buildLogsQuery({ limit: 25 });
    expect(q).toContain("sort timestamp desc");
    expect(q).toContain("limit 25");
  });

  it("embeds relative timeframe via timeframeDql", () => {
    const q = buildLogsQuery({ timeframeDql: "24h" });
    expect(q).toContain("fetch logs, from: now()-24h");
  });

  it("falls back to ISO range via timeframe when no timeframeDql", () => {
    const q = buildLogsQuery({ timeframe: { start: "2024-01-01T00:00:00Z", end: "2024-01-02T00:00:00Z" } });
    expect(q).toContain('fetch logs, from: "2024-01-01T00:00:00Z", to: "2024-01-02T00:00:00Z"');
  });

  it("uses plain 'fetch logs' when no timeframe is provided", () => {
    const q = buildLogsQuery({});
    expect(q).toMatch(/^fetch logs[^,]/);
  });
});

// ── Resource call through an injected transport ────────────────────────────────

describe("listLogs", () => {
  const fakeTransport = (records: unknown[]): DynatraceTransport => ({
    executeDql: async () => records as never,
  });

  it("returns normalized entries from the transport", async () => {
    const entries = await listLogs(fakeTransport(fixture.records), TENANT, { level: "all" });
    expect(entries).toHaveLength(fixture.records.length);
    const errorEntry = entries.find((e) => e.level === "ERROR");
    expect(errorEntry?.service).toBe("function-runner");
  });

  it("skips records that fail schema validation", async () => {
    const dirty = [fixture.records[0], { loglevel: "ERROR" } /* missing timestamp+content */];
    const entries = await listLogs(fakeTransport(dirty), TENANT);
    expect(entries).toHaveLength(1);
  });
});
