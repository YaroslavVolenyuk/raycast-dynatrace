import {
  parseScopes,
  normalizeUrl,
  validateForm,
  buildTenantConfig,
  DEFAULT_SSO_ENDPOINT,
  OPTIONAL_SCOPES,
  REQUIRED_SCOPES,
  describeScopeCheck,
  type TenantFormValues,
} from "../tenantForm.helpers";

const validValues = (overrides: Partial<TenantFormValues> = {}): TenantFormValues => ({
  name: "Production",
  tenantEndpoint: "https://abc12345.apps.dynatrace.com",
  clientId: "dt0s02.ABC",
  clientSecret: "dt0s02.ABC.dummySecretValueNotReal",
  ssoEndpoint: DEFAULT_SSO_ENDPOINT,
  scopes: REQUIRED_SCOPES.join("\n"),
  ...overrides,
});

describe("parseScopes", () => {
  it("splits on whitespace and commas and de-dupes", () => {
    expect(parseScopes("a b,c  a")).toEqual(["a", "b", "c"]);
  });

  it("splits one-scope-per-line (TextArea input)", () => {
    expect(parseScopes("storage:logs:read\nstorage:problems:read\n\n")).toEqual([
      "storage:logs:read",
      "storage:problems:read",
    ]);
  });

  it("returns [] for empty / whitespace input", () => {
    expect(parseScopes("   ")).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeUrl("  https://x.dynatrace.com/// ")).toBe("https://x.dynatrace.com");
  });
});

describe("validateForm", () => {
  it("returns no errors for valid values", () => {
    expect(validateForm(validValues())).toEqual({});
  });

  it("flags missing name", () => {
    expect(validateForm(validValues({ name: "  " })).name).toBeDefined();
  });

  it("rejects a non-https environment URL", () => {
    expect(validateForm(validValues({ tenantEndpoint: "ftp://x" })).tenantEndpoint).toBeDefined();
  });

  it("requires at least one scope", () => {
    expect(validateForm(validValues({ scopes: "" })).scopes).toBeDefined();
  });

  it("requires client id and secret", () => {
    const errs = validateForm(validValues({ clientId: "", clientSecret: "" }));
    expect(errs.clientId).toBeDefined();
    expect(errs.clientSecret).toBeDefined();
  });
});

describe("buildTenantConfig", () => {
  it("normalizes fields and parses scopes", () => {
    const cfg = buildTenantConfig(
      validValues({ tenantEndpoint: "https://x.apps.dynatrace.com/", scopes: "storage:logs:read storage:logs:read" }),
    );
    expect(cfg.tenantEndpoint).toBe("https://x.apps.dynatrace.com");
    expect(cfg.scopes).toEqual(["storage:logs:read"]);
    expect(cfg.id).toBeTruthy();
  });

  it("reuses an existing id when editing", () => {
    expect(buildTenantConfig(validValues(), "fixed-id").id).toBe("fixed-id");
  });

  it("generates distinct ids for new tenants", () => {
    expect(buildTenantConfig(validValues()).id).not.toBe(buildTenantConfig(validValues()).id);
  });

  it("falls back to the prod SSO for blank SSO on a prod tenant", () => {
    const cfg = buildTenantConfig(
      validValues({ ssoEndpoint: "", tenantEndpoint: "https://abc12345.apps.dynatrace.com" }),
    );
    expect(cfg.ssoEndpoint).toBe("https://sso.dynatrace.com/sso/oauth2/token");
  });

  it("does not misread 'dev' outside a domain label as a dev environment", () => {
    const cfg = buildTenantConfig(validValues({ ssoEndpoint: "", tenantEndpoint: "https://devcorp.example.com" }));
    expect(cfg.ssoEndpoint).toBe("https://sso.dynatrace.com/sso/oauth2/token");
  });

  it("keeps an explicit SSO override", () => {
    const cfg = buildTenantConfig(validValues({ ssoEndpoint: "https://custom.sso.example.com/token" }));
    expect(cfg.ssoEndpoint).toBe("https://custom.sso.example.com/token");
  });
});

describe("REQUIRED_SCOPES (pre-filled for new tenants)", () => {
  it("does not pre-fill the optional events scope", () => {
    expect(REQUIRED_SCOPES).not.toContain("storage:events:read");
  });
});

describe("describeScopeCheck", () => {
  const withScopes = (scopes: string[]) => ({ scopes });

  it("is a clean success when everything is granted", () => {
    expect(describeScopeCheck(withScopes([...REQUIRED_SCOPES, ...OPTIONAL_SCOPES]))).toEqual({
      style: "success",
      title: "Connection verified",
      message: undefined,
    });
  });

  it("only hints (success) when just the optional events scope is missing", () => {
    const r = describeScopeCheck(withScopes([...REQUIRED_SCOPES]));
    expect(r.style).toBe("success");
    expect(r.message).toContain("storage:events:read");
    // Both places must be named: granting it in Dynatrace alone does not put it in the token request.
    expect(r.message).toMatch(/OAuth client/);
    expect(r.message).toMatch(/tenant/);
  });

  it("fails when a required scope is missing", () => {
    const r = describeScopeCheck(withScopes(["storage:logs:read"]));
    expect(r.style).toBe("failure");
    expect(r.message).toContain("storage:spans:read");
    expect(r.message).not.toContain("storage:events:read");
  });
});

// Users paste whatever is in the browser's address bar.
describe("environment URL as pasted by users", () => {
  it("keeps only the origin of a URL copied from the browser", () => {
    const cfg = buildTenantConfig(
      validValues({ tenantEndpoint: "https://abc12345.apps.dynatrace.com/ui/apps/dynatrace.logs?gtf=-2h#x" }),
    );
    expect(cfg.tenantEndpoint).toBe("https://abc12345.apps.dynatrace.com");
  });

  it("rejects a classic .live URL and suggests the platform URL", () => {
    const errors = validateForm(validValues({ tenantEndpoint: "https://abc12345.live.dynatrace.com" }));
    expect(errors.tenantEndpoint).toContain("https://abc12345.apps.dynatrace.com");
  });

  it("rejects a classic URL with a path too", () => {
    const errors = validateForm(validValues({ tenantEndpoint: "https://abc12345.live.dynatrace.com/#dashboards" }));
    expect(errors.tenantEndpoint).toContain("https://abc12345.apps.dynatrace.com");
  });

  it("accepts a non-Dynatrace host (proxies, Managed) unchanged", () => {
    expect(validateForm(validValues({ tenantEndpoint: "https://dt.example.com" })).tenantEndpoint).toBeUndefined();
  });
});
