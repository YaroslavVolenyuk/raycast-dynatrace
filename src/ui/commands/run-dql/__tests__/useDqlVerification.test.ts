import { describeIssues } from "../useDqlVerification";

describe("describeIssues", () => {
  it("formats the first error with its position", () => {
    expect(
      describeIssues([
        { severity: "ERROR", message: "There's no command `filtr`.", line: 2, column: 3 },
        { severity: "ERROR", message: "second" },
      ]),
    ).toBe("Line 2, col 3: There's no command `filtr`. (+1 more)");
  });

  it("ignores warnings and info", () => {
    expect(describeIssues([{ severity: "WARN", message: "w" }])).toBeUndefined();
  });
});
