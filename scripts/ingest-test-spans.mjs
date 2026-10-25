/**
 * Sends a realistic test trace to Dynatrace via OTLP/HTTP protobuf.
 *
 * Dynatrace only accepts binary protobuf format (not JSON):
 *   https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api
 *
 * Prerequisites:
 *   npm install --no-save @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto
 *
 *   DT_TENANT_URL  — e.g. https://abc12345.apps.dynatrace.com
 *   DT_API_TOKEN   — API token with scope: openTelemetryTrace.ingest
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-test-spans.mjs
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { context, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

// ── Config ────────────────────────────────────────────────────────────────────

// apps.dynatracelabs.com → dynatracelabs.com (API lives on the non-apps domain)
const rawTenant = process.env.DT_TENANT_URL?.replace(/\/$/, "") ?? "";
const TENANT = rawTenant.replace(".apps.dynatracelabs.com", ".dynatracelabs.com");
const TOKEN  = process.env.DT_API_TOKEN;

if (!TENANT || !TOKEN) {
  console.error("Error: DT_TENANT_URL and DT_API_TOKEN must be set.");
  process.exit(1);
}

const OTLP_URL = `${TENANT}/api/v2/otlp/v1/traces`;

// ── SDK setup ─────────────────────────────────────────────────────────────────

const sdk = new NodeSDK({
  resource: new Resource({
    "service.name":           "order-service",
    "service.version":        "1.4.2",
    "deployment.environment": "production",
    "k8s.cluster.name":       "cluster-production-alpha",
    "k8s.namespace.name":     "orders",
  }),
  traceExporter: new OTLPTraceExporter({
    url: OTLP_URL,
    headers: { Authorization: `Api-Token ${TOKEN}` },
  }),
});

sdk.start();

// ── Create trace ──────────────────────────────────────────────────────────────

const tracer = trace.getTracer("raycast-dynatrace-test", "1.0.0");

// 1. Root span — incoming HTTP server request
const rootSpan = tracer.startSpan("GET /api/orders", {
  kind: SpanKind.SERVER,
  attributes: {
    "http.request.method":       "GET",
    "http.response.status_code": 200,
    "url.path":                  "/api/orders",
    "http.route":                "/api/orders",
    "server.address":            "order-service.prod.svc",
    "server.port":               8080,
  },
});

const rootCtx = trace.setSpan(context.active(), rootSpan);

// 2. Child — outgoing HTTP call to auth service
const authSpan = context.with(rootCtx, () =>
  tracer.startSpan("GET /internal/auth/verify", {
    kind: SpanKind.CLIENT,
    attributes: {
      "http.request.method":       "GET",
      "http.response.status_code": 200,
      "url.path":                  "/internal/auth/verify",
      "server.address":            "auth-service.prod.svc",
      "server.port":               8080,
    },
  })
);
authSpan.setStatus({ code: SpanStatusCode.OK });
authSpan.end(new Date(Date.now() - 4900)); // ended 4.9s ago

// 3. Child — DB query that failed
const dbSpan = context.with(rootCtx, () =>
  tracer.startSpan("SELECT orders", {
    kind: SpanKind.CLIENT,
    attributes: {
      "db.system":          "postgresql",
      "db.operation.name":  "SELECT",
      "db.namespace":       "orders_db",
      "db.collection.name": "orders",
      "server.address":     "postgres.prod.svc",
      "server.port":        5432,
    },
  })
);
dbSpan.setStatus({
  code: SpanStatusCode.ERROR,
  message: "connection pool exhausted after 220ms",
});
dbSpan.recordException(new Error("connection pool exhausted after 220ms"));
dbSpan.end(new Date(Date.now() - 4700));

// End root after children
rootSpan.setStatus({ code: SpanStatusCode.OK });
rootSpan.end(new Date(Date.now() - 4680));

// ── Flush & report ────────────────────────────────────────────────────────────

const traceId = rootSpan.spanContext().traceId;

console.log(`Sending 3 spans (traceId: ${traceId}) via protobuf to:\n  ${OTLP_URL}\n`);

try {
  await sdk.shutdown();
  console.log("✅ Spans exported successfully.");
  console.log(`\nTrace ID: ${traceId}`);
  console.log(`\nView in DT:\n  ${TENANT}/ui/apps/dynatrace.distributedtracing/explorer?filter=trace.id%3D%22${traceId}%22`);
  console.log(`\nDQL to verify (~30s for Grail to index):\n  fetch spans | filter \`trace.id\` == "${traceId}" | sort start_time desc`);
} catch (err) {
  console.error("❌ Export failed:", err.message);
  process.exit(1);
}
