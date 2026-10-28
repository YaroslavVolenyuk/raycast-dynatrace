import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { LogEntry, LogRecord, TenantConfig } from "../../../../sdk";
import LogDetail from "../LogDetail";

// LogDetail is rendered by calling it as a function (no React renderer in the
// test setup): the Raycast components are named stubs, so the returned element
// tree can be serialized and pinned.
jest.mock("@raycast/api", () => {
  const stub = (name: string) => Object.assign(() => null, { displayName: name });
  const TagList = Object.assign(stub("Detail.Metadata.TagList"), { Item: stub("Detail.Metadata.TagList.Item") });
  const Metadata = Object.assign(stub("Detail.Metadata"), {
    Label: stub("Detail.Metadata.Label"),
    Link: stub("Detail.Metadata.Link"),
    Separator: stub("Detail.Metadata.Separator"),
    TagList,
  });
  return {
    ...jest.requireActual("@raycast/api"),
    Detail: Object.assign(stub("Detail"), { Metadata }),
    ActionPanel: stub("ActionPanel"),
    Action: Object.assign(stub("Action"), {
      OpenInBrowser: stub("Action.OpenInBrowser"),
      CopyToClipboard: stub("Action.CopyToClipboard"),
    }),
    Icon: { MagnifyingGlass: "icon-magnifying-glass", Terminal: "icon-terminal" },
    useNavigation: () => ({ push: mockPush }),
  };
});
jest.mock("../../search-traces/SearchTraces", () => Object.assign(() => null, { displayName: "SearchTraces" }));
jest.mock("../../run-dql/RunDql", () => Object.assign(() => null, { displayName: "RunDql" }));

const mockPush = jest.fn();

type Node = { type: string; props: Record<string, unknown>; children?: Node[]; pushes?: Node } | string;

function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  return (type as { displayName?: string }).displayName ?? "Unknown";
}

// Flattens fragments and drops empty children so the output reflects what Raycast renders.
function serializeChildren(children: ReactNode): Node[] {
  const list = Array.isArray(children) ? children : [children];
  return list.flatMap((c): Node[] => {
    if (c == null || typeof c === "boolean") return [];
    if (Array.isArray(c)) return serializeChildren(c);
    if (!isValidElement(c)) return [String(c)];
    const el = c as ReactElement<Record<string, unknown>>;
    if (typeof el.type === "symbol") return serializeChildren(el.props.children as ReactNode);
    return [serialize(el)];
  });
}

function serialize(el: ReactElement<Record<string, unknown>>): Node {
  const props: Record<string, unknown> = {};
  let pushes: Node | undefined;
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children") continue;
    if (isValidElement(v)) props[k] = serialize(v as ReactElement<Record<string, unknown>>);
    else if (typeof v === "function") {
      props[k] = "[Function]";
      if (k === "onAction") {
        mockPush.mockClear();
        (v as () => void)();
        const pushed = mockPush.mock.calls[0]?.[0] as ReactElement<Record<string, unknown>> | undefined;
        if (pushed) pushes = serialize(pushed);
      }
    } else props[k] = v;
  }
  const children = serializeChildren(el.props.children as ReactNode);
  return {
    type: typeName(el.type),
    props,
    ...(children.length ? { children } : {}),
    ...(pushes ? { pushes } : {}),
  };
}

function render(entry: LogEntry, tenant?: TenantConfig, timeframe?: string) {
  const tree = serialize(
    LogDetail({ entry, tenant, timeframe: timeframe as never }) as ReactElement<Record<string, unknown>>,
  );
  if (typeof tree === "string") throw new Error("unexpected text root");
  const { markdown, ...rest } = tree.props;
  // Zero-width spaces (autolink suppression) are spelled out so the snapshot stays lint-clean.
  return { markdown: (markdown as string).replaceAll("\u200B", "{ZWSP}"), tree: { ...tree, props: rest } };
}

const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;

function entryOf(raw: Record<string, unknown>, extra: Partial<LogEntry> = {}): LogEntry {
  return { timestamp: "2026-01-02T03:04:05.000Z", level: "INFO", content: "hello", raw: raw as LogRecord, ...extra };
}

beforeAll(() => {
  jest.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) {
    return this.toISOString();
  });
});

describe("LogDetail", () => {
  it("renders a rich AWS + k8s entry", () => {
    const entry = entryOf(
      {
        "event.type": "LOG",
        "service.name": "checkout",
        "dt.app.name": "shop",
        "dt.app.version": "1.2.3",
        "dt.entity.host": "HOST-1",
        "dt.host_group.id": "hg-1",
        "cloud.region": "eu-west-1",
        "aws.availability_zone": "eu-west-1a",
        "cloud.account.id": "123456789012",
        "aws.arn": "arn:aws:lambda:eu-west-1:123:function:x",
        "cloud.provider": "aws",
        "faas.id": "fid",
        "faas.name": "fn",
        "faas.version": "$LATEST",
        "k8s.cluster.name": "c1",
        "k8s.namespace.name": "ns",
        "k8s.node.name": "node-1",
        "k8s.pod.uid": "pod-uid",
        "dt.process_group.detected_name": "java-app",
        "process.technology": ["JAVA", "", "TOMCAT"],
        OperatorVersion: "v1",
        "dt.openpipeline.source": "oneagent",
        "dt.openpipeline.pipelines": ["logs:default"],
        "dt.auth_origin": "token",
        environment: "staging",
        "dt.source_entity": ["PROCESS_GROUP_INSTANCE-1", "HOST-1"],
        "dt.entity.custom_device": "CD-1",
        "dt.entity.aws_lambda_function": "AWS_LAMBDA-1",
        "dt.entity.process_group_instance": "PGI-1",
        "host.name": "N/A",
      },
      { level: "ERROR", status: "ERROR", source: "/var/log/app.log" },
    );
    expect(render(entry, tenant, "now-2h")).toMatchInlineSnapshot(`
     {
       "markdown": "\`\`\`
     hello
     \`\`\`

     ### Topology

     | Field | Value |
     |---|---|
     | dt{ZWSP}.source\\_entity | PROCESS\\_GROUP\\_INSTANCE-1, HOST-1 |
     | dt{ZWSP}.entity{ZWSP}.host | HOST-1 |
     | dt{ZWSP}.entity{ZWSP}.process\\_group\\_instance | PGI-1 |
     | dt{ZWSP}.entity{ZWSP}.custom\\_device | CD-1 |
     | dt{ZWSP}.entity{ZWSP}.aws\\_lambda\\_function | AWS\\_LAMBDA-1 |

     ### Fields

     | Field | Value |
     |---|---|
     | host{ZWSP}.name | HOST-1 |
     | dt{ZWSP}.host\\_group{ZWSP}.id | hg-1 |
     | cloud{ZWSP}.provider | aws |
     | cloud{ZWSP}.region | eu-west-1 |
     | aws{ZWSP}.availability\\_zone | eu-west-1a |
     | cloud{ZWSP}.account{ZWSP}.id | 123456789012 |
     | aws{ZWSP}.arn | arn:aws:lambda:eu-west-1:123:function:x |
     | faas{ZWSP}.name | fn |
     | faas{ZWSP}.version | $LATEST |
     | faas{ZWSP}.id | fid |
     | k8s{ZWSP}.cluster{ZWSP}.name | c1 |
     | k8s{ZWSP}.namespace{ZWSP}.name | ns |
     | k8s{ZWSP}.node{ZWSP}.name | node-1 |
     | k8s{ZWSP}.pod{ZWSP}.uid | pod-uid |
     | dt{ZWSP}.app{ZWSP}.name | shop |
     | dt{ZWSP}.app{ZWSP}.version | 1{ZWSP}.2{ZWSP}.3 |
     | dt{ZWSP}.process{ZWSP}.name | java-app |
     | process{ZWSP}.technology | JAVA, TOMCAT |
     | log{ZWSP}.source | /var/log/app{ZWSP}.log |
     | OperatorVersion | v1 |
     | dt{ZWSP}.openpipeline{ZWSP}.source | oneagent |
     | dt{ZWSP}.openpipeline{ZWSP}.pipelines | logs:default |
     | dt{ZWSP}.auth{ZWSP}.origin | token |
     | event{ZWSP}.type | LOG |
     | dt{ZWSP}.environment{ZWSP}.id | staging |

     ### DQL Filter *(⌘D to copy)*

     \`\`\`
     fetch logs
     | filter service.name == "checkout"
     | limit 100
     \`\`\`

     ### Raw Fields

     \`\`\`json
     {
       "event.type": "LOG",
       "service.name": "checkout",
       "dt.app.name": "shop",
       "dt.app.version": "1.2.3",
       "dt.entity.host": "HOST-1",
       "dt.host_group.id": "hg-1",
       "cloud.region": "eu-west-1",
       "aws.availability_zone": "eu-west-1a",
       "cloud.account.id": "123456789012",
       "aws.arn": "arn:aws:lambda:eu-west-1:123:function:x",
       "cloud.provider": "aws",
       "faas.id": "fid",
       "faas.name": "fn",
       "faas.version": "$LATEST",
       "k8s.cluster.name": "c1",
       "k8s.namespace.name": "ns",
       "k8s.node.name": "node-1",
       "k8s.pod.uid": "pod-uid",
       "dt.process_group.detected_name": "java-app",
       "process.technology": [
         "JAVA",
         "",
         "TOMCAT"
       ],
       "OperatorVersion": "v1",
       "dt.openpipeline.source": "oneagent",
       "dt.openpipeline.pipelines": [
         "logs:default"
       ],
       "dt.auth_origin": "token",
       "environment": "staging",
       "dt.source_entity": [
         "PROCESS_GROUP_INSTANCE-1",
         "HOST-1"
       ],
       "dt.entity.custom_device": "CD-1",
       "dt.entity.aws_lambda_function": "AWS_LAMBDA-1",
       "dt.entity.process_group_instance": "PGI-1",
       "host.name": "N/A"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
               {
                 "props": {
                   "icon": "icon-terminal",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "d",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Open DQL Filter in Run DQL",
                 },
                 "pushes": {
                   "props": {
                     "initialQuery": "fetch logs
     | filter service.name == "checkout"
     | limit 100",
                   },
                   "type": "RunDql",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "content": "fetch logs
     | filter service.name == "checkout"
     | limit 100",
                   "shortcut": {
                     "key": "q",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy DQL Filter",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "hello",
                   "title": "Copy Log Content",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "2026-01-02T03:04:05.000Z",
                   "title": "Copy Timestamp",
                 },
                 "type": "Action.CopyToClipboard",
               },
             ],
             "props": {},
             "type": "ActionPanel",
           },
           "metadata": {
             "children": [
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-red",
                       "text": "ERROR",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Status",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {
                   "text": "ERROR",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Timestamp",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-blue",
                       "text": "checkout",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Service",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {
                   "text": "java-app",
                   "title": "Process",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-yellow",
                       "text": "staging",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Environment",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "HOST-1",
                   "title": "Host",
                 },
                 "type": "Detail.Metadata.Label",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "checkout — ERROR",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("renders a minimal entry without tenant or timeframe", () => {
    expect(render(entryOf({}, { level: "WARN", content: "" }))).toMatchInlineSnapshot(`
     {
       "markdown": "

     ### DQL Filter *(⌘D to copy)*

     \`\`\`
     fetch logs
     | limit 100
     \`\`\`

     ### Raw Fields

     \`\`\`json
     {}
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
               {
                 "props": {
                   "icon": "icon-terminal",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "d",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Open DQL Filter in Run DQL",
                 },
                 "pushes": {
                   "props": {
                     "initialQuery": "fetch logs
     | limit 100",
                   },
                   "type": "RunDql",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "content": "fetch logs
     | limit 100",
                   "shortcut": {
                     "key": "q",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy DQL Filter",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "",
                   "title": "Copy Log Content",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "2026-01-02T03:04:05.000Z",
                   "title": "Copy Timestamp",
                 },
                 "type": "Action.CopyToClipboard",
               },
             ],
             "props": {},
             "type": "ActionPanel",
           },
           "metadata": {
             "children": [
               {
                 "props": {
                   "text": "WARN",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Timestamp",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "Log — WARN",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("renders an entry with a trace", () => {
    const entry = entryOf(
      {
        "dt.app.name": "shop",
        "host.name": "web-1",
        "dt.environment.id": "production",
        span_id: "span-9",
        "aws.region": "us-east-1",
        "aws.account.id": "999",
      },
      { status: "ok", traceId: "trace-abc" },
    );
    expect(render(entry, tenant, "now-24h")).toMatchInlineSnapshot(`
     {
       "markdown": "\`\`\`
     hello
     \`\`\`

     ### Fields

     | Field | Value |
     |---|---|
     | host{ZWSP}.name | web-1 |
     | cloud{ZWSP}.region | us-east-1 |
     | cloud{ZWSP}.account{ZWSP}.id | 999 |
     | dt{ZWSP}.app{ZWSP}.name | shop |
     | trace\\_id | trace-abc |
     | span\\_id | span-9 |
     | dt{ZWSP}.environment{ZWSP}.id | production |

     ### DQL Filter *(⌘D to copy)*

     \`\`\`
     fetch logs
     | filter dt.app.name == "shop"
     | limit 100
     \`\`\`

     ### Raw Fields

     \`\`\`json
     {
       "dt.app.name": "shop",
       "host.name": "web-1",
       "dt.environment.id": "production",
       "span_id": "span-9",
       "aws.region": "us-east-1",
       "aws.account.id": "999"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
               {
                 "props": {
                   "icon": "icon-magnifying-glass",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "t",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "View Trace in Raycast",
                 },
                 "pushes": {
                   "props": {
                     "initialTimeframe": "now-24h",
                     "initialTraceId": "trace-abc",
                   },
                   "type": "SearchTraces",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "shortcut": {
                     "key": "o",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Open in Distributed Traces",
                   "url": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-abc%22",
                 },
                 "type": "Action.OpenInBrowser",
               },
               {
                 "props": {
                   "icon": "icon-terminal",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "d",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Open DQL Filter in Run DQL",
                 },
                 "pushes": {
                   "props": {
                     "initialQuery": "fetch logs
     | filter dt.app.name == "shop"
     | limit 100",
                   },
                   "type": "RunDql",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "content": "fetch logs
     | filter dt.app.name == "shop"
     | limit 100",
                   "shortcut": {
                     "key": "q",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy DQL Filter",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "hello",
                   "title": "Copy Log Content",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "2026-01-02T03:04:05.000Z",
                   "title": "Copy Timestamp",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "trace-abc",
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-abc%22",
                   "title": "Copy Trace Link",
                 },
                 "type": "Action.CopyToClipboard",
               },
             ],
             "props": {},
             "type": "ActionPanel",
           },
           "metadata": {
             "children": [
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-green",
                       "text": "ok",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Status",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {
                   "text": "INFO",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Timestamp",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "shop",
                   "title": "App",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-green",
                       "text": "production",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Environment",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "web-1",
                   "title": "Host",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-abc%22",
                   "text": "Open in Explorer",
                   "title": "Distributed Trace",
                 },
                 "type": "Detail.Metadata.Link",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "shop — INFO",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("omits trace links without a tenant but keeps the in-Raycast trace action", () => {
    const entry = entryOf({ "dt.process.name": "proc" }, { level: "DEBUG", status: "FAILED", traceId: "t-1" });
    expect(render(entry)).toMatchInlineSnapshot(`
     {
       "markdown": "\`\`\`
     hello
     \`\`\`

     ### Fields

     | Field | Value |
     |---|---|
     | dt{ZWSP}.process{ZWSP}.name | proc |
     | trace\\_id | t-1 |

     ### DQL Filter *(⌘D to copy)*

     \`\`\`
     fetch logs
     | filter dt.process.name == "proc"
     | limit 100
     \`\`\`

     ### Raw Fields

     \`\`\`json
     {
       "dt.process.name": "proc"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
               {
                 "props": {
                   "icon": "icon-magnifying-glass",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "t",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "View Trace in Raycast",
                 },
                 "pushes": {
                   "props": {
                     "initialTimeframe": undefined,
                     "initialTraceId": "t-1",
                   },
                   "type": "SearchTraces",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "icon": "icon-terminal",
                   "onAction": "[Function]",
                   "shortcut": {
                     "key": "d",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Open DQL Filter in Run DQL",
                 },
                 "pushes": {
                   "props": {
                     "initialQuery": "fetch logs
     | filter dt.process.name == "proc"
     | limit 100",
                   },
                   "type": "RunDql",
                 },
                 "type": "Action",
               },
               {
                 "props": {
                   "content": "fetch logs
     | filter dt.process.name == "proc"
     | limit 100",
                   "shortcut": {
                     "key": "q",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy DQL Filter",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "hello",
                   "title": "Copy Log Content",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "2026-01-02T03:04:05.000Z",
                   "title": "Copy Timestamp",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "t-1",
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
             ],
             "props": {},
             "type": "ActionPanel",
           },
           "metadata": {
             "children": [
               {
                 "children": [
                   {
                     "props": {
                       "color": "raycast-color-red",
                       "text": "FAILED",
                     },
                     "type": "Detail.Metadata.TagList.Item",
                   },
                 ],
                 "props": {
                   "title": "Status",
                 },
                 "type": "Detail.Metadata.TagList",
               },
               {
                 "props": {
                   "text": "DEBUG",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Timestamp",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "proc",
                   "title": "Process",
                 },
                 "type": "Detail.Metadata.Label",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "proc — DEBUG",
         },
         "type": "Detail",
       },
     }
    `);
  });
});
