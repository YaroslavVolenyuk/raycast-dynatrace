// Pure helpers for Trace Detail: which span fields go to the field card and the
// metadata pane, and the trace link. Kept out of the JSX so they are unit-testable.

import type { SpanEntry } from "../../../sdk/resources";
import type { TenantConfig } from "../../../sdk/auth";
import { buildTraceUrl } from "../../lib/deepLinks";
import type { KeyValueGroup } from "../../lib/svg";
import { tenantBaseUrl } from "../../components/TraceBlocks";

export type Raw = Record<string, unknown>;
type Row = readonly [string, string | undefined];

function val(v: unknown): string | undefined {
  if (v == null || v === "" || v === "N/A") return undefined;
  return String(v);
}

export const hasHttp = (entry: SpanEntry) => !!(entry.httpMethod || entry.urlPath);
export const hasDb = (entry: SpanEntry) => !!(entry.dbSystem || entry.dbOperation);
const hasRpc = (raw: Raw) => !!(val(raw["rpc.system"]) || val(raw["rpc.method"]));

// The status, kind, duration, start time, request, status code and database
// are in the metadata pane, so the field card holds only what is not there.
export function fieldGroups(entry: SpanEntry, raw: Raw): KeyValueGroup[] {
  const rawVal = (key: string) => val(raw[key]);
  const server: Row[] = [
    ["server.address", rawVal("server.address")],
    ["server.port", rawVal("server.port")],
  ];
  const groups: Array<{ title: string; show: boolean; rows: Row[] }> = [
    {
      title: "Span",
      show: true,
      rows: [
        ["trace.id", entry.traceId],
        ["span.id", entry.spanId],
        ["span.parent_id", entry.parentSpanId],
        ["endpoint.name", rawVal("endpoint.name")],
        ["status.message", entry.statusMessage],
      ],
    },
    { title: "HTTP", show: hasHttp(entry), rows: [["http.route", entry.httpRoute], ...server] },
    {
      title: "Database",
      show: hasDb(entry),
      rows: [["db.namespace", entry.dbNamespace], ["db.collection.name", rawVal("db.collection.name")], ...server],
    },
    {
      title: "RPC",
      show: hasRpc(raw),
      rows: [
        ["rpc.system", rawVal("rpc.system")],
        ["rpc.service", rawVal("rpc.service")],
        ["rpc.method", rawVal("rpc.method")],
      ],
    },
  ];
  return groups.map(({ title, show, rows }) => ({
    title,
    rows: show ? rows.flatMap(([k, v]) => (v ? [[k, v] as const] : [])) : [],
  }));
}

/** Link to the span's trace in Distributed Traces; needs a tenant. */
export function traceLink(tenant: TenantConfig | undefined, traceId: string): string | undefined {
  const baseUrl = tenantBaseUrl(tenant);
  return baseUrl ? buildTraceUrl(baseUrl, traceId) : undefined;
}
