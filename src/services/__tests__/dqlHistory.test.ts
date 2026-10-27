// Tests for src/services/dqlHistory.ts — Run DQL restores its last query and timeframe.

import { LocalStorage } from "@raycast/api";
import { getLastDqlQuery, getLastDqlTimeframe, setLastDqlQuery, setLastDqlTimeframe } from "../dqlHistory";

const ls = LocalStorage as unknown as { _clear: () => void };

beforeEach(() => ls._clear());

it("returns undefined before anything was saved", async () => {
  expect(await getLastDqlQuery()).toBeUndefined();
  expect(await getLastDqlTimeframe()).toBeUndefined();
});

it("round-trips the last query and timeframe", async () => {
  await setLastDqlQuery("fetch logs | limit 5");
  await setLastDqlTimeframe("2h");
  expect(await getLastDqlQuery()).toBe("fetch logs | limit 5");
  expect(await getLastDqlTimeframe()).toBe("2h");
});

it("treats an empty saved query as none", async () => {
  await setLastDqlQuery("");
  expect(await getLastDqlQuery()).toBeUndefined();
});
