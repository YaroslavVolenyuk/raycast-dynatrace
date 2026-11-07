import type { LogEntry, LogRecord, TenantConfig } from "../../../../sdk";
import { buildLogContextQuery, fieldGroups, logSummary, traceLink } from "../LogDetail.helpers";

const entryOf = (raw: Record<string, unknown>, extra: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: "2026-01-02T03:04:05.000Z",
  level: "INFO",
  content: "hello",
  raw: raw as LogRecord,
  ...extra,
});

describe("buildLogContextQuery", () => {
  it("filters on the service, else the app, else the process", () => {
    const all = { "service.name": "svc", "dt.app.name": "app", "dt.process_group.detected_name": "pg" };
    expect(buildLogContextQuery(all)).toBe('fetch logs\n| filter service.name == "svc"\n| limit 100');
    expect(buildLogContextQuery({ ...all, "service.name": "" })).toContain('filter dt.app.name == "app"');
    expect(buildLogContextQuery({ "dt.process.name": "proc", "dt.process_group.detected_name": "pg" })).toContain(
      'filter dt.process.name == "proc"',
    );
    expect(buildLogContextQuery({ "dt.process_group.detected_name": "pg" })).toContain(
      'filter dt.process.name == "pg"',
    );
    expect(buildLogContextQuery({})).toBe("fetch logs\n| limit 100");
  });

  // The value comes from telemetry: a quote must not end the DQL string literal (THREAT_MODEL Q1).
  it("escapes the telemetry value it filters on", () => {
    const hostile = 'x" or true or "\\';
    for (const key of ["service.name", "dt.app.name", "dt.process.name"]) {
      expect(buildLogContextQuery({ [key]: hostile })).toContain('== "x\\" or true or \\"\\\\"');
    }
  });
});

describe("logSummary", () => {
  it("prefers host.name over dt.entity.host and skips N/A", () => {
    expect(logSummary({ "host.name": "web-1", "dt.entity.host": "HOST-1" }, entryOf({})).hostName).toBe("web-1");
    expect(logSummary({ "host.name": "N/A", "dt.entity.host": "HOST-1" }, entryOf({})).hostName).toBe("HOST-1");
  });

  it("joins cloud and Kubernetes context, preferring aws.region", () => {
    const s = logSummary(
      {
        "cloud.provider": "aws",
        "aws.region": "us-east-1",
        "cloud.region": "eu-west-1",
        "k8s.namespace.name": "ns",
        "k8s.cluster.name": "c1",
        "deployment.environment": "production",
        environment: "staging",
      },
      entryOf({}),
    );
    expect(s).toMatchObject({ cloud: "aws · us-east-1", k8s: "ns · c1", envVal: "production" });
    expect(logSummary({}, entryOf({}))).toMatchObject({ cloud: "", k8s: "", hostName: undefined });
  });
});

describe("fieldGroups", () => {
  const rowsOf = (raw: Record<string, unknown>) =>
    Object.fromEntries(fieldGroups(raw, entryOf(raw)).map((g) => [g.title, g.rows]));

  it("shows each field once: known keys in their group, everything else under Other", () => {
    const raw = {
      "service.name": "svc",
      "host.name": "web-1",
      "aws.account.id": "111",
      "cloud.account.id": "222",
      "dt.auth_origin": "token",
      "faas.name": "fn",
      "custom.attribute": "x",
    };
    const rows = rowsOf(raw);
    expect(rows.Infrastructure).toEqual([["cloud.account.id", "111"]]);
    expect(rows.Pipeline).toEqual([["dt.auth.origin", "token"]]);
    expect(rows.Serverless).toEqual([["faas.name", "fn"]]);
    expect(rows.Other).toEqual([["custom.attribute", "x"]]);
    const shown = Object.values(rows).flatMap((r) => r.map(([k]) => k));
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("drops empty values and joins list fields", () => {
    const rows = rowsOf({
      "process.technology": ["JAVA", "", "TOMCAT"],
      "dt.entity.host": "N/A",
      "faas.id": "",
      blank: "",
      nothing: null,
    });
    expect(rows.Application).toEqual([["process.technology", "JAVA, TOMCAT"]]);
    expect(rows.Topology).toEqual([]);
    expect(rows.Serverless).toEqual([]);
    expect(rows.Other).toEqual([]);
  });
});

describe("traceLink", () => {
  const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;

  it("links to Distributed Traces only with a tenant and a trace id", () => {
    expect(traceLink(tenant, "t-1")).toMatch(/^https:\/\/abc123\.apps\.dynatrace\.com\/ui\/apps\/.*t-1/);
    expect(traceLink(undefined, "t-1")).toBeUndefined();
    expect(traceLink(tenant, undefined)).toBeUndefined();
  });
});
