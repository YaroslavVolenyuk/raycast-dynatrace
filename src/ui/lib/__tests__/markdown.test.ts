import { escapeMarkdown, escapeCell, fenceCode, keyValueTable } from "../markdown";
import { recordMarkdownTable } from "../dqlRecord";

const BEACON = "![x](https://e/x)";

/** True when the markdown still contains an image or link that a renderer would act on. */
const hasLiveImageOrLink = (md: string) =>
  /(^|[^\\])!\[[^\]]*(^|[^\\])\]\(/.test(md) || /(^|[^\\])\[[^\]]*\]\(/.test(md);

describe("escapeMarkdown", () => {
  it("neutralises image syntax", () => {
    const out = escapeMarkdown(BEACON);
    expect(out).toBe("\\!\\[x\\]\\(https://e/x\\)");
    expect(hasLiveImageOrLink(out)).toBe(false);
  });

  it("escapes table pipes and flattens line breaks", () => {
    expect(escapeMarkdown("a | b\r\nc\nd")).toBe("a \\| b c d");
  });

  it("escapes emphasis, code, html and headings", () => {
    expect(escapeMarkdown("*b* _i_ `c` <img> # h ~s~ \\")).toBe("\\*b\\* \\_i\\_ \\`c\\` \\<img\\> \\# h \\~s\\~ \\\\");
  });

  it("leaves plain text untouched", () => {
    expect(escapeMarkdown("GET /api/v1/users 200")).toBe("GET /api/v1/users 200");
  });
});

describe("keyValueTable", () => {
  it("escapes values, so a beacon in a span attribute stays inert", () => {
    const md = keyValueTable([
      ["status.message", BEACON],
      ["url.path", "/x | ![y](https://e/y)"],
    ]);
    expect(hasLiveImageOrLink(md)).toBe(false);
    expect(md.split("\n")).toHaveLength(4); // header, separator, 2 rows: the pipe did not add a column break
  });

  it("skips empty values and returns '' when nothing remains", () => {
    expect(
      keyValueTable([
        ["a", undefined],
        ["b", ""],
      ]),
    ).toBe("");
  });

  it("keeps dotted keys from autolinking", () => {
    expect(keyValueTable([["host.name", "h"]])).toContain("host\u200B.name");
  });
});

describe("recordMarkdownTable", () => {
  it("escapes beacon payloads in keys and values", () => {
    const md = recordMarkdownTable({ [BEACON]: BEACON, content: "ok" }, [BEACON, "content"]);
    expect(hasLiveImageOrLink(md)).toBe(false);
  });
});

describe("fenceCode", () => {
  it("uses a fence longer than any backtick run so content cannot break out", () => {
    const payload = '{"a":"```\\n![x](https://e/x)"}';
    const out = fenceCode(payload, "json");
    expect(out.startsWith("````json\n")).toBe(true);
    expect(out.endsWith("\n````")).toBe(true);
  });
});

describe("escapeCell", () => {
  it("stops bare URLs and domains from autolinking", () => {
    const out = escapeCell("see https://evil.example/x or www.evil.example");
    expect(out).not.toMatch(/https:\/\//);
    expect(out).not.toMatch(/\w\.\w/);
  });
});
