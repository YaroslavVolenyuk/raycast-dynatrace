// Tests for the menu bar problems store: exact count, throttling, caching.

import * as raycast from "@raycast/api";
import type { ProblemEntry, TenantConfig } from "../../../../sdk";

jest.mock("../../../../sdk", () => ({
  ...jest.requireActual("../../../../sdk"),
  listProblems: jest.fn(),
}));
jest.mock("../../../../services/tenants", () => ({ getActiveTenant: jest.fn() }));

import { listProblems } from "../../../../sdk";
import { getActiveTenant } from "../../../../services/tenants";
import { loadProblems, MAX_COUNTED, MAX_SHOWN, openProblemCount, problemCountLabel } from "../problemsStore";

const mockList = listProblems as jest.MockedFunction<typeof listProblems>;
const mockTenant = getActiveTenant as jest.MockedFunction<typeof getActiveTenant>;
const setPreferences = (raycast as unknown as { _setPreferences: (p: Record<string, unknown>) => void })
  ._setPreferences;
const clearCache = (raycast.Cache as unknown as { _clear: () => void })._clear;

const TENANT: TenantConfig = {
  id: "t1",
  name: "Prod",
  tenantEndpoint: "https://abc.apps.dynatrace.com/",
  clientId: "c",
  clientSecret: "s",
  ssoEndpoint: "https://sso.dynatrace.com/sso/oauth2/token",
  scopes: ["storage:buckets:read", "storage:events:read"],
};

const problems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Problem ${i}` }) as ProblemEntry);

beforeEach(() => {
  jest.clearAllMocks();
  clearCache();
  setPreferences({});
  mockTenant.mockResolvedValue(TENANT);
});

it("counts every open problem up to the cap but keeps only the shown ones", async () => {
  mockList.mockResolvedValueOnce(problems(12));
  const result = await loadProblems(true);
  expect(mockList.mock.calls[0][2]).toMatchObject({ limit: MAX_COUNTED + 1 });
  expect(result).toMatchObject({ state: "ok", total: 12, hasMore: false, endpoint: "https://abc.apps.dynatrace.com" });
  expect(result.state === "ok" && result.problems).toHaveLength(MAX_SHOWN);
  expect(result.state === "ok" && problemCountLabel(result)).toBe("12");
});

it("shows N+ only past the counting cap", async () => {
  mockList.mockResolvedValueOnce(problems(MAX_COUNTED + 1));
  const result = await loadProblems(true);
  expect(result.state === "ok" && problemCountLabel(result)).toBe(`${MAX_COUNTED}+`);
});

it("reuses the cached result within the refresh interval", async () => {
  mockList.mockResolvedValueOnce(problems(2));
  await loadProblems(true);
  const again = await loadProblems(false);
  expect(mockList).toHaveBeenCalledTimes(1);
  expect(again).toMatchObject({ state: "ok", total: 2 });
});

it("queries again when the preferences change what the result means", async () => {
  mockList.mockResolvedValue(problems(1));
  await loadProblems(true);
  setPreferences({ lookback: "1d" });
  await loadProblems(false);
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(mockList.mock.calls[1][2]).toMatchObject({ lookback: "1d" });
});

it("reports a missing scope without querying", async () => {
  mockTenant.mockResolvedValue({ ...TENANT, scopes: ["storage:buckets:read"] });
  const result = await loadProblems(true);
  expect(mockList).not.toHaveBeenCalled();
  expect(result).toMatchObject({ state: "error", error: { kind: "config" } });
});

it("turns a failed query into an error result, never into zero problems", async () => {
  mockList.mockRejectedValueOnce(new Error("Dynatrace is not responding (15s timeout)"));
  expect(await loadProblems(true)).toMatchObject({ state: "error", error: { kind: "transient" } });
});

it("has nothing to show without a tenant", async () => {
  mockTenant.mockResolvedValue(null);
  expect(await loadProblems(true)).toEqual({ state: "no-tenant" });
});

it("never reads a result stored by an older version (no total) as zero problems", () => {
  const legacy = { problems: problems(7), hasMore: true };
  expect(openProblemCount(legacy)).toBe(7);
  expect(problemCountLabel(legacy)).toBe(`${MAX_SHOWN}+`);
  expect(problemCountLabel({ problems: problems(2), hasMore: false })).toBe("2");
});
