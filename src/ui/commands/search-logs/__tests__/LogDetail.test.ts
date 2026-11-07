import type { ReactElement } from "react";
import type { LogEntry, LogRecord, TenantConfig } from "../../../../sdk";
import { serialize as serializeTree } from "../../../__tests__/raycastTree";
import LogDetail from "../LogDetail";

// LogDetail is rendered by calling it as a function (no React renderer in the
// test setup): the Raycast components are named stubs, so the returned element
// tree can be serialized and pinned.
jest.mock("@raycast/api", () => ({
  ...jest.requireActual("@raycast/api"),
  ...jest
    .requireActual<typeof import("../../../__tests__/raycastTree")>("../../../__tests__/raycastTree")
    .raycastStubs(),
  Icon: {
    MagnifyingGlass: "icon-magnifying-glass",
    Terminal: "icon-terminal",
    Clock: "icon-clock",
    Gear: "icon-gear",
    AppWindow: "icon-app-window",
    ComputerChip: "icon-computer-chip",
    Cloud: "icon-cloud",
    Box: "icon-box",
    Link: "icon-link",
  },
  useNavigation: () => ({ push: mockPush }),
}));
jest.mock("../../search-traces/SearchTraces", () => Object.assign(() => null, { displayName: "SearchTraces" }));
jest.mock("../../run-dql/RunDql", () => Object.assign(() => null, { displayName: "RunDql" }));

const mockPush = jest.fn();

// Runs an action's handler and returns what it pushed, so push targets and props are pinned.
function runAction(onAction: () => void) {
  mockPush.mockClear();
  onAction();
  return mockPush.mock.calls[0]?.[0] as ReactElement<Record<string, unknown>> | undefined;
}

const serialize = (el: ReactElement<Record<string, unknown>>) => serializeTree(el, runAction);

/** Spells an embedded SVG out as its text nodes, so snapshots pin the content without the base64. */
function svgText(b64: string): string {
  const texts = [
    ...Buffer.from(b64, "base64")
      .toString()
      .matchAll(/<text[^>]*>([^<]*)<\/text>/g),
  ].map((m) => m[1]);
  return `{SVG: ${texts.join(" | ")}}`;
}

function render(entry: LogEntry, tenant?: TenantConfig, timeframe?: string) {
  const tree = serialize(
    LogDetail({ entry, tenant, timeframe: timeframe as never }) as ReactElement<Record<string, unknown>>,
  );
  if (typeof tree === "string") throw new Error("unexpected text root");
  const { markdown, ...rest } = tree.props;
  // Zero-width spaces (autolink suppression) are spelled out so the snapshot stays lint-clean.
  return {
    markdown: (markdown as string)
      .replaceAll("\u200B", "{ZWSP}")
      .replace(/!\[\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)/g, (_, b64) => svgText(b64)),
    tree: { ...tree, props: rest },
  };
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
       "markdown": "{SVG: shop | /var/log/app.log}

     \`\`\`
     hello
     \`\`\`

     {SVG: TOPOLOGY | dt.source_entity | PROCESS_GROUP_INSTANCE-1, | HOST-1 | dt.entity.host | HOST-1 | dt.entity.process_group_insta… | PGI-1 | dt.entity.custom_device | CD-1 | dt.entity.aws_lambda_function | AWS_LAMBDA-1 | INFRASTRUCTURE | dt.host_group.id | hg-1 | aws.availability_zone | eu-west-1a | cloud.account.id | 123456789012 | aws.arn | arn:aws:lambda:eu-west-1:123:functio | n:x | SERVERLESS | faas.name | fn | faas.version | $LATEST | faas.id | fid | KUBERNETES | k8s.node.name | node-1 | k8s.pod.uid | pod-uid | APPLICATION | dt.app.version | 1.2.3 | process.technology | JAVA, TOMCAT | OperatorVersion | v1 | PIPELINE | dt.openpipeline.source | oneagent | dt.openpipeline.pipelines | logs:default | dt.auth.origin | token | TELEMETRY | event.type | LOG}

     ### DQL Filter *(⌘⇧Q to copy)*

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
                   "icon": {
                     "source": {
                       "dark": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRkY2MzY5IiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGNjM2OSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOSA5bDYgNk0xNSA5bC02IDYiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkY2MzY5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48L3N2Zz4=",
                       "light": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRDkyRDNBIiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0Q5MkQzQSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOSA5bDYgNk0xNSA5bC02IDYiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRDkyRDNBIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48L3N2Zz4=",
                     },
                   },
                   "text": "ERROR",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-clock",
                     "tintColor": "raycast-color-secondary",
                   },
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
                   "icon": {
                     "source": "icon-gear",
                     "tintColor": undefined,
                   },
                   "text": "java-app",
                   "title": "Process",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-app-window",
                     "tintColor": undefined,
                   },
                   "text": "shop",
                   "title": "App",
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
                 "props": {
                   "icon": {
                     "source": "icon-computer-chip",
                     "tintColor": undefined,
                   },
                   "text": "HOST-1",
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
                   "icon": {
                     "source": "icon-cloud",
                     "tintColor": "raycast-color-blue",
                   },
                   "text": "aws · eu-west-1",
                   "title": "Cloud",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-box",
                     "tintColor": "raycast-color-blue",
                   },
                   "text": "ns · c1",
                   "title": "Kubernetes",
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
       "markdown": "{SVG: Unknown service | }



     ### DQL Filter *(⌘⇧Q to copy)*

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
                   "icon": {
                     "source": {
                       "dark": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRkZCMjI0IiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48cGF0aCBkPSJNMTIgNEwyMSAxOUgzWiIgY2xhc3M9ImFzIiBmaWxsPSJub25lIiBzdHJva2U9IiNGRkIyMjQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTEyIDEwdjQiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZCMjI0IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTYuNiIgcj0iMSIgY2xhc3M9ImFmIiBmaWxsPSIjRkZCMjI0Ii8+PC9nPjwvc3ZnPg==",
                       "light": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjQzc3NzAwIiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48cGF0aCBkPSJNMTIgNEwyMSAxOUgzWiIgY2xhc3M9ImFzIiBmaWxsPSJub25lIiBzdHJva2U9IiNDNzc3MDAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTEyIDEwdjQiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQzc3NzAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTYuNiIgcj0iMSIgY2xhc3M9ImFmIiBmaWxsPSIjQzc3NzAwIi8+PC9nPjwvc3ZnPg==",
                     },
                   },
                   "text": "WARN",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-clock",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Timestamp",
                 },
                 "type": "Detail.Metadata.Label",
               },
               "",
               "",
               "",
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
        "deployment.environment": "production",
        span_id: "span-9",
        "aws.region": "us-east-1",
        "aws.account.id": "999",
      },
      { status: "ok", traceId: "trace-abc" },
    );
    expect(render(entry, tenant, "now-24h")).toMatchInlineSnapshot(`
     {
       "markdown": "{SVG: shop | }

     \`\`\`
     hello
     \`\`\`

     {SVG: INFRASTRUCTURE | cloud.account.id | 999 | TELEMETRY | span_id | span-9}

     ### DQL Filter *(⌘⇧Q to copy)*

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
       "deployment.environment": "production",
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
                   "icon": {
                     "source": {
                       "dark": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjNENDMzhBIiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRDQzM4QSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOCAxMi41bDIuNyAyLjdMMTYgOS41IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRDQzM4QSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PC9zdmc+",
                       "light": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjMUY4QTRDIiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFGOEE0QyIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOCAxMi41bDIuNyAyLjdMMTYgOS41IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFGOEE0QyIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PC9zdmc+",
                     },
                   },
                   "text": "INFO",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-clock",
                     "tintColor": "raycast-color-secondary",
                   },
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
                   "icon": {
                     "source": "icon-app-window",
                     "tintColor": undefined,
                   },
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
                 "props": {
                   "icon": {
                     "source": "icon-computer-chip",
                     "tintColor": undefined,
                   },
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
                   "icon": {
                     "source": "icon-cloud",
                     "tintColor": "raycast-color-blue",
                   },
                   "text": "us-east-1",
                   "title": "Cloud",
                 },
                 "type": "Detail.Metadata.Label",
               },
               "",
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-abc%22",
                   "text": "trace-abc",
                   "title": "Trace",
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
       "markdown": "{SVG: Unknown service | }

     \`\`\`
     hello
     \`\`\`

     ### DQL Filter *(⌘⇧Q to copy)*

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
                   "icon": {
                     "source": {
                       "dark": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRkY2MzY5IiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGNjM2OSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOSA5bDYgNk0xNSA5bC02IDYiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkY2MzY5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48L3N2Zz4=",
                       "light": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRDkyRDNBIiBmaWxsLW9wYWNpdHk9IjAuMTYiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0IDQpIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBjbGFzcz0iYXMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0Q5MkQzQSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOSA5bDYgNk0xNSA5bC02IDYiIGNsYXNzPSJhcyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRDkyRDNBIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48L3N2Zz4=",
                     },
                   },
                   "text": "DEBUG",
                   "title": "Level",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-clock",
                     "tintColor": "raycast-color-secondary",
                   },
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
                   "icon": {
                     "source": "icon-gear",
                     "tintColor": undefined,
                   },
                   "text": "proc",
                   "title": "Process",
                 },
                 "type": "Detail.Metadata.Label",
               },
               "",
               "",
               "",
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-link",
                     "tintColor": "raycast-color-green",
                   },
                   "text": "t-1",
                   "title": "Trace",
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
