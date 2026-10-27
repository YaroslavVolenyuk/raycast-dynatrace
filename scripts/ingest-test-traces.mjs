/**
 * Sends many varied test traces to Dynatrace via OTLP/HTTP protobuf, for
 * exercising Search Traces (statuses, durations, services, span kinds).
 *
 * Prerequisites and env are the same as scripts/ingest-test-spans.mjs:
 *   npm install --no-save @opentelemetry/api@1 @opentelemetry/resources@2 \
 *     @opentelemetry/sdk-node@0.200 @opentelemetry/exporter-trace-otlp-proto@0.200
 *   DT_TENANT_URL, DT_API_TOKEN (scope: openTelemetryTrace.ingest)
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-test-traces.mjs [count=30]
 *
 * Prints every trace ID with its flavour so a log's `trace_id` can be pointed
 * at a trace that really exists (log → Search Traces navigation test).
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { context, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

const rawTenant = process.env.DT_TENANT_URL?.replace(/\/$/, "") ?? "";
const TENANT = rawTenant.replace(".apps.dynatracelabs.com", ".dynatracelabs.com");
const TOKEN = process.env.DT_API_TOKEN;
const COUNT = Number.parseInt(process.argv[2] ?? "30", 10);

if (!TENANT || !TOKEN) {
  console.error("Error: DT_TENANT_URL and DT_API_TOKEN must be set.");
  process.exit(1);
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "trace-stress-gateway",
    "deployment.environment": "test",
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${TENANT}/api/v2/otlp/v1/traces`,
    headers: { Authorization: `Api-Token ${TOKEN}` },
  }),
});
sdk.start();

const tracer = trace.getTracer("raycast-dynatrace-stress", "1.0.0");

// name, status, root duration (ms), child count, error message
const FLAVOURS = [
  { name: "GET /api/orders", status: "ok", ms: 45, children: 2 },
  { name: "POST /api/orders", status: "ok", ms: 180, children: 3 },
  { name: "GET /api/orders/{id}", status: "ok", ms: 12, children: 1 },
  { name: "POST /api/payments", status: "error", ms: 2300, children: 3, error: "payment provider timeout" },
  { name: "GET /api/search", status: "ok", ms: 950, children: 2 },
  { name: "DELETE /api/cart", status: "error", ms: 60, children: 1, error: "cart not found" },
  { name: "POST /api/checkout", status: "ok", ms: 4200, children: 4 },
  { name: "GET /api/health", status: "ok", ms: 1, children: 0 },
  { name: "POST /api/export", status: "error", ms: 15000, children: 2, error: "export exceeded 15s budget" },
  { name: "GET /api/recommendations", status: "ok", ms: 320, children: 2 },
];

const CHILDREN = [
  { name: "SELECT orders", attrs: { "db.system": "postgresql", "db.operation.name": "SELECT" } },
  { name: "GET /internal/auth/verify", attrs: { "http.request.method": "GET", "http.response.status_code": 200 } },
  { name: "redis GET cart", attrs: { "db.system": "redis", "db.operation.name": "GET" } },
  { name: "publish order.created", attrs: { "messaging.system": "kafka", "messaging.operation.type": "publish" } },
];

const base = Date.now() - 60_000; // spread traces over the last minute
const report = [];

for (let i = 0; i < COUNT; i++) {
  const f = FLAVOURS[i % FLAVOURS.length];
  const start = base + i * 1500;
  const root = tracer.startSpan(f.name, { kind: SpanKind.SERVER, startTime: start });
  const rootCtx = trace.setSpan(context.active(), root);

  let offset = 0;
  for (let c = 0; c < f.children; c++) {
    const child = CHILDREN[c % CHILDREN.length];
    const span = context.with(rootCtx, () =>
      tracer.startSpan(child.name, { kind: SpanKind.CLIENT, startTime: start + offset, attributes: child.attrs }),
    );
    const dur = Math.max(1, Math.floor(f.ms / (f.children + 1)));
    // The last child carries the failure for error traces.
    if (f.status === "error" && c === f.children - 1) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: f.error });
      span.recordException(new Error(f.error));
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    offset += dur;
    span.end(start + offset);
  }

  if (f.status === "error") root.setStatus({ code: SpanStatusCode.ERROR, message: f.error });
  else root.setStatus({ code: SpanStatusCode.OK });
  root.end(start + f.ms);

  report.push(`${root.spanContext().traceId}  ${f.status.padEnd(5)} ${String(f.ms).padStart(5)}ms  ${f.name}`);
}

try {
  await sdk.shutdown();
  console.log(`✅ Exported ${COUNT} traces.\n\ntrace_id                          status  dur     root span`);
  console.log(report.join("\n"));
  console.log('\nVerify (~30s): fetch spans | filter `service.name` == "trace-stress-gateway" | summarize count()');
} catch (err) {
  console.error("❌ Export failed:", err.message);
  process.exit(1);
}
