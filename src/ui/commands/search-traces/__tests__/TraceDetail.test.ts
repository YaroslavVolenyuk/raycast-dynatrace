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
  Icon: {
    Globe: "icon-globe",
    HardDrive: "icon-hard-drive",
    Stopwatch: "icon-stopwatch",
    Clock: "icon-clock",
    Flag: "icon-flag",
    Link: "icon-link",
    ArrowDown: "icon-arrow-down",
    ArrowUp: "icon-arrow-up",
    Upload: "icon-upload",
    Download: "icon-download",
    Dot: "icon-dot",
  },
}));

/** Spells an embedded SVG out as its text nodes, so snapshots pin the content without the base64. */
function svgText(b64: string): string {
  const texts = [
    ...Buffer.from(b64, "base64")
      .toString()
      .matchAll(/<text[^>]*>([^<]*)<\/text>/g),
  ].map((m) => m[1]);
  return `{SVG: ${texts.join(" | ")}}`;
}

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
  return {
    markdown: (markdown as string)
      .replaceAll("​", "{ZWSP}")
      .replace(/!\[\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)/g, (_, b64) => svgText(b64)),
    tree: { ...tree, props: rest },
  };
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
       "markdown": "{SVG: GET /orders | checkout}

     {SVG: SPAN | trace.id | trace-1 | span.id | span-1 | span.parent_id | span-0 | endpoint.name | orders | HTTP | http.route | /orders/{id} | server.address | shop.example.com | server.port | 443 | DATABASE | db.namespace | orders | db.collection.name | order_items | server.address | shop.example.com | server.port | 443 | RPC | rpc.system | grpc | rpc.service | Orders | rpc.method | List}

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
                   "icon": {
                     "source": "icon-arrow-down",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "server",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-stopwatch",
                     "tintColor": undefined,
                   },
                   "text": "182ms",
                   "title": "Duration",
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
                   "icon": {
                     "source": "icon-globe",
                     "tintColor": "raycast-color-blue",
                   },
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
                   "icon": {
                     "source": "icon-hard-drive",
                     "tintColor": "raycast-color-blue",
                   },
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
                   "text": "trace-1",
                   "title": "Trace",
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
       "markdown": "{SVG: span-1 | Unknown service}

     {SVG: SPAN | trace.id | trace-1 | span.id | span-1}

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
                   "icon": {
                     "source": "icon-dot",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-stopwatch",
                     "tintColor": undefined,
                   },
                   "text": "—",
                   "title": "Duration",
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
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-flag",
                     "tintColor": "raycast-color-green",
                   },
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
                   "icon": {
                     "source": "icon-link",
                     "tintColor": "raycast-color-green",
                   },
                   "text": "trace-1",
                   "title": "Trace",
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
       "markdown": "{SVG: GET | api}

     {SVG: SPAN | trace.id | trace-1 | span.id | span-1 | status.message | boom | \`bad\`}

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
                   "icon": {
                     "source": "icon-arrow-up",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "client",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-stopwatch",
                     "tintColor": undefined,
                   },
                   "text": "5.0s",
                   "title": "Duration",
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
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-flag",
                     "tintColor": "raycast-color-green",
                   },
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
                   "icon": {
                     "source": "icon-globe",
                     "tintColor": "raycast-color-blue",
                   },
                   "text": "POST",
                   "title": "Request",
                 },
                 "type": "Detail.Metadata.Label",
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
                   "icon": {
                     "source": "icon-hard-drive",
                     "tintColor": "raycast-color-blue",
                   },
                   "text": "redis",
                   "title": "DB System",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "text": "GET",
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
                   "text": "trace-1",
                   "title": "Trace",
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
       "markdown": "{SVG: span-1 | Unknown service}

     {SVG: SPAN | span.id | span-1}

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
                   "icon": {
                     "source": "icon-dot",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-stopwatch",
                     "tintColor": undefined,
                   },
                   "text": "—",
                   "title": "Duration",
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
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-flag",
                     "tintColor": "raycast-color-green",
                   },
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
                   "text": "",
                   "title": "Trace",
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
       "markdown": "{SVG: span-1 | Unknown service}

     {SVG: SPAN | trace.id | trace-1 | span.id | span-1 | RPC | rpc.method | Ping}

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
                   "icon": {
                     "source": "icon-dot",
                     "tintColor": "raycast-color-secondary",
                   },
                   "text": "internal",
                   "title": "Kind",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-stopwatch",
                     "tintColor": undefined,
                   },
                   "text": "—",
                   "title": "Duration",
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
                   "title": "Start Time",
                 },
                 "type": "Detail.Metadata.Label",
               },
               {
                 "props": {
                   "icon": {
                     "source": "icon-flag",
                     "tintColor": "raycast-color-green",
                   },
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
                   "text": "trace-1",
                   "title": "Trace",
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
