import { normalizeSpan, type SpanRecord } from "../../../../sdk/resources";
import type { TenantConfig } from "../../../../sdk/auth";
import { fieldGroups, hasDb, hasHttp, traceLink } from "../TraceDetail.helpers";

const span = (record: Record<string, unknown>) =>
  normalizeSpan({ "trace.id": "trace-1", "span.id": "span-1", start_time: "t", ...record } as SpanRecord);

const rowsOf = (record: Record<string, unknown>) => {
  const entry = span(record);
  return Object.fromEntries(fieldGroups(entry, entry.raw as Record<string, unknown>).map((g) => [g.title, g.rows]));
};

describe("fieldGroups", () => {
  it("shows the HTTP, Database and RPC groups only for spans of that kind", () => {
    const server = { "server.address": "shop.example.com", "server.port": 443 };
    expect(rowsOf({ ...server, "http.request.method": "GET", "http.route": "/o/{id}" }).HTTP).toEqual([
      ["http.route", "/o/{id}"],
      ["server.address", "shop.example.com"],
      ["server.port", "443"],
    ]);
    expect(rowsOf({ ...server, "db.system": "redis", "db.namespace": "0" }).Database).toEqual([
      ["db.namespace", "0"],
      ["server.address", "shop.example.com"],
      ["server.port", "443"],
    ]);
    expect(rowsOf({ "rpc.method": "Ping" }).RPC).toEqual([["rpc.method", "Ping"]]);

    const plain = rowsOf({ ...server, "rpc.service": "Orders" });
    expect([plain.HTTP, plain.Database, plain.RPC]).toEqual([[], [], []]);
  });

  it("drops empty and N/A values", () => {
    const rows = rowsOf({ "span.parent_id": "span-0", "endpoint.name": "N/A", "rpc.system": "N/A", "rpc.method": "" });
    expect(rows.Span).toEqual([
      ["trace.id", "trace-1"],
      ["span.id", "span-1"],
      ["span.parent_id", "span-0"],
    ]);
    expect(rows.RPC).toEqual([]);
  });
});

describe("hasHttp / hasDb", () => {
  it("need a method or path, and a system or operation", () => {
    expect([hasHttp(span({ "url.path": "/x" })), hasHttp(span({ "http.route": "/x" }))]).toEqual([true, false]);
    expect([hasDb(span({ "db.operation.name": "GET" })), hasDb(span({ "db.namespace": "0" }))]).toEqual([true, false]);
  });
});

describe("traceLink", () => {
  const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;

  it("needs a tenant, and keeps the link for an empty trace id", () => {
    expect(traceLink(tenant, "trace-1")).toMatch(/^https:\/\/abc123\.apps\.dynatrace\.com\/ui\/apps\/.*trace-1/);
    expect(traceLink(tenant, "")).toBeDefined();
    expect(traceLink(undefined, "trace-1")).toBeUndefined();
  });
});
