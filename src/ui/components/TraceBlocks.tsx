// Pieces shared by the views that link to a trace (Log Detail, Trace Detail,
// Search Traces): the tenant base URL, the Copy Trace/Span ID actions
// and the "Distributed Trace" metadata link. The JSX helpers are plain
// functions, not components, so they render inline inside ActionPanel and
// Detail.Metadata.

import { Action, Detail } from "@raycast/api";
import type { TenantConfig } from "../../sdk/auth";

/** The tenant's base URL without a trailing slash, or "" without a tenant. */
export function tenantBaseUrl(tenant: TenantConfig | undefined): string {
  return tenant?.tenantEndpoint?.replace(/\/$/, "") ?? "";
}

export function copyTraceSpanActions(traceId: string, spanId: string) {
  return (
    <>
      <Action.CopyToClipboard
        title="Copy Trace ID"
        content={traceId}
        shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
      />
      <Action.CopyToClipboard
        title="Copy Span ID"
        content={spanId}
        shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
      />
    </>
  );
}

export function traceMetadataLink(traceUrl: string | undefined) {
  if (!traceUrl) return null;
  return (
    <>
      <Detail.Metadata.Separator />
      <Detail.Metadata.Link title="Distributed Trace" target={traceUrl} text="Open in Explorer" />
    </>
  );
}
