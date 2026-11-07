// Pieces shared by the views that link to a trace (Log Detail, Trace Detail,
// Search Traces): the tenant base URL, the Copy Trace/Span ID actions.

import { Action, Keyboard } from "@raycast/api";
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
      <Action.CopyToClipboard title="Copy Span ID" content={spanId} shortcut={Keyboard.Shortcut.Common.Duplicate} />
    </>
  );
}
