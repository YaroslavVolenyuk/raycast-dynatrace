import { fenceCode } from "../markdown";

describe("fenceCode", () => {
  it("uses a fence longer than any backtick run so content cannot break out", () => {
    const payload = '{"a":"```\\n![x](https://e/x)"}';
    const out = fenceCode(payload, "json");
    expect(out.startsWith("````json\n")).toBe(true);
    expect(out.endsWith("\n````")).toBe(true);
  });
});
