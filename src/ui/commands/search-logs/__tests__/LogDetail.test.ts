import type { ReactElement } from "react";
import type { LogEntry, LogRecord, TenantConfig } from "../../../../sdk";
import { serialize, type Node } from "../../../__tests__/raycastTree";
import { buildLogContextQuery, traceLink } from "../LogDetail.helpers";
import LogDetail from "../LogDetail";
import { fenceCode } from "../../../lib/markdown";
import { HOSTILE, unfencedLines } from "../../../__tests__/markdownSafety";

// LogDetail is called as a function (no React renderer): the Raycast components
// are named stubs, so the returned tree can be searched. What goes into each
// field is tested in LogDetail.helpers.test.ts; this file checks the wiring.
jest.mock("@raycast/api", () => ({
  ...jest.requireActual("@raycast/api"),
  ...jest
    .requireActual<typeof import("../../../__tests__/raycastTree")>("../../../__tests__/raycastTree")
    .raycastStubs(),
  Icon: new Proxy({}, { get: (_, name) => String(name) }),
  useNavigation: () => ({ push: mockPush }),
}));
jest.mock("../../search-traces/SearchTraces", () => Object.assign(() => null, { displayName: "SearchTraces" }));
jest.mock("../../run-dql/RunDql", () => Object.assign(() => null, { displayName: "RunDql" }));

const mockPush = jest.fn();

function runAction(onAction: () => void) {
  mockPush.mockClear();
  onAction();
  return mockPush.mock.calls[0]?.[0] as ReactElement<Record<string, unknown>> | undefined;
}

type El = Exclude<Node, string>;
const walk = (n: Node | undefined): El[] =>
  !n || typeof n === "string" ? [] : [n, ...(n.children ?? []).flatMap(walk), ...walk(n.pushes)];

function render(entry: LogEntry, tenant?: TenantConfig) {
  const tree = serialize(
    LogDetail({ entry, tenant, timeframe: "6h" }) as ReactElement<Record<string, unknown>>,
    runAction,
  ) as El;
  const actions = walk(tree.props.actions as Node).filter((n) => n.props.title);
  return {
    tree,
    markdown: tree.props.markdown as string,
    action: (title: string) => actions.find((a) => a.props.title === title),
    metadata: walk(tree.props.metadata as Node),
  };
}

const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;
const raw = { "service.name": "checkout", trace_id: "trace-abc", "custom.attribute": "x" };
const entry: LogEntry = {
  timestamp: "2026-01-02T03:04:05.000Z",
  level: "ERROR",
  content: "hello",
  status: "ERROR",
  traceId: "trace-abc",
  raw: raw as unknown as LogRecord,
};

describe("LogDetail", () => {
  it("offers the context query and the trace, in Raycast and in Dynatrace", () => {
    const view = render(entry, tenant);
    const query = buildLogContextQuery(raw);
    expect(view.tree.props.navigationTitle).toBe("checkout — ERROR");
    expect(view.action("Copy DQL Filter")?.props.content).toBe(query);
    expect(view.action("Open DQL Filter in Run DQL")?.pushes).toMatchObject({
      type: "RunDql",
      props: { initialQuery: query },
    });
    expect(view.action("View Trace in Raycast")?.pushes).toMatchObject({
      type: "SearchTraces",
      props: { initialTraceId: "trace-abc", initialTimeframe: "6h" },
    });
    expect(view.action("Open in Distributed Traces")?.props.url).toBe(traceLink(tenant, "trace-abc"));
    expect(view.action("Copy Trace Link")).toBeDefined();
    expect(view.metadata.find((n) => n.type === "Detail.Metadata.Link")?.props.target).toBe(
      traceLink(tenant, "trace-abc"),
    );
    // Telemetry reaches the markdown only inside code fences or the SVG card (THREAT_MODEL R1, R2).
    expect(view.markdown).toContain(fenceCode("hello"));
    expect(view.markdown).toContain(fenceCode(query));
    expect(view.markdown).toContain(fenceCode(JSON.stringify(raw, null, 2), "json"));
  });

  it("keeps hostile telemetry inside fences and SVG cards", () => {
    const hostileRaw = { "service.name": HOSTILE, "log.source": HOSTILE, "k8s.pod.name": HOSTILE, [HOSTILE]: HOSTILE };
    const view = render({
      ...entry,
      content: HOSTILE,
      service: HOSTILE,
      source: HOSTILE,
      host: HOSTILE,
      raw: hostileRaw as unknown as LogRecord,
    });
    expect(unfencedLines(view.markdown)).toEqual(["### DQL Filter *(⌘⇧Q to copy)*", "### Raw Fields"]);
  });

  it("keeps the in-Raycast trace action but no Dynatrace link without a tenant", () => {
    const view = render(entry);
    expect(view.action("View Trace in Raycast")).toBeDefined();
    expect(view.action("Copy Trace ID")).toBeDefined();
    expect(view.action("Open in Distributed Traces")).toBeUndefined();
    expect(view.action("Copy Trace Link")).toBeUndefined();
    expect(view.metadata.find((n) => n.props.title === "Trace")?.type).toBe("Detail.Metadata.Label");
  });

  it("has no trace actions for a log without a trace", () => {
    const view = render({ ...entry, traceId: undefined }, tenant);
    expect(view.action("View Trace in Raycast")).toBeUndefined();
    expect(view.action("Open in Distributed Traces")).toBeUndefined();
    expect(view.metadata.find((n) => n.props.title === "Trace")).toBeUndefined();
  });
});
