// Unit tests for the REST transport (sdk/http).

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { z } from "zod";
import { dynatraceRest, dynatraceRestPaginated } from "../transport";
import { RestError, ValidationError, DavisCopilotUnavailableError } from "../errors";
import { TenantConfig } from "../../auth";

// getAccessToken is mocked so the transport never makes a real SSO call.
jest.mock("../../auth", () => {
  const actual = jest.requireActual<typeof import("../../auth")>("../../auth");
  return {
    ...actual,
    getAccessToken: jest.fn(async () => "test-token"),
    invalidateTokenCache: jest.fn(),
  };
});

const sampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().optional(),
});

type Sample = z.infer<typeof sampleSchema>;

const mockTenant: TenantConfig = {
  id: "test-tenant",
  name: "Test Tenant",
  tenantEndpoint: "https://test.live.dynatrace.com",
  clientId: "test-client",
  clientSecret: "test-secret",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["test:scope"],
};

describe("dynatraceRest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("makes a GET request without body", async () => {
    const mockResponse = { id: "123", name: "Test" };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response),
    );

    const result = await dynatraceRest<typeof mockResponse>(mockTenant, "/api/v2/test", { method: "GET" });

    expect(result.status).toBe(200);
    expect(result.data).toEqual(mockResponse);
  });

  it("validates response with a Zod schema", async () => {
    const mockData: Sample = { id: "123", name: "Test", value: 42 };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(mockData)),
      } as Response),
    );

    const result = await dynatraceRest<Sample>(mockTenant, "/api/v2/test", { schema: sampleSchema });
    expect(result.data).toEqual(mockData);
  });

  it("throws ValidationError on schema mismatch", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify({ id: "123" })), // missing 'name'
      } as Response),
    );

    await expect(dynatraceRest<Sample>(mockTenant, "/api/v2/test", { schema: sampleSchema })).rejects.toThrow(
      ValidationError,
    );
  });

  it("maps HTTP 403 on a Davis CoPilot path to a dedicated error", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers(),
        text: () => Promise.resolve("{}"),
      } as Response),
    );

    await expect(dynatraceRest(mockTenant, "/davis/v1/copilot/nl2dql", { method: "POST" })).rejects.toThrow(
      DavisCopilotUnavailableError,
    );
  });

  it("handles 429 rate-limit errors", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "60" }),
        text: () => Promise.resolve("Rate limited"),
      } as Response),
    );

    await expect(dynatraceRest(mockTenant, "/api/v2/test")).rejects.toThrow(
      expect.objectContaining({ statusCode: 429 }),
    );
  });

  it("supports query parameters", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify([])),
      } as Response),
    );

    await dynatraceRest(mockTenant, "/api/v2/slo", { queryParams: { limit: "50", offset: "0" } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toContain("limit=50");
    expect(call[0]).toContain("offset=0");
  });

  it("supports POST with body", async () => {
    const requestBody = { title: "New Event", severity: "CRITICAL" };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify({ id: "event-123" })),
      } as Response),
    );

    await dynatraceRest(mockTenant, "/api/v2/events", { method: "POST", body: requestBody });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const options = call[1] as Record<string, unknown>;
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(requestBody));
  });

  it("handles network errors gracefully", async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Network error")));
    await expect(dynatraceRest(mockTenant, "/api/v2/test")).rejects.toThrow(RestError);
  });

  it("handles AbortSignal", async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(() => Promise.reject(new DOMException("Aborted", "AbortError")));
    await expect(dynatraceRest(mockTenant, "/api/v2/test", { signal: controller.signal })).rejects.toThrow(RestError);
  });

  it("rewrites /api/v2/* to the classic proxy path by default", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response),
    );

    await dynatraceRest(mockTenant, "/api/v2/slo");
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toContain("/platform/classic/environment-api/v2/slo");
  });
});

describe("dynatraceRestPaginated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("concatenates paginated results", async () => {
    const page1 = [
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ];
    const page2 = [{ id: "3", name: "Item 3" }];

    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      const response = callCount === 1 ? page1 : page2;
      const pageKey = callCount === 1 ? "page2Key" : undefined;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify({ results: response, nextPageKey: pageKey })),
      } as Response);
    });

    const result = await dynatraceRestPaginated(mockTenant, "/api/v2/problems", { paginate: true });

    expect(result.data).toHaveLength(3);
    expect(result.data).toEqual([...page1, ...page2]);
  });

  it("respects the maxPages limit", async () => {
    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () =>
          Promise.resolve(
            JSON.stringify({ results: [{ id: String(callCount) }], nextPageKey: callCount < 10 ? `page${callCount + 1}` : undefined }),
          ),
      } as Response);
    });

    await dynatraceRestPaginated(mockTenant, "/api/v2/test", { paginate: true, maxPages: 3 });
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it("handles arrays directly", async () => {
    const items = [
      { id: "1", name: "Test 1" },
      { id: "2", name: "Test 2" },
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(items)),
      } as Response),
    );

    const result = await dynatraceRestPaginated(mockTenant, "/api/v2/test");
    expect(result.data).toEqual(items);
  });
});
