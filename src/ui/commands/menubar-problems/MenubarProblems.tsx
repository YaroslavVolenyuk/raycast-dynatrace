// Menu bar: open Dynatrace problem count. Clicking a problem opens it in the
// Problems app. A failed fetch is NEVER shown as "no problems": the icon turns
// yellow and the menu explains what is wrong and how to fix it.

import { Clipboard, Color, Icon, LaunchType, MenuBarExtra, launchCommand, open, showHUD } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { buildProblemUrl } from "../../lib/deepLinks";
import type { ProblemsErrorInfo } from "../../lib/problemsError";
import { formatClock } from "../../lib/refreshThrottle";
import { loadProblems, openProblemCount, problemCountLabel, type ProblemsResult } from "./problemsStore";

const CATEGORY_ICON: Record<string, { source: Icon; tintColor: Color }> = {
  AVAILABILITY: { source: Icon.CircleProgress, tintColor: Color.Red },
  ERROR: { source: Icon.ExclamationMark, tintColor: Color.Orange },
  SLOWDOWN: { source: Icon.Clock, tintColor: Color.Yellow },
  RESOURCE_CONTENTION: { source: Icon.ArrowRightCircle, tintColor: Color.Blue },
  CUSTOM_ALERT: { source: Icon.Bell, tintColor: Color.Purple },
};

const categoryIcon = (category: string) =>
  CATEGORY_ICON[category] ?? { source: Icon.QuestionMark, tintColor: Color.SecondaryText };

/** load() failures happen before any Dynatrace call — they come from local tenant settings. */
function describeLoadError(err: unknown): ProblemsErrorInfo {
  return {
    kind: "config",
    summary: "Could not read tenant settings",
    detail: err instanceof Error ? err.message : String(err),
  };
}

const openManageTenants = () => launchCommand({ name: "dt-manage-tenants", type: LaunchType.UserInitiated });

/**
 * Refresh / Retry. Clicking a menu item closes the menu and Raycast unloads this
 * command at once, killing any fetch started here; a command cannot relaunch
 * itself either. The no-view Refresh Problems command runs to completion, stores
 * the result and then relaunches this one in the background to redraw it. Launched as
 * user-initiated so it confirms with a HUD that the data was refreshed.
 */
const refresh = async () => {
  try {
    await launchCommand({ name: "dt-refresh-problems", type: LaunchType.UserInitiated });
  } catch (err) {
    // Not copied to the clipboard: a refresh must never overwrite what the user copied.
    await showHUD(`Could not refresh: ${err instanceof Error ? err.message : String(err)}`);
  }
};

export default function MenubarProblems() {
  const {
    data: loaded,
    error: loadError,
    isLoading,
  } = useCachedPromise(() => loadProblems(false), [], {
    keepPreviousData: true,
    // A menu bar command cannot show the default failure toast; the error is rendered in the menu instead.
    onError: () => {},
  });

  // load() itself failed (e.g. corrupted tenant storage): never fall back to the previous result.
  const data: ProblemsResult | undefined = loadError ? { state: "error", error: describeLoadError(loadError) } : loaded;

  if (data?.state === "no-tenant") {
    return (
      <MenuBarExtra
        icon={{ source: Icon.Gear, tintColor: Color.SecondaryText }}
        tooltip="No Dynatrace tenant configured"
      >
        <MenuBarExtra.Item title="Configure Tenant" icon={Icon.Gear} onAction={openManageTenants} />
        <MenuBarExtra.Item title="Refresh" icon={Icon.RotateClockwise} onAction={refresh} />
      </MenuBarExtra>
    );
  }

  if (data?.state === "error") {
    const { error, endpoint } = data;
    return (
      <MenuBarExtra
        icon={{ source: error.kind === "config" ? Icon.Key : Icon.WifiDisabled, tintColor: Color.Yellow }}
        tooltip={`${error.summary} — problem status unknown`}
        isLoading={isLoading}
      >
        <MenuBarExtra.Section title="Problem status unknown">
          <MenuBarExtra.Item
            title={error.summary}
            icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
            onAction={refresh}
          />
        </MenuBarExtra.Section>
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title="Retry" icon={Icon.RotateClockwise} onAction={refresh} />
          {error.kind === "config" && (
            <MenuBarExtra.Item title="Open Manage Tenants" icon={Icon.Gear} onAction={openManageTenants} />
          )}
          <MenuBarExtra.Item
            title="Copy Error Details"
            icon={Icon.Clipboard}
            onAction={async () => {
              await Clipboard.copy(error.detail);
              await showHUD("Error details copied");
            }}
          />
          {endpoint && <MenuBarExtra.Item title="Open Dynatrace" icon={Icon.Globe} onAction={() => open(endpoint)} />}
        </MenuBarExtra.Section>
      </MenuBarExtra>
    );
  }

  // Still loading the very first time: render nothing visible beyond the spinner.
  if (!data) return <MenuBarExtra isLoading icon={Icon.Globe} tooltip="Loading Dynatrace problems…" />;

  const { problems, endpoint } = data;
  const count = openProblemCount(data);
  const countLabel = problemCountLabel(data);
  const problemsAppUrl = `${endpoint}/ui/apps/dynatrace.davis.problems`;
  const notShown = count - problems.length;

  return (
    <MenuBarExtra
      icon={
        count > 0
          ? { source: Icon.Warning, tintColor: Color.Red }
          : { source: Icon.Checkmark, tintColor: Color.SecondaryText }
      }
      title={count > 0 ? countLabel : undefined}
      tooltip={count > 0 ? `${countLabel} open problems` : "No open problems"}
      isLoading={isLoading}
    >
      {count > 0 ? (
        <MenuBarExtra.Section title={data.tenantName ? `Open Problems · ${data.tenantName}` : "Open Problems"}>
          {problems.map((p) => (
            <MenuBarExtra.Item
              key={p.id}
              title={p.name}
              subtitle={p.displayId}
              icon={categoryIcon(p.category)}
              onAction={() => open(buildProblemUrl(endpoint, p.id))}
            />
          ))}
          {notShown > 0 && (
            <MenuBarExtra.Item
              title={`${data.hasMore ? `${notShown}+` : notShown} more in Dynatrace`}
              icon={Icon.Ellipsis}
              onAction={() => open(problemsAppUrl)}
            />
          )}
        </MenuBarExtra.Section>
      ) : (
        <MenuBarExtra.Item title="No open problems" subtitle={data.tenantName} icon={Icon.Checkmark} />
      )}
      {data.extraFilter && (
        <MenuBarExtra.Section title="Extra DQL Filter (preferences)">
          <MenuBarExtra.Item title={data.extraFilter} icon={Icon.Filter} />
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Open Problems in Dynatrace"
          icon={Icon.ArrowRight}
          onAction={() => open(problemsAppUrl)}
        />
        <MenuBarExtra.Item
          title="Refresh"
          // Data can be up to one refresh interval old by design (each query is billable) — say when it was fetched.
          subtitle={`updated ${formatClock(data.fetchedAt)}`}
          icon={Icon.RotateClockwise}
          onAction={refresh}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
