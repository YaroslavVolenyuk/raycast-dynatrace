import {
  parseScopes,
  normalizeUrl,
  validateForm,
  buildTenantConfig,
  DEFAULT_SSO_ENDPOINT,
  DEFAULT_READONLY_SCOPES,
  type TenantFormValues,
} from "../tenantForm.helpers";

const validValues = (overrides: Partial<TenantFormValues> = {}): TenantFormValues => ({
  name: "Production",
  tenantEndpoint: "https://abc12345.apps.dynatrace.com",
  clientId: "dt0s02.ABC",
  clientSecret: "dt0s02.ABC.SECRET",
  ssoEndpoint: DEFAULT_SSO_ENDPOINT,
  scopes: DEFAULT_READONLY_SCOPES.join(" "),
  accountUrn: "",
  useClassicProxy: true,
  ...overrides,
});

describe("parseScopes", () => {
  it("splits on whitespace and commas and de-dupes", () => {
    expect(parseScopes("a b,c  a")).toEqual(["a", "b", "c"]);
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

  it("omits an empty accountUrn", () => {
    expect(buildTenantConfig(validValues({ accountUrn: "  " })).accountUrn).toBeUndefined();
  });
});
