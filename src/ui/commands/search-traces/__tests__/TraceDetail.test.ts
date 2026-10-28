import type { ReactElement } from "react";
import { normalizeSpan, type SpanRecord } from "../../../../sdk/resources";
import type { TenantConfig } from "../../../../sdk/auth";
import { serialize } from "../../../__tests__/raycastTree";
import TraceDetail from "../TraceDetail";

// TraceDetail is rendered by calling it as a function (no React renderer in the
// test setup): the Raycast components are named stubs, so the returned element
// tree can be serialized and pinned.
jest.mock("@raycast/api", () => ({
  ...jest.requireActual("@raycast/api"),
  ...jest
    .requireActual<typeof import("../../../__tests__/raycastTree")>("../../../__tests__/raycastTree")
    .raycastStubs(),
}));

function render(record: Partial<SpanRecord>, tenant?: TenantConfig) {
  const entry = normalizeSpan({
    "trace.id": "trace-1",
    "span.id": "span-1",
    start_time: "2026-01-02T03:04:05.000Z",
    ...record,
  } as SpanRecord);
  const tree = serialize(TraceDetail({ entry, tenant }) as ReactElement<Record<string, unknown>>);
  if (typeof tree === "string") throw new Error("unexpected text root");
  const { markdown, ...rest } = tree.props;
  // Zero-width spaces (autolink suppression) are spelled out so the snapshot stays lint-clean.
  return { markdown: (markdown as string).replaceAll("​", "{ZWSP}"), tree: { ...tree, props: rest } };
}

const tenant = { tenantEndpoint: "https://abc123.apps.dynatrace.com/" } as TenantConfig;

beforeAll(() => {
  jest.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) {
    return this.toISOString();
  });
});

describe("TraceDetail", () => {
  it("renders a rich HTTP + DB + RPC span", () => {
    expect(
      render(
        {
          "span.parent_id": "span-0",
          "span.kind": "SERVER",
          "span.name": "GET /orders",
          "span.status_code": "ok",
          duration: 182_000_000,
          "service.name": "checkout",
          "endpoint.name": "orders",
          "http.request.method": "GET",
          "url.path": "/orders",
          "http.route": "/orders/{id}",
          "http.response.status_code": 200,
          "server.address": "shop.example.com",
          "server.port": 443,
          "db.system": "postgresql",
          "db.operation.name": "SELECT",
          "db.namespace": "orders",
          "db.collection.name": "order_items",
          "rpc.system": "grpc",
          "rpc.service": "Orders",
          "rpc.method": "List",
        },
        tenant,
      ),
    ).toMatchInlineSnapshot(`
     {
       "markdown": "### Span

     | Field | Value |
     |---|---|
     | trace{ZWSP}.id | trace-1 |
     | span{ZWSP}.id | span-1 |
     | span{ZWSP}.parent\\_id | span-0 |
     | span{ZWSP}.kind | server |
     | service{ZWSP}.name | checkout |
     | endpoint{ZWSP}.name | orders |
     | duration | 182ms |

     ### HTTP

     | Field | Value |
     |---|---|
     | http{ZWSP}.request{ZWSP}.method | GET |
     | url{ZWSP}.path | /orders |
     | http{ZWSP}.route | /orders/{id} |
     | http{ZWSP}.response{ZWSP}.status\\_code | 200 |
     | server{ZWSP}.address | shop{ZWSP}.example{ZWSP}.com |
     | server{ZWSP}.port | 443 |

     ### Database

     | Field | Value |
     |---|---|
     | db{ZWSP}.system | postgresql |
     | db{ZWSP}.operation{ZWSP}.name | SELECT |
     | db{ZWSP}.namespace | orders |
     | db{ZWSP}.collection{ZWSP}.name | order\\_items |
     | server{ZWSP}.address | shop{ZWSP}.example{ZWSP}.com |
     | server{ZWSP}.port | 443 |

     ### RPC

     | Field | Value |
     |---|---|
     | rpc{ZWSP}.system | grpc |
     | rpc{ZWSP}.service | Orders |
     | rpc{ZWSP}.method | List |

     ### Raw Fields

     \`\`\`json
     {
       "trace.id": "trace-1",
       "span.id": "span-1",
       "start_time": "2026-01-02T03:04:05.000Z",
       "span.parent_id": "span-0",
       "span.kind": "SERVER",
       "span.name": "GET /orders",
       "span.status_code": "ok",
       "duration": 182000000,
       "service.name": "checkout",
       "endpoint.name": "orders",
       "http.request.method": "GET",
       "url.path": "/orders",
       "http.route": "/orders/{id}",
       "http.response.status_code": 200,
       "server.address": "shop.example.com",
       "server.port": 443,
       "db.system": "postgresql",
       "db.operation.name": "SELECT",
       "db.namespace": "orders",
       "db.collection.name": "order_items",
       "rpc.system": "grpc",
       "rpc.service": "Orders",
       "rpc.method": "List"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
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
                   "url": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                 },
                 "type": "Action.OpenInBrowser",
               },
               {
                 "props": {
                   "content": "trace-1",
                   "shortcut": {
                     "key": "i",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "span-1",
                   "shortcut": {
                     "key": "s",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Span ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
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
                       "text": "OK",
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
                   "text": "server",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "182ms",
                   "title": "Duration",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Start Time",
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
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "GET /orders",
                   "title": "Request",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "200",
                   "title": "HTTP Status",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "postgresql",
                   "title": "DB System",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "SELECT orders",
                   "title": "Operation",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                   "text": "Open in Explorer",
                   "title": "Distributed Trace",
                 },
                 "type": "Detail.Metadata.Link",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "checkout — GET /orders",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("renders a minimal root span without tenant", () => {
    expect(render({})).toMatchInlineSnapshot(`
     {
       "markdown": "### Span

     | Field | Value |
     |---|---|
     | trace{ZWSP}.id | trace-1 |
     | span{ZWSP}.id | span-1 |
     | span{ZWSP}.kind | internal |
     | duration | — |

     ### Raw Fields

     \`\`\`json
     {
       "trace.id": "trace-1",
       "span.id": "span-1",
       "start_time": "2026-01-02T03:04:05.000Z"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
               {
                 "props": {
                   "content": "trace-1",
                   "shortcut": {
                     "key": "i",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "span-1",
                   "shortcut": {
                     "key": "s",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Span ID",
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
                       "color": "raycast-color-secondary",
                       "text": "UNSET",
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
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "—",
                   "title": "Duration",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "Yes",
                   "title": "Root Span",
                 },
                 "type": "Detail.Metadata.Label",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "Span — span-1",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("renders an error span with partial HTTP and DB details", () => {
    expect(
      render(
        {
          "span.kind": "client",
          "span.status_code": "error",
          "span.status_message": "boom | `bad`",
          duration: 5_000_000_000,
          "service.name": "api",
          "http.request.method": "POST",
          "http.response.status_code": 500,
          "db.system": "redis",
          "db.operation.name": "GET",
        },
        tenant,
      ),
    ).toMatchInlineSnapshot(`
     {
       "markdown": "### Span

     | Field | Value |
     |---|---|
     | trace{ZWSP}.id | trace-1 |
     | span{ZWSP}.id | span-1 |
     | span{ZWSP}.kind | client |
     | service{ZWSP}.name | api |
     | duration | 5{ZWSP}.0s |
     | status{ZWSP}.message | boom \\| \\\`bad\\\` |

     ### HTTP

     | Field | Value |
     |---|---|
     | http{ZWSP}.request{ZWSP}.method | POST |
     | http{ZWSP}.response{ZWSP}.status\\_code | 500 |

     ### Database

     | Field | Value |
     |---|---|
     | db{ZWSP}.system | redis |
     | db{ZWSP}.operation{ZWSP}.name | GET |

     ### Raw Fields

     \`\`\`json
     {
       "trace.id": "trace-1",
       "span.id": "span-1",
       "start_time": "2026-01-02T03:04:05.000Z",
       "span.kind": "client",
       "span.status_code": "error",
       "span.status_message": "boom | \`bad\`",
       "duration": 5000000000,
       "service.name": "api",
       "http.request.method": "POST",
       "http.response.status_code": 500,
       "db.system": "redis",
       "db.operation.name": "GET"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
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
                   "url": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                 },
                 "type": "Action.OpenInBrowser",
               },
               {
                 "props": {
                   "content": "trace-1",
                   "shortcut": {
                     "key": "i",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "span-1",
                   "shortcut": {
                     "key": "s",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Span ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
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
                   "text": "client",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "5.0s",
                   "title": "Duration",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Start Time",
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
                       "text": "api",
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
                   "text": "Yes",
                   "title": "Root Span",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "500",
                   "title": "HTTP Status",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "redis",
                   "title": "DB System",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                   "text": "Open in Explorer",
                   "title": "Distributed Trace",
                 },
                 "type": "Detail.Metadata.Link",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "api — GET",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("keeps the trace links for an empty trace ID", () => {
    expect(render({ "trace.id": "" }, tenant)).toMatchInlineSnapshot(`
     {
       "markdown": "### Span

     | Field | Value |
     |---|---|
     | span{ZWSP}.id | span-1 |
     | span{ZWSP}.kind | internal |
     | duration | — |

     ### Raw Fields

     \`\`\`json
     {
       "trace.id": "",
       "span.id": "span-1",
       "start_time": "2026-01-02T03:04:05.000Z"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
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
                   "url": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22%22",
                 },
                 "type": "Action.OpenInBrowser",
               },
               {
                 "props": {
                   "content": "",
                   "shortcut": {
                     "key": "i",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "span-1",
                   "shortcut": {
                     "key": "s",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Span ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22%22",
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
                       "color": "raycast-color-secondary",
                       "text": "UNSET",
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
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "—",
                   "title": "Duration",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "Yes",
                   "title": "Root Span",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22%22",
                   "text": "Open in Explorer",
                   "title": "Distributed Trace",
                 },
                 "type": "Detail.Metadata.Link",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "Span — span-1",
         },
         "type": "Detail",
       },
     }
    `);
  });

  it("renders an RPC-only span with N/A attributes", () => {
    expect(render({ "rpc.method": "Ping", "endpoint.name": "N/A", "server.address": "N/A" }, tenant))
      .toMatchInlineSnapshot(`
     {
       "markdown": "### Span

     | Field | Value |
     |---|---|
     | trace{ZWSP}.id | trace-1 |
     | span{ZWSP}.id | span-1 |
     | span{ZWSP}.kind | internal |
     | duration | — |

     ### RPC

     | Field | Value |
     |---|---|
     | rpc{ZWSP}.method | Ping |

     ### Raw Fields

     \`\`\`json
     {
       "trace.id": "trace-1",
       "span.id": "span-1",
       "start_time": "2026-01-02T03:04:05.000Z",
       "rpc.method": "Ping",
       "endpoint.name": "N/A",
       "server.address": "N/A"
     }
     \`\`\`",
       "tree": {
         "props": {
           "actions": {
             "children": [
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
                   "url": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                 },
                 "type": "Action.OpenInBrowser",
               },
               {
                 "props": {
                   "content": "trace-1",
                   "shortcut": {
                     "key": "i",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Trace ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "span-1",
                   "shortcut": {
                     "key": "s",
                     "modifiers": [
                       "cmd",
                       "shift",
                     ],
                   },
                   "title": "Copy Span ID",
                 },
                 "type": "Action.CopyToClipboard",
               },
               {
                 "props": {
                   "content": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
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
                       "color": "raycast-color-secondary",
                       "text": "UNSET",
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
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "—",
                   "title": "Duration",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "2026-01-02T03:04:05.000Z",
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "text": "Yes",
                   "title": "Root Span",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {},
                 "type": "Detail.Metadata.Separator",
               },
               {
                 "props": {
                   "target": "https://abc123.apps.dynatrace.com/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22trace-1%22",
                   "text": "Open in Explorer",
                   "title": "Distributed Trace",
                 },
                 "type": "Detail.Metadata.Link",
               },
             ],
             "props": {},
             "type": "Detail.Metadata",
           },
           "navigationTitle": "Span — span-1",
         },
         "type": "Detail",
       },
     }
    `);
  });
});
