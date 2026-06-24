import {
  logRecordSchema,
  normalizeLog,
  buildLogsQuery,
  listLogs,
  type LogRecord,
} from "../logs";
import type { DynatraceTransport } from "../../transport";
import type { TenantConfig } from "../../auth";
import fixture from "../__fixtures__/logs.search.json";

const TENANT = { id: "t1" } as TenantConfig;

// ── Contract: schema parses the captured fixture ───────────────────────────────

describe("logRecordSchema contract", () => {
  it("parses every record in the fixture", () => {
    for (const record of fixture) {
      expect(() => logRecordSchema.parse(record)).not.toThrow();
    }
  });
});

// ── Normalizer ────────────────────────────────────────────────────────────────

describe("normalizeLog", () => {
  it("maps raw fields to the domain model", () => {
    const entry = normalizeLog(fixture[0] as LogRecord);
    expect(entry).toMatchObject({
      level: "ERROR",
      service: "payment-service",
      host: "HOST-abc123",
      status: "ERROR",
      source: "/var/log/payment-service/app.log",
    });
    expect(entry.raw).toBeDefined();
  });

  it("prefers host.name over dt.entity.host", () => {
    const entry = normalizeLog(fixture[2] as LogRecord);
    expect(entry.host).toBe("gateway-node-01");
  });

  it("upper-cases the level", () => {
    const entry = normalizeLog({ timestamp: "t", content: "c", loglevel: "warn" });
    expect(entry.level).toBe("WARN");
  });
});

// ── Query builder ─────────────────────────────────────────────────────────────

describe("buildLogsQuery", () => {
  it("adds no level filter for 'all'", () => {
    expect(buildLogsQuery({ level: "all" })).not.toContain("filter loglevel");
  });

  it("maps warning -> WARN", () => {
    expect(buildLogsQuery({ level: "warning" })).toContain('filter loglevel == "WARN"');
  });

  it("escapes serviceName and contentFilter", () => {
    const q = buildLogsQuery({ serviceName: 'sv"x', contentFilter: 'a"b' });
    expect(q).toContain('service.name == "sv\\"x"');
    expect(q).toContain('matchesPhrase(content, "a\\"b")');
  });

  it("always sorts desc and applies a limit", () => {
    const q = buildLogsQuery({ limit: 25 });
    expect(q).toContain("sort timestamp desc");
    expect(q).toContain("limit 25");
  });
});

// ── Resource call through an injected transport ────────────────────────────────

describe("listLogs", () => {
  const fakeTransport = (records: unknown[]): DynatraceTransport => ({
    executeDql: async () => records as never,
    rest: async () => {
      throw new Error("not used");
    },
  });

  it("returns normalized entries from the transport", async () => {
    const entries = await listLogs(fakeTransport(fixture), TENANT, { level: "all" });
    expect(entries).toHaveLength(fixture.length);
    expect(entries[0].level).toBe("ERROR");
    expect(entries[0].service).toBe("payment-service");
  });

  it("skips records that fail schema validation", async () => {
    const dirty = [fixture[0], { loglevel: "ERROR" } /* missing timestamp+content */];
    const entries = await listLogs(fakeTransport(dirty), TENANT);
    expect(entries).toHaveLength(1);
  });
});
