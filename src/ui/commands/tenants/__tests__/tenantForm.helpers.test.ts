import {
  parseScopes,
  validateForm,
  buildTenantConfig,
  DEFAULT_SSO_ENDPOINT,
  OPTIONAL_SCOPES,
  REQUIRED_SCOPES,
  describeScopeCheck,
  ssoEndpointOverride,
  initialFormValues,
  newForeignHosts,
  type TenantFormValues,
} from "../tenantForm.helpers";

const validValues = (overrides: Partial<TenantFormValues> = {}): TenantFormValues => ({
  authType: "oauth",
  platformToken: "",
  name: "Production",
  tenantEndpoint: "https://abc12345.apps.dynatrace.com",
  clientId: "dt0s02.ABC",
  clientSecret: "dt0s02.ABC.dummySecretValueNotReal",
  ssoEndpoint: DEFAULT_SSO_ENDPOINT,
  scopes: REQUIRED_SCOPES.join("\n"),
  ...overrides,
});

describe("parseScopes", () => {
  it("splits on whitespace, commas and line breaks, de-dupes and drops blanks", () => {
    expect(parseScopes("a b,c  a\nd\n\n")).toEqual(["a", "b", "c", "d"]);
    expect(parseScopes("   ")).toEqual([]);
  });
});

describe("validateForm", () => {
  it("returns no errors for valid values", () => {
    expect(validateForm(validValues())).toEqual({});
  });

  it("rejects a non-https environment URL", () => {
    expect(validateForm(validValues({ tenantEndpoint: "ftp://x" })).tenantEndpoint).toBeDefined();
    expect(
      validateForm(validValues({ tenantEndpoint: "http://abc12345.apps.dynatrace.com" })).tenantEndpoint,
    ).toBeDefined();
  });

  // The client secret is posted to this URL: never in plain text.
  it("rejects a plain-http SSO endpoint", () => {
    expect(validateForm(validValues({ ssoEndpoint: "http://sso.example.com/token" })).ssoEndpoint).toBeDefined();
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

  it.each([
    ["https://abc.apps.dynatrace.com", DEFAULT_SSO_ENDPOINT],
    ["https://abc.dev.apps.dynatracelabs.com", "https://sso-dev.dynatracelabs.com/sso/oauth2/token"],
    ["https://abc.sprint.apps.dynatracelabs.com", "https://sso-sprint.dynatracelabs.com/sso/oauth2/token"],
  ])("derives the SSO endpoint of %s when the field is blank", (tenantEndpoint, sso) => {
    expect(buildTenantConfig(validValues({ tenantEndpoint, ssoEndpoint: "" })).ssoEndpoint).toBe(sso);
  });

  it("keeps an explicit SSO endpoint", () => {
    const sso = "https://sso.example.com/token";
    expect(
      buildTenantConfig(validValues({ tenantEndpoint: "https://abc.dev.apps.dynatracelabs.com", ssoEndpoint: sso }))
        .ssoEndpoint,
    ).toBe(sso);
  });

  it("reuses an existing id when editing", () => {
    expect(buildTenantConfig(validValues(), "fixed-id").id).toBe("fixed-id");
  });

  it("generates distinct ids for new tenants", () => {
    expect(buildTenantConfig(validValues()).id).not.toBe(buildTenantConfig(validValues()).id);
  });

  it("does not misread 'dev' outside a domain label as a dev environment", () => {
    const cfg = buildTenantConfig(validValues({ ssoEndpoint: "", tenantEndpoint: "https://devcorp.example.com" }));
    expect(cfg.ssoEndpoint).toBe("https://sso.dynatrace.com/sso/oauth2/token");
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

  it("rejects a classic .live URL, with or without a path, and suggests the platform URL", () => {
    for (const tenantEndpoint of ["https://abc12345.live.dynatrace.com", "https://abc12345.live.dynatrace.com/#x"]) {
      expect(validateForm(validValues({ tenantEndpoint })).tenantEndpoint).toContain(
        "https://abc12345.apps.dynatrace.com",
      );
    }
  });

  it("accepts a non-Dynatrace host (proxies, Managed) unchanged", () => {
    expect(validateForm(validValues({ tenantEndpoint: "https://dt.example.com" })).tenantEndpoint).toBeUndefined();
  });
});

describe("platform-token tenants in the form", () => {
  const tokenValues = (overrides: Partial<TenantFormValues> = {}) =>
    validValues({
      authType: "token",
      clientId: "",
      clientSecret: "",
      ssoEndpoint: "",
      platformToken: "dt0s16.A.B",
      ...overrides,
    });

  it("needs only URL, name, token and scopes", () => {
    expect(validateForm(tokenValues())).toEqual({});
  });

  it("keeps only the fields of the chosen method", () => {
    const token = buildTenantConfig(tokenValues({ clientSecret: "left-over" }), "id1");
    expect(token).toMatchObject({ platformToken: "dt0s16.A.B", clientId: "", clientSecret: "", ssoEndpoint: "" });
    const oauth = buildTenantConfig(validValues({ platformToken: "dt0s16.left-over" }), "id1");
    expect(oauth.platformToken).toBeUndefined();
    expect(oauth.clientSecret).toBe("dt0s02.ABC.dummySecretValueNotReal");
  });

  it("checks the scopes declared for the token", () => {
    const r = describeScopeCheck({ scopes: ["storage:logs:read"], platformToken: "dt0s16.A.B" });
    expect(r.style).toBe("failure");
  });

  it("never reports a 403 from the environment as verified", () => {
    const r = describeScopeCheck({ scopes: [...REQUIRED_SCOPES, ...OPTIONAL_SCOPES] }, { accessDenied: true });
    expect(r).toMatchObject({ style: "failure", title: "Connected, but access denied" });
  });

  it("shows the reason from the 403 body, without doubling its full stop", () => {
    const r = describeScopeCheck({ scopes: [...REQUIRED_SCOPES] }, { accessDenied: true, detail: "Denied." });
    expect(r.message).toMatch(/^Denied\. The /);
  });
});

describe("ssoEndpointOverride (SSO field when editing)", () => {
  it("is blank when the stored SSO is the one derived from the URL", () => {
    const prod = { tenantEndpoint: "https://abc12345.apps.dynatrace.com", ssoEndpoint: DEFAULT_SSO_ENDPOINT };
    expect(ssoEndpointOverride(prod)).toBe("");
    // so moving the tenant to a dev URL derives the dev SSO on save
    const edited = buildTenantConfig(
      validValues({
        tenantEndpoint: "https://abc12345.dev.apps.dynatracelabs.com",
        ssoEndpoint: ssoEndpointOverride(prod),
      }),
    );
    expect(edited.ssoEndpoint).toBe("https://sso-dev.dynatracelabs.com/sso/oauth2/token");
  });

  it("keeps a custom SSO endpoint", () => {
    const custom = {
      tenantEndpoint: "https://abc12345.apps.dynatrace.com",
      ssoEndpoint: "https://sso.example.com/token",
    };
    expect(ssoEndpointOverride(custom)).toBe("https://sso.example.com/token");
  });
});

describe("validateForm (exact messages and order)", () => {
  it("reports every problem, in field order", () => {
    const errs = validateForm(
      validValues({
        name: "",
        tenantEndpoint: "",
        clientId: "",
        clientSecret: "",
        ssoEndpoint: "http://x",
        scopes: "",
      }),
    );
    expect(Object.keys(errs)).toEqual(["name", "tenantEndpoint", "clientId", "clientSecret", "ssoEndpoint", "scopes"]);
    expect(errs).toMatchObject({
      name: "Name is required",
      clientId: "Client ID is required",
      clientSecret: "Client Secret is required",
      ssoEndpoint: "Must be a valid https:// URL",
      scopes: "At least one scope is required",
    });
  });

  it("accepts a blank SSO endpoint for OAuth and ignores OAuth fields for tokens", () => {
    expect(validateForm(validValues({ ssoEndpoint: " " }))).toEqual({});
    const token = validateForm(validValues({ authType: "token", platformToken: "", clientId: "", ssoEndpoint: "x" }));
    expect(token).toEqual({ platformToken: "Platform token is required" });
  });

  it("explains the classic API token rejection", () => {
    expect(validateForm(validValues({ authType: "token", platformToken: "dt0c01.A.B" })).platformToken).toBe(
      "This is a classic API token; use a platform token (dt0s16.…)",
    );
  });
});

describe("describeScopeCheck optional-scope hint", () => {
  // Both places must be named: granting the scope in Dynatrace alone does not put it in the token request.
  it("names the scope and how to get it, per credentials kind", () => {
    expect(describeScopeCheck({ scopes: [...REQUIRED_SCOPES] })).toEqual({
      style: "success",
      title: "Connection verified",
      message:
        "Optional, for Problems in Menu Bar: grant storage:events:read to the OAuth client, then add it to this tenant's scopes",
    });
    expect(describeScopeCheck({ scopes: [...REQUIRED_SCOPES], platformToken: "dt0s16.A.B" }).message).toBe(
      "Optional, for Problems in Menu Bar: a token with storage:events:read, listed in this tenant's scopes",
    );
  });
});

describe("initialFormValues", () => {
  it("starts a new tenant on a platform token with the required scopes", () => {
    expect(initialFormValues()).toEqual({
      authType: "token",
      name: "",
      tenantEndpoint: "",
      platformToken: "",
      clientId: "",
      clientSecret: "",
      ssoEndpoint: "",
      scopes: REQUIRED_SCOPES.join("\n"),
    });
  });

  it("loads an OAuth tenant with its SSO shown only when it is an override", () => {
    const tenant = {
      id: "t1",
      name: "Prod",
      tenantEndpoint: "https://abc12345.apps.dynatrace.com",
      clientId: "dt0s02.A",
      clientSecret: "secret",
      ssoEndpoint: DEFAULT_SSO_ENDPOINT,
      scopes: ["storage:logs:read", "storage:spans:read"],
    };
    expect(initialFormValues(tenant)).toMatchObject({
      authType: "oauth",
      name: "Prod",
      platformToken: "",
      clientId: "dt0s02.A",
      ssoEndpoint: "",
      scopes: "storage:logs:read\nstorage:spans:read",
    });
    expect(initialFormValues({ ...tenant, ssoEndpoint: "https://sso.example.com/t" }).ssoEndpoint).toBe(
      "https://sso.example.com/t",
    );
  });

  it("loads a platform-token tenant as token auth", () => {
    const tenant = {
      id: "t2",
      name: "Tok",
      tenantEndpoint: "https://abc12345.apps.dynatrace.com",
      clientId: "",
      clientSecret: "",
      ssoEndpoint: "",
      platformToken: "dt0s16.A.B",
      scopes: [...REQUIRED_SCOPES],
    };
    expect(initialFormValues(tenant)).toMatchObject({ authType: "token", platformToken: "dt0s16.A.B" });
  });
});

describe("newForeignHosts", () => {
  const saas = buildTenantConfig(validValues());
  const token = (url: string) =>
    buildTenantConfig(validValues({ authType: "token", platformToken: "dt0s16.X.Y", tenantEndpoint: url }));

  it("is empty for Dynatrace SaaS URLs", () => {
    expect(newForeignHosts(saas)).toEqual([]);
  });

  it("names a lookalike environment host", () => {
    expect(newForeignHosts(token("https://abc12345.apps.dynatrace.com.attacker.example"))).toEqual([
      "abc12345.apps.dynatrace.com.attacker.example",
    ]);
  });

  it("names a custom SSO endpoint of an OAuth client", () => {
    const cfg = buildTenantConfig(validValues({ ssoEndpoint: "https://sso.corp.example/token" }));
    expect(newForeignHosts(cfg)).toEqual(["sso.corp.example"]);
  });

  it("does not ask again for a host the edited tenant already used", () => {
    const proxy = token("https://dt-proxy.corp.example");
    expect(newForeignHosts({ ...proxy, name: "Renamed" }, proxy)).toEqual([]);
    expect(newForeignHosts(token("https://other.corp.example"), proxy)).toEqual(["other.corp.example"]);
  });
});
