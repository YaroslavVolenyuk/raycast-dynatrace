import { shouldFetch } from "../refreshThrottle";

const MIN = 60_000;

describe("shouldFetch", () => {
  it("fetches when nothing was fetched yet", () => {
    expect(shouldFetch({ now: 1000, intervalMinutes: 30 })).toBe(true);
  });
  it("skips while the last fetch is fresh", () => {
    expect(shouldFetch({ now: 10 * MIN, lastFetchedAt: 0, intervalMinutes: 30 })).toBe(false);
  });
  it("fetches once the interval has elapsed (with tolerance)", () => {
    expect(shouldFetch({ now: 29.5 * MIN, lastFetchedAt: 0, intervalMinutes: 30 })).toBe(true);
    expect(shouldFetch({ now: 60 * MIN, lastFetchedAt: 0, intervalMinutes: 60 })).toBe(true);
  });
  it("force always fetches", () => {
    expect(shouldFetch({ now: 1, lastFetchedAt: 0, intervalMinutes: 60, force: true })).toBe(true);
  });
});
