// Turns Node fetch failures ("TypeError: fetch failed" with a `cause.code`) into
// messages a user can act on. Messages are matched by the UI (problemsError.ts),
// so keep the leading phrases stable.

/** True for a fetch failure that never got an HTTP response (DNS, TLS, refused…). */
export function isNetworkError(err: unknown): err is TypeError {
  return err instanceof TypeError && /fetch failed|network/i.test(err.message);
}

function causeCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Error for a network failure while calling the tenant environment. The SSO
 * answered before this call, so the machine is online: a name that does not
 * resolve means the Environment URL is wrong.
 */
export function environmentNetworkError(err: unknown, url: string): Error {
  const host = hostOf(url);
  const code = causeCode(err);
  if (code === "ENOTFOUND") {
    return new Error(`Environment URL not found: ${host} does not exist. Check the tenant in Manage Tenants.`);
  }
  return new Error(
    `Cannot reach environment ${host}${code ? ` (${code})` : ""}. Check the Environment URL and your network.`,
  );
}

/** Error for a network failure while requesting a token (offline, VPN, proxy). */
export function ssoNetworkError(err: unknown, url: string): Error {
  const code = causeCode(err);
  return new Error(`Cannot reach the SSO endpoint ${hostOf(url)}${code ? ` (${code})` : ""}. Check your network.`);
}
