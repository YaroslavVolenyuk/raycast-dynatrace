// Environment URL parsing for the tenant form.

/** Trims and strips a trailing slash so endpoints concatenate predictably. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Dynatrace SaaS hosts: production, and the dev/sprint stages on dynatracelabs.com. */
const SAAS_HOST = /\.dynatrace(labs)?\.com$/;

/**
 * Environment URL as stored. A URL pasted from the browser on a Dynatrace SaaS
 * host (`…/ui/apps/dynatrace.logs?gtf=-2h`) is cut back to its origin, otherwise
 * every API path would be appended to the app path. Other hosts (proxies) may
 * legitimately carry a base path and are only trimmed.
 */
export function normalizeEnvironmentUrl(url: string): string {
  const trimmed = normalizeUrl(url);
  try {
    const parsed = new URL(trimmed);
    if (SAAS_HOST.test(parsed.hostname)) return parsed.origin;
  } catch {
    // invalid URL — environmentUrlProblem reports it
  }
  return trimmed;
}

/**
 * Platform (Grail) URL for a classic `<id>.live.dynatrace.com` URL, or undefined
 * when the URL is not a classic one. Grail APIs only answer on `.apps.`.
 */
export function platformUrlForClassic(url: string): string | undefined {
  try {
    const { hostname } = new URL(url);
    const match = hostname.match(/^([^.]+)\.live\.dynatrace\.com$/);
    return match ? `https://${match[1]}.apps.dynatrace.com` : undefined;
  } catch {
    return undefined;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Why a normalized environment URL cannot be used, or undefined when it can. */
export function environmentUrlProblem(url: string): string | undefined {
  if (!url) return "Environment URL is required";
  if (!isHttpsUrl(url)) return "Must be a valid https:// URL";
  const platformUrl = platformUrlForClassic(url);
  if (platformUrl) return `Use the platform URL: ${platformUrl}`;
  return undefined;
}
