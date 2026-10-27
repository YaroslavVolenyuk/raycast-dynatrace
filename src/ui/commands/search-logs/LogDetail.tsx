import { Detail, ActionPanel, Action, Color, Icon, useNavigation } from "@raycast/api";
import type { LogEntry } from "../../../sdk";
import type { TenantConfig } from "../../../sdk";
import { escapeDqlString } from "../../../sdk";
import { formatLogContent } from "../../lib/formatLogContent";
import { buildTraceUrl } from "../../lib/deepLinks";
import { keyValueTable, fenceCode } from "../../lib/markdown";
import type { TimeframeValue } from "../../lib/listArgs";
import SearchTraces from "../search-traces/SearchTraces";
import RunDql from "../run-dql/RunDql";

// ── Helpers ────────────────────────────────────────────────────────────────────

function val(v: unknown): string | undefined {
  if (v == null || v === "" || v === "N/A") return undefined;
  return String(v);
}

function valArray(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const joined = v.filter(Boolean).join(", ");
    return joined || undefined;
  }
  return val(v);
}

function levelColor(level: string | undefined, status: string | undefined): Color {
  const st = status?.toUpperCase();
  if (st === "SUCCESS" || st === "OK") return Color.Green;
  if (st === "ERROR" || st === "FAILED" || st === "FAILURE") return Color.Red;
  switch (level?.toUpperCase()) {
    case "WARN":
    case "WARNING":
      return Color.Yellow;
    case "ERROR":
    case "FATAL":
    case "CRITICAL":
      return Color.Red;
    case "INFO":
      return Color.Blue;
    default:
      return Color.SecondaryText;
  }
}

function environmentColor(env: string | undefined): Color {
  const e = env?.toLowerCase() ?? "";
  if (e === "prod" || e === "production") return Color.Green;
  if (e.includes("stag")) return Color.Yellow;
  return Color.SecondaryText;
}

function buildLogContextQuery(raw: Record<string, unknown>, limit = 100): string {
  const service = raw["service.name"] ? String(raw["service.name"]) : undefined;
  if (service) {
    return `fetch logs\n| filter service.name == "${escapeDqlString(service)}"\n| limit ${limit}`;
  }
  const appName = raw["dt.app.name"] ? String(raw["dt.app.name"]) : undefined;
  if (appName) {
    return `fetch logs\n| filter dt.app.name == "${escapeDqlString(appName)}"\n| limit ${limit}`;
  }
  const processName = raw["dt.process.name"]
    ? String(raw["dt.process.name"])
    : raw["dt.process_group.detected_name"]
      ? String(raw["dt.process_group.detected_name"])
      : undefined;
  if (processName) {
    return `fetch logs\n| filter dt.process.name == "${escapeDqlString(processName)}"\n| limit ${limit}`;
  }
  return `fetch logs\n| limit ${limit}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LogDetail({
  entry,
  tenant,
  timeframe,
}: {
  entry: LogEntry;
  tenant?: TenantConfig;
  /** The Search Logs timeframe, so the trace is looked up as far back as the log. */
  timeframe?: TimeframeValue;
}) {
  const { push } = useNavigation();
  const raw = entry.raw as Record<string, unknown>;
  const baseUrl = tenant?.tenantEndpoint?.replace(/\/$/, "") ?? "";

  // ── Field values ─────────────────────────────────────────────────────────────

  const loglevel = entry.level;
  const status = val(entry.status);
  const eventType = val(raw["event.type"]);

  const serviceName = val(raw["service.name"]);
  const appName = val(raw["dt.app.name"]);
  const appVersion = val(raw["dt.app.version"]);

  const hostName = val(raw["host.name"]) ?? val(raw["dt.entity.host"]);
  const hostGroup = val(raw["dt.host_group.id"]);

  const awsRegion = val(raw["aws.region"]) ?? val(raw["cloud.region"]);
  const awsAz = val(raw["aws.availability_zone"]);
  const awsAccount = val(raw["aws.account.id"]) ?? val(raw["cloud.account.id"]);
  const awsArn = val(raw["aws.arn"]);
  const cloudProvider = val(raw["cloud.provider"]);

  const faasId = val(raw["faas.id"]);
  const faasName = val(raw["faas.name"]);
  const faasVersion = val(raw["faas.version"]);

  const k8sCluster = val(raw["k8s.cluster.name"]);
  const k8sNamespace = val(raw["k8s.namespace.name"]);
  const k8sNode = val(raw["k8s.node.name"]);
  const k8sPodUid = val(raw["k8s.pod.uid"]);

  const processName = val(raw["dt.process.name"]) ?? val(raw["dt.process_group.detected_name"]);
  const processTech = valArray(raw["process.technology"]);
  const logSource = entry.source;
  const operatorVersion = val(raw["OperatorVersion"]);

  const pipelineSource = val(raw["dt.openpipeline.source"]);
  const pipelines = valArray(raw["dt.openpipeline.pipelines"]);
  const authOrigin = val(raw["dt.auth.origin"]) ?? val(raw["dt.auth_origin"]);

  const envVal = val(raw["dt.environment.id"]) ?? val(raw["environment"]);

  const traceId = entry.traceId;
  const spanId = val(raw["span_id"]);
  const traceUrl = traceId && baseUrl ? buildTraceUrl(baseUrl, traceId) : undefined;

  // Topology: entity refs
  const sourceEntities = valArray(raw["dt.source_entity"]);
  const entityCustomDevice = val(raw["dt.entity.custom_device"]);
  const entityAwsLambda = val(raw["dt.entity.aws_lambda_function"]);
  const entityHost = val(raw["dt.entity.host"]);
  const entityProcess = val(raw["dt.entity.process_group_instance"]);

  const dqlFilter = buildLogContextQuery(raw);

  // ── Section visibility ────────────────────────────────────────────────────────

  const hasTopology = !!(sourceEntities || entityCustomDevice || entityAwsLambda || entityHost || entityProcess);
  const hasCloud = !!(awsRegion || awsAz || awsAccount || awsArn || cloudProvider || faasId || faasName || faasVersion);
  const hasK8s = !!(k8sCluster || k8sNamespace || k8sNode || k8sPodUid);
  const hasInfra = !!(hostName || hostGroup || hasCloud || hasK8s);
  const hasProcess = !!(processName || processTech || logSource || operatorVersion || appName || appVersion);
  const hasPipeline = !!(pipelineSource || pipelines || authOrigin);
  const hasTelemetry = !!(traceId || spanId);

  // ── Markdown sections ─────────────────────────────────────────────────────────

  const formatted = formatLogContent(entry.content) ?? "_No content available_";

  const sections: string[] = [formatted];

  // Topology section
  if (hasTopology) {
    const topologyTable = keyValueTable([
      ["dt.source_entity", sourceEntities],
      ["dt.entity.host", entityHost],
      ["dt.entity.process_group_instance", entityProcess],
      ["dt.entity.custom_device", entityCustomDevice],
      ["dt.entity.aws_lambda_function", entityAwsLambda],
    ]);
    if (topologyTable) {
      sections.push("### Topology", topologyTable);
    }
  }

  // Fields section — Infrastructure, Cloud, K8s, Process, Pipeline, Telemetry
  const fieldRows: Array<[string, string | undefined]> = [];

  if (hasInfra) {
    if (hostName) fieldRows.push(["host.name", hostName]);
    if (hostGroup) fieldRows.push(["dt.host_group.id", hostGroup]);
    if (cloudProvider) fieldRows.push(["cloud.provider", cloudProvider]);
    if (awsRegion) fieldRows.push(["cloud.region", awsRegion]);
    if (awsAz) fieldRows.push(["aws.availability_zone", awsAz]);
    if (awsAccount) fieldRows.push(["cloud.account.id", awsAccount]);
    if (awsArn) fieldRows.push(["aws.arn", awsArn]);
  }

  if (faasName || faasId || faasVersion) {
    if (faasName) fieldRows.push(["faas.name", faasName]);
    if (faasVersion) fieldRows.push(["faas.version", faasVersion]);
    if (faasId) fieldRows.push(["faas.id", faasId]);
  }

  if (hasK8s) {
    if (k8sCluster) fieldRows.push(["k8s.cluster.name", k8sCluster]);
    if (k8sNamespace) fieldRows.push(["k8s.namespace.name", k8sNamespace]);
    if (k8sNode) fieldRows.push(["k8s.node.name", k8sNode]);
    if (k8sPodUid) fieldRows.push(["k8s.pod.uid", k8sPodUid]);
  }

  if (hasProcess) {
    if (appName) fieldRows.push(["dt.app.name", appName]);
    if (appVersion) fieldRows.push(["dt.app.version", appVersion]);
    if (processName) fieldRows.push(["dt.process.name", processName]);
    if (processTech) fieldRows.push(["process.technology", processTech]);
    if (logSource) fieldRows.push(["log.source", logSource]);
    if (operatorVersion) fieldRows.push(["OperatorVersion", operatorVersion]);
  }

  if (hasPipeline) {
    if (pipelineSource) fieldRows.push(["dt.openpipeline.source", pipelineSource]);
    if (pipelines) fieldRows.push(["dt.openpipeline.pipelines", pipelines]);
    if (authOrigin) fieldRows.push(["dt.auth.origin", authOrigin]);
  }

  if (hasTelemetry) {
    if (traceId) fieldRows.push(["trace_id", traceId]);
    if (spanId) fieldRows.push(["span_id", spanId]);
  }

  if (eventType) fieldRows.push(["event.type", eventType]);
  if (envVal) fieldRows.push(["dt.environment.id", envVal]);

  const fieldsTable = keyValueTable(fieldRows);
  if (fieldsTable) {
    sections.push("### Fields", fieldsTable);
  }

  // DQL filter
  sections.push("### DQL Filter *(⌘D to copy)*", fenceCode(dqlFilter));

  // Raw JSON at the bottom
  sections.push("### Raw Fields", fenceCode(JSON.stringify(raw, null, 2), "json"));

  const markdown = sections.join("\n\n");

  return (
    <Detail
      navigationTitle={`${serviceName ?? appName ?? processName ?? "Log"} — ${loglevel}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          {traceId && (
            <Action
              title="View Trace in Raycast"
              icon={Icon.MagnifyingGlass}
              shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
              onAction={() => push(<SearchTraces initialTraceId={traceId} initialTimeframe={timeframe} />)}
            />
          )}
          {traceUrl && (
            <Action.OpenInBrowser
              title="Open in Distributed Traces"
              url={traceUrl}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            />
          )}
          <Action
            title="Open DQL Filter in Run DQL"
            icon={Icon.Terminal}
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={() => push(<RunDql initialQuery={dqlFilter} />)}
          />
          <Action.CopyToClipboard
            title="Copy DQL Filter"
            content={dqlFilter}
            shortcut={{ modifiers: ["cmd", "shift"], key: "q" }}
          />
          <Action.CopyToClipboard title="Copy Log Content" content={entry.content} />
          <Action.CopyToClipboard title="Copy Timestamp" content={entry.timestamp} />
          {traceId && <Action.CopyToClipboard title="Copy Trace ID" content={traceId} />}
          {traceUrl && <Action.CopyToClipboard title="Copy Trace Link" content={traceUrl} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {/* ── Core: Status / Level / Time ───────────────────────────────── */}
          {status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text={status} color={levelColor(loglevel, status)} />
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Label title="Level" text={loglevel} />
          <Detail.Metadata.Label title="Timestamp" text={new Date(entry.timestamp).toLocaleString()} />

          {/* ── Service / Process ─────────────────────────────────────────── */}
          <Detail.Metadata.Separator />
          {serviceName && (
            <Detail.Metadata.TagList title="Service">
              <Detail.Metadata.TagList.Item text={serviceName} color={Color.Blue} />
            </Detail.Metadata.TagList>
          )}
          {processName && <Detail.Metadata.Label title="Process" text={processName} />}
          {appName && !serviceName && <Detail.Metadata.Label title="App" text={appName} />}
          {envVal && (
            <Detail.Metadata.TagList title="Environment">
              <Detail.Metadata.TagList.Item text={envVal} color={environmentColor(envVal)} />
            </Detail.Metadata.TagList>
          )}

          {/* ── Host ─────────────────────────────────────────────────────── */}
          {hostName && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Host" text={hostName} />
            </>
          )}

          {/* ── Telemetry link ────────────────────────────────────────────── */}
          {traceUrl && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Link title="Distributed Trace" target={traceUrl} text="Open in Explorer" />
            </>
          )}
        </Detail.Metadata>
      }
    />
  );
}
