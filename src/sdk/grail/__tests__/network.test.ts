import { environmentNetworkError, ssoNetworkError } from "../network";

const withCode = (code: unknown) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("environmentNetworkError", () => {
  it("explains an unresolvable host", () => {
    expect(environmentNetworkError(withCode("ENOTFOUND"), "https://abc.live.dynatrace.com/x").message).toBe(
      "Environment URL not found: abc.live.dynatrace.com does not exist. Check the tenant's Environment URL.",
    );
  });

  it("appends the cause code when present", () => {
    expect(environmentNetworkError(withCode("ECONNREFUSED"), "https://abc.live.dynatrace.com").message).toBe(
      "Cannot reach environment abc.live.dynatrace.com (ECONNREFUSED). Check the Environment URL and your network.",
    );
  });

  it("omits the code when absent or not a string, and falls back to the raw url", () => {
    expect(environmentNetworkError(new TypeError("fetch failed"), "not a url").message).toBe(
      "Cannot reach environment not a url. Check the Environment URL and your network.",
    );
    expect(environmentNetworkError(withCode(42), "not a url").message).toBe(
      "Cannot reach environment not a url. Check the Environment URL and your network.",
    );
  });
});

describe("ssoNetworkError", () => {
  it("appends the cause code when present", () => {
    expect(ssoNetworkError(withCode("ETIMEDOUT"), "https://sso.dynatrace.com/sso/oauth2/token").message).toBe(
      "Cannot reach the SSO endpoint sso.dynatrace.com (ETIMEDOUT). Check your network.",
    );
  });

  it("omits the code when absent", () => {
    expect(ssoNetworkError(new TypeError("fetch failed"), "https://sso.dynatrace.com").message).toBe(
      "Cannot reach the SSO endpoint sso.dynatrace.com. Check your network.",
    );
  });
});
