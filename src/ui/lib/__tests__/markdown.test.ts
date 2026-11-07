import { fenceCode } from "../markdown";

describe("fenceCode", () => {
  it("uses a fence longer than any backtick run so content cannot break out", () => {
    const payload = '{"a":"```\\n![x](https://e/x)"}';
    const out = fenceCode(payload, "json");
    expect(out.startsWith("````json\n")).toBe(true);
    expect(out.endsWith("\n````")).toBe(true);
  });

  // A fence closes on a run at least as long as itself (CommonMark), so a fixed length is never enough.
  it.each([4, 10])("outgrows a run of %i backticks", (n) => {
    const payload = `${"`".repeat(n)}\n![x](https://e/x)\n${"`".repeat(n)}`;
    const fence = "`".repeat(n + 1);
    expect(fenceCode(payload)).toBe(`${fence}\n${payload}\n${fence}`);
  });
});
