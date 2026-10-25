import { buildProblemUrl } from "../deepLinks";

describe("buildProblemUrl", () => {
  it("matches the Problems app URL format", () => {
    expect(buildProblemUrl("https://abc.apps.dynatrace.com", "-245_1792676100000V2")).toBe(
      "https://abc.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/problem/-245_1792676100000V2",
    );
  });
});
