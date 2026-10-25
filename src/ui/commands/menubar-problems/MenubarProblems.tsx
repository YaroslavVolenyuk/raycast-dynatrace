// Menu bar: open Dynatrace problem count. Clicking a problem opens it in the
// Problems app. A failed fetch is NEVER shown as "no problems": the icon turns
// yellow and the menu explains what is wrong and how to fix it.

import {
  Cache,
  Clipboard,
  Color,
  Icon,
  LaunchType,
  MenuBarExtra,
  getPreferenceValues,
  launchCommand,
  open,
  showHUD,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { liveTransport, listProblems, type ProblemEntry, type TenantConfig } from "../../../sdk";
import { getActiveTenant, listTenants } from "../../../services/tenants";
import { buildProblemUrl } from "../../lib/deepLinks";
import { classifyProblemsError, type ProblemsErrorInfo } from "../../lib/problemsError";
import { shouldFetch } from "../../lib/refreshThrottle";

const MAX_SHOWN = 5;
/** After a failed fetch, retry this soon instead of waiting a full refresh interval. */
const RETRY_AFTER_ERROR_MS = 10 * 60_000;

type Result =
  | { state: "no-tenant" }
  | { state: "select-tenant" }
  | { state: "ok"; endpoint: string; problems: ProblemEntry[]; hasMore: boolean }
  | { state: "error"; endpoint?: string; error: ProblemsErrorInfo };

interface Preferences {
  refreshMinutes?: string;
  lookback?: string;
  extraFilter?: string;
}

const cache = new Cache();
const LAST_RESULT_KEY = "menubar-problems:last-result";
const LAST_FETCH_KEY = "menubar-problems:last-fetch";
const FORCE_KEY = "menubar-problems:force";
const PREFS_KEY = "menubar-problems:prefs";

function readCachedResult(): Result | undefined {
  try {
    const raw = cache.get(LAST_RESULT_KEY);
    return raw ? (JSON.parse(raw) as Result) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchResult(tenant: TenantConfig, prefs: Preferences): Promise<Result> {
  const endpoint = tenant.tenantEndpoint.replace(/\/$/, "");
  try {
    // One extra record tells us whether to show "5+".
    const all = await listProblems(liveTransport, tenant, {
      limit: MAX_SHOWN + 1,
      lookback: prefs.lookback || "7d",
      extraFilter: prefs.extraFilter,
    });
    return { state: "ok", endpoint, problems: all.slice(0, MAX_SHOWN), hasMore: all.length > MAX_SHOWN };
  } catch (err) {
    return { state: "error", endpoint, error: classifyProblemsError(err) };
  }
}

async function load(): Promise<Result> {
  const prefs = getPreferenceValues<Preferences>();
  // Reading the active tenant is local and free; only the Grail query is throttled.
  const tenant = await getActiveTenant();
  // "No tenant" is never cached: it must clear as soon as a tenant is added.
  if (!tenant) return { state: (await listTenants()).length > 0 ? "select-tenant" : "no-tenant" };

  // Tenant, credentials, scopes, lookback and filter all change what the cached result means.
  const signature = JSON.stringify([
    tenant.id,
    tenant.tenantEndpoint,
    tenant.clientId,
    tenant.ssoEndpoint,
    [...tenant.scopes].sort(),
    prefs.lookback,
    prefs.extraFilter,
  ]);
  const force = cache.get(FORCE_KEY) === "1" || cache.get(PREFS_KEY) !== signature;
  cache.remove(FORCE_KEY);

  const last = readCachedResult();
  const lastFetchedAt = Number(cache.get(LAST_FETCH_KEY)) || undefined;
  // Every query is billable: reuse the last result until the chosen interval has elapsed.
  if (
    last &&
    !shouldFetch({ now: Date.now(), lastFetchedAt, intervalMinutes: Number(prefs.refreshMinutes) || 30, force })
  ) {
    return last;
  }

  const result = await fetchResult(tenant, prefs);
  // Config errors (scopes, credentials, bad filter) are cached too, so the menu does not
  // re-query every wake-up while the user has not fixed anything.
  cache.set(LAST_RESULT_KEY, JSON.stringify(result));
  // Any failure is re-checked soon: a timeout is transient, and a config error may have been fixed on the
  // Dynatrace side (e.g. a scope added to the OAuth client) without anything changing locally.
  const intervalMs = (Number(prefs.refreshMinutes) || 30) * 60_000;
  const backdate = result.state === "error" ? intervalMs - RETRY_AFTER_ERROR_MS : 0;
  cache.set(LAST_FETCH_KEY, String(Date.now() - Math.max(0, backdate)));
  cache.set(PREFS_KEY, signature);
  return result;
}

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

export default function MenubarProblems() {
  const {
    data: loaded,
    error: loadError,
    isLoading,
    revalidate: revalidateRaw,
  } = useCachedPromise(load, [], {
    keepPreviousData: true,
    // A menu bar command cannot show the default failure toast; the error is rendered in the menu instead.
    onError: () => {},
  });
  /** Manual refresh bypasses the interval throttle. */
  const revalidate = () => {
    cache.set(FORCE_KEY, "1");
    revalidateRaw();
  };

  // load() itself failed (e.g. corrupted tenant storage): never fall back to the previous result.
  const data: Result | undefined = loadError ? { state: "error", error: describeLoadError(loadError) } : loaded;

  if (data?.state === "no-tenant") {
    return (
      <MenuBarExtra
        icon={{ source: Icon.Gear, tintColor: Color.SecondaryText }}
        tooltip="No Dynatrace tenant configured"
      >
        <MenuBarExtra.Item title="Configure Tenant" icon={Icon.Gear} onAction={openManageTenants} />
        <MenuBarExtra.Item title="Refresh" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
      </MenuBarExtra>
    );
  }

  if (data?.state === "select-tenant") {
    return (
      <MenuBarExtra icon={{ source: Icon.Gear, tintColor: Color.SecondaryText }} tooltip="Select a Dynatrace tenant">
        <MenuBarExtra.Item title="Select a Tenant" icon={Icon.Gear} onAction={openManageTenants} />
        <MenuBarExtra.Item title="Refresh" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
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
            onAction={() => revalidate()}
          />
        </MenuBarExtra.Section>
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title="Retry" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
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

  const { problems, hasMore, endpoint } = data;
  const count = problems.length;
  const countLabel = hasMore ? `${MAX_SHOWN}+` : String(count);

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
        <MenuBarExtra.Section title="Open Problems">
          {problems.map((p) => (
            <MenuBarExtra.Item
              key={p.id}
              title={p.name}
              subtitle={p.displayId}
              icon={categoryIcon(p.category)}
              onAction={() => open(buildProblemUrl(endpoint, p.id))}
            />
          ))}
        </MenuBarExtra.Section>
      ) : (
        <MenuBarExtra.Item title="No open problems" icon={Icon.Checkmark} />
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Open Problems in Dynatrace"
          icon={Icon.ArrowRight}
          onAction={() => open(`${endpoint}/ui/apps/dynatrace.davis.problems`)}
        />
        <MenuBarExtra.Item title="Refresh" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
