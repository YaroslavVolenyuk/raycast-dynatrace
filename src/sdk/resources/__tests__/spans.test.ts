import { spanRecordSchema, normalizeSpan, buildSpansQuery, listSpans, formatDuration, type SpanRecord } from "../spans";
import type { DynatraceTransport } from "../../transport";
import type { TenantConfig } from "../../auth";
import fixture from "../__fixtures__/spans.search.json";

const TENANT = { id: "t1" } as TenantConfig;

// ── Contract: schema parses the fixture ──────────────────────────────────────
// Fixture shape verified against dt.semantic_dictionary.fields (2026-07-18).
// A failure here means the schema diverged from the documented field definitions.

/** Root span = no span.parent_id (how the extension derives isRootSpan). */
const findRoot = () => fixture.records.find((r) => (r as unknown as SpanRecord)["span.parent_id"] === undefined);

describe("spanRecordSchema contract", () => {
  it("parses every record in the fixture", () => {
    for (const record of fixture.records) {
      expect(() => spanRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("fixture contains lower-case ok and error status_code values (as Grail returns them)", () => {
    const codes = fixture.records.map((r) => (r as unknown as SpanRecord)["span.status_code"]);
    expect(codes).toContain("ok");
    expect(codes).toContain("error");
  });

  it("coerces string-encoded numeric fields (duration, http status, port)", () => {
    const root = findRoot();
    const parsed = spanRecordSchema.parse(root);
    expect(typeof parsed.duration).toBe("number");
    expect(typeof parsed["http.response.status_code"]).toBe("number");
    expect(typeof parsed["server.port"]).toBe("number");
  });

  it("fixture contains a root span and a DB error span", () => {
    const root = findRoot();
    const dbSpan = fixture.records.find((r) => (r as unknown as SpanRecord)["db.system"] !== undefined);
    expect(root).toBeDefined();
    expect(dbSpan).toBeDefined();
  });
});

// ── Normalizer ────────────────────────────────────────────────────────────────

describe("normalizeSpan", () => {
  it("maps root HTTP span correctly", () => {
    const root = findRoot() as unknown as SpanRecord;
    expect(root).toBeDefined();
    const entry = normalizeSpan(root);
    expect(entry.statusCode).toBe("OK");
    expect(entry.service).toBe("user-service");
    expect(entry.isRootSpan).toBe(true);
    expect(entry.httpMethod).toBe("GET");
    expect(entry.urlPath).toBe("/api/users");
    expect(entry.raw).toBeDefined();
  });

  it("maps DB error span correctly", () => {
    const dbSpan = fixture.records.find(
      (r) => (r as unknown as SpanRecord)["db.system"] !== undefined,
    ) as unknown as SpanRecord;
    expect(dbSpan).toBeDefined();
    const entry = normalizeSpan(dbSpan);
    expect(entry.statusCode).toBe("ERROR");
    expect(entry.isRootSpan).toBe(false); // has span.parent_id in the fixture
    expect(entry.dbSystem).toBe("postgresql");
    expect(entry.dbOperation).toBe("SELECT");
  });

  it("converts nanosecond duration string to microseconds", () => {
    const root = findRoot() as unknown as SpanRecord;
    const entry = normalizeSpan(spanRecordSchema.parse(root));
    // fixture duration "182000000" ns → 182000 µs → "182ms"
    expect(entry.durationUs).toBe(182_000);
    expect(formatDuration(entry.durationUs!)).toBe("182ms");
  });

  it("upper-cases status_code", () => {
    const entry = normalizeSpan({
      "trace.id": "abc",
      "span.id": "def",
      start_time: "2026-01-01T00:00:00Z",
      "span.status_code": "error",
    });
    expect(entry.statusCode).toBe("ERROR");
  });

  it("defaults to UNSET when span.status_code is absent", () => {
    const entry = normalizeSpan({ "trace.id": "abc", "span.id": "def", start_time: "2026-01-01T00:00:00Z" });
    expect(entry.statusCode).toBe("UNSET");
  });

  it("falls back to httpMethod+urlPath for name when span.name is absent", () => {
    const entry = normalizeSpan({
      "trace.id": "abc",
      "span.id": "def",
      start_time: "t",
      "http.request.method": "POST",
      "url.path": "/checkout",
    });
    expect(entry.name).toBe("POST /checkout");
  });

  it("falls back to db operation+namespace for name", () => {
    const entry = normalizeSpan({
      "trace.id": "abc",
      "span.id": "def",
      start_time: "t",
      "db.operation.name": "INSERT",
      "db.namespace": "mydb",
    });
    expect(entry.name).toBe("INSERT mydb");
  });

  it("falls back to spanId as last resort for name", () => {
    const entry = normalizeSpan({ "trace.id": "abc", "span.id": "xyz", start_time: "t" });
    expect(entry.name).toBe("xyz");
  });

  it("derives isRootSpan from the absence of span.parent_id", () => {
    const root = normalizeSpan({ "trace.id": "abc", "span.id": "def", start_time: "t" });
    expect(root.isRootSpan).toBe(true);
    const child = normalizeSpan({ "trace.id": "abc", "span.id": "def", "span.parent_id": "p1", start_time: "t" });
    expect(child.isRootSpan).toBe(false);
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats microseconds < 1000 as µs", () => {
    expect(formatDuration(500)).toBe("500µs");
  });

  it("formats microseconds as ms (< 1s)", () => {
    expect(formatDuration(182_000)).toBe("182ms");
    expect(formatDuration(52_000)).toBe("52ms");
  });

  it("formats microseconds >= 1s as seconds", () => {
    expect(formatDuration(5_001_000)).toBe("5.0s");
  });
});

// ── Query builder ─────────────────────────────────────────────────────────────

describe("buildSpansQuery", () => {
  it("adds no status filter for 'all'", () => {
    expect(buildSpansQuery({ status: "all" })).not.toContain("span.status_code");
  });

  // Grail stores span.status_code lower-case (verified MCP 2026-07-01):
  // filtering with the upper-case value matches zero records.
  it("filters ERROR status using the raw lower-case value", () => {
    expect(buildSpansQuery({ status: "error" })).toContain('`span.status_code` == "error"');
  });

  it("filters OK status using the raw lower-case value", () => {
    expect(buildSpansQuery({ status: "ok" })).toContain('`span.status_code` == "ok"');
  });

  it("filters by traceId via toString (trace.id is a uid field)", () => {
    const q = buildSpansQuery({ traceId: "abc123" });
    expect(q).toContain('toString(`trace.id`) == "abc123"');
  });

  it("escapes special chars in traceId", () => {
    const q = buildSpansQuery({ traceId: 'a"b' });
    expect(q).toContain('toString(`trace.id`) == "a\\"b"');
  });

  it("embeds relative timeframe", () => {
    expect(buildSpansQuery({ timeframeDql: "1h" })).toContain("fetch spans, from: now()-1h");
  });

  it("falls back to ISO range", () => {
    const q = buildSpansQuery({ timeframe: { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z" } });
    expect(q).toContain('fetch spans, from: "2026-01-01T00:00:00Z"');
  });

  it("always sorts desc and applies limit", () => {
    const q = buildSpansQuery({ limit: 20 });
    expect(q).toContain("sort start_time desc");
    expect(q).toContain("limit 20");
  });
});

// ── Resource call ─────────────────────────────────────────────────────────────

describe("listSpans", () => {
  const fakeTransport = (records: unknown[]): DynatraceTransport => ({
    executeDql: async () => records as never,
  });

  it("returns normalized entries from the transport", async () => {
    const { entries, skipped } = await listSpans(fakeTransport(fixture.records), TENANT);
    expect(skipped).toBe(0);
    expect(entries).toHaveLength(fixture.records.length);
    const errorEntry = entries.find((e) => e.statusCode === "ERROR");
    expect(errorEntry?.dbSystem).toBe("postgresql");
  });

  it("leaves out and counts records that fail schema validation", async () => {
    const dirty = [fixture.records[0], { "span.id": "no-trace" }]; // missing trace.id
    const { entries, skipped } = await listSpans(fakeTransport(dirty), TENANT);
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});
