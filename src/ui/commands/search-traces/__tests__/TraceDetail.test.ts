import type { ReactElement } from "react";
import { normalizeSpan, type SpanRecord } from "../../../../sdk/resources";
import type { TenantConfig } from "../../../../sdk/auth";
import { serialize, type Node } from "../../../__tests__/raycastTree";
import { fenceCode } from "../../../lib/markdown";
import { HOSTILE, unfencedLines } from "../../../__tests__/markdownSafety";
import { traceLink } from "../TraceDetail.helpers";
import TraceDetail from "../TraceDetail";

// TraceDetail is called as a function (no React renderer): the Raycast components
// are named stubs, so the returned tree can be searched. What goes into each
// field is tested in TraceDetail.helpers.test.ts; this file checks the wiring.
jest.mock("@raycast/api", () => ({
  ...jest.requireActual("@raycast/api"),
  ...jest
    .requireActual<typeof import("../../../__tests__/raycastTree")>("../../../__tests__/raycastTree")
    .raycastStubs(),
  Icon: new Proxy({}, { get: (_, name) => String(name) }),
}));

type El = Exclude<Node, string>;
const walk = (n: Node | undefined): El[] =>
  !n || typeof n === "string" ? [] : [n, ...(n.children ?? []).flatMap(walk)];

function render(record: Record<string, unknown>, tenant?: TenantConfig) {
  const entry = normalizeSpan({
    "trace.id": "trace-1",
    "span.id": "span-1",
    start_time: "2026-01-02T03:04:05.000Z",
    ...record,
  } as SpanRecord);
  const tree = serialize(TraceDetail({ entry, tenant }) as ReactElement<Record<string, unknown>>) as El;
  const actions = walk(tree.props.actions as Node).filter((n) => n.props.title);
  const metadata = walk(tree.props.metadata as Node);
  return {
    entry,
    tree,
    markdown: tree.props.markdown as string,
    actionTitles: actions.map((a) => a.props.title),
    action: (title: string) => actions.find((a) => a.props.title === title),
    label: (title: string) => metadata.find((n) => n.props.title === title),
  };
}

const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;

describe("TraceDetail", () => {
  it("keeps hostile telemetry inside fences and SVG cards", () => {
    const fields = ["span.name", "service.name", "http.request.method", "url.path", "db.system", "db.statement"];
    const view = render({ ...Object.fromEntries(fields.map((f) => [f, HOSTILE])), [HOSTILE]: HOSTILE });
    expect(unfencedLines(view.markdown)).toEqual(["### Raw Fields"]);
  });

  it("shows the request, database and timing in the metadata pane and links the trace", () => {
    const record = {
      "span.kind": "SERVER",
      "span.name": "GET /orders",
      "span.status_code": "error",
      duration: 182_000_000,
      "service.name": "checkout",
      "http.request.method": "GET",
      "url.path": "/orders",
      "http.response.status_code": 500,
      "db.system": "postgresql",
      "db.operation.name": "SELECT",
      "db.namespace": "orders",
    };
    const view = render(record, tenant);
    expect(view.tree.props.navigationTitle).toBe("checkout — GET /orders");
    expect(view.label("Request")?.props.text).toBe("GET /orders");
    expect(view.label("HTTP Status")?.props.text).toBe("500");
    expect(view.label("Operation")?.props.text).toBe("SELECT orders");
    expect(view.label("Duration")?.props.text).toBe("182ms");
    expect(view.label("Root Span")).toBeDefined();
    expect(view.label("Trace")).toMatchObject({
      type: "Detail.Metadata.Link",
      props: { target: traceLink(tenant, "trace-1") },
    });
    expect(view.action("Open in Distributed Traces")?.props.url).toBe(traceLink(tenant, "trace-1"));
    expect(view.actionTitles).toEqual(expect.arrayContaining(["Copy Trace ID", "Copy Span ID", "Copy Trace Link"]));
    // Telemetry reaches the markdown only inside the raw-fields fence or the SVG cards (THREAT_MODEL R1, R2).
    expect(view.markdown).toContain(fenceCode(JSON.stringify(view.entry.raw, null, 2), "json"));
  });

  it("leaves out the HTTP, DB and Dynatrace links when they do not apply", () => {
    const view = render({ "span.parent_id": "span-0" });
    expect(view.label("Request")).toBeUndefined();
    expect(view.label("DB System")).toBeUndefined();
    expect(view.label("Root Span")).toBeUndefined();
    expect(view.label("Trace")?.type).toBe("Detail.Metadata.Label");
    expect(view.actionTitles).toEqual(["Copy Trace ID", "Copy Span ID"]);
  });
});
