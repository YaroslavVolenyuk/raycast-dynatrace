import {
  escapeXml,
  keyValueGroupsMarkdown,
  keyValueGroupsSvg,
  headerMarkdown,
  headerSvg,
  severityIcon,
  severityIconSvg,
  logSeverity,
  severityOf,
  svgDataUri,
} from "../svg";

const decode = (md: string) => Buffer.from(md.match(/base64,([^)]+)\)/)![1], "base64").toString();

describe("severityOf", () => {
  it("buckets Dynatrace levels and statuses", () => {
    expect(severityOf("SEVERE")).toBe("error");
    expect(severityOf("warn")).toBe("warn");
    expect(severityOf("DEBUG")).toBe("info");
    expect(severityOf("NONE")).toBe("none");
    expect(severityOf("OK")).toBe("ok");
    expect(severityOf("UNSET")).toBe("none");
    expect(severityOf(undefined)).toBe("none");
  });

  it("takes the first value that maps to a bucket", () => {
    expect(severityOf("ERROR", "INFO")).toBe("error");
    expect(severityOf(undefined, "WARN")).toBe("warn");
  });
});

describe("logSeverity", () => {
  it("lets status override the level only for error and ok", () => {
    expect(logSeverity("INFO", "ERROR")).toBe("error");
    expect(logSeverity("WARN", "FATAL")).toBe("error");
    expect(logSeverity("ERROR", "INFO")).toBe("error");
    expect(logSeverity("OK", "INFO")).toBe("ok");
    expect(logSeverity("NONE", "WARN")).toBe("warn");
    expect(logSeverity("INFO", "weird")).toBe("info");
  });
});

describe("escapeXml", () => {
  it("escapes markup and drops control characters", () => {
    expect(escapeXml(`<a href="x">&'</a>\u0001`)).toBe("&#60;a href=&#34;x&#34;&#62;&#38;&#39;&#60;/a&#62;");
  });

  it("drops characters XML cannot carry but keeps astral ones", () => {
    expect(escapeXml("a\uFFFEb\uD800c\uFFFF")).toBe("abc");
    expect(escapeXml("x😀y")).toBe("x😀y");
  });
});

describe("headerSvg", () => {
  const header = { severity: "error" as const, title: "gateway", subtitle: "gateway-app" };

  it("keeps hostile telemetry inert inside the SVG", () => {
    const svg = headerSvg({ ...header, title: `</text><script>alert(1)</script><image href="https://e/x"/>` }, false);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<image");
  });

  it("clips long titles", () => {
    expect(headerSvg({ ...header, title: "x".repeat(200) }, false)).toContain("…");
  });

  it("ships as a base64 image that cannot break out of the markdown", () => {
    const md = headerMarkdown({ ...header, title: "a) ![b](https://e/y" }, true);
    expect(md).toMatch(/^!\[\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+\)$/);
    expect(decode(md)).toContain("<svg");
  });

  it("carries both palettes as media rules so an open card follows the system theme", () => {
    const svg = headerSvg(header, false);
    expect(svg).toContain("@media (prefers-color-scheme:light)");
    expect(svg).toContain("@media (prefers-color-scheme:dark)");
    expect(svg).toContain("#FF6369");
    expect(svg).toContain("#D92D3A");
  });

  it("switches the palette with the theme", () => {
    expect(headerSvg(header, true)).not.toBe(headerSvg(header, false));
  });
});

describe("severityIconSvg", () => {
  it("renders a distinct glyph per severity", () => {
    const svgs = (["error", "warn", "info", "ok", "none"] as const).map((s) => severityIconSvg(s, false));
    expect(new Set(svgs).size).toBe(5);
  });

  it("round-trips through a data URI", () => {
    const svg = severityIconSvg("info", true);
    expect(Buffer.from(svgDataUri(svg).split(",")[1], "base64").toString()).toBe(svg);
  });
});

describe("severityIcon", () => {
  it("builds each severity once", () => {
    expect(severityIcon("error")).toBe(severityIcon("error"));
    expect(severityIcon("error")).not.toBe(severityIcon("ok"));
  });
});

describe("keyValueGroupsSvg", () => {
  it("skips empty groups and returns '' when nothing remains", () => {
    expect(keyValueGroupsSvg([{ title: "A", rows: [] }], false)).toBe("");
    expect(keyValueGroupsMarkdown([], false)).toBe("");
  });

  it("escapes hostile keys and values and clips long ones", () => {
    const svg = keyValueGroupsSvg(
      [{ title: "<b>", rows: [["k<script>", `</text><image href="https://e/x"/>${"x".repeat(600)}`]] }],
      true,
    );
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<image");
    expect(svg).toContain("…");
  });

  it("wraps long values over several lines instead of cutting them", () => {
    const arn = "arn:aws:lambda:eu-west-1:123456789012:function:payments-handler-v2";
    const svg = keyValueGroupsSvg([{ title: "A", rows: [["faas.id", arn]] }], false);
    const lines = [...svg.matchAll(/font-size="13"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(arn);
  });

  it("wraps a value too wide for the column inside the column", () => {
    const id = "AWS_LAMBDA_FUNCTION-0000000000000004";
    const svg = keyValueGroupsSvg([{ title: "A", rows: [["dt.entity.aws_lambda_function", id]] }], false);
    const lines = [...svg.matchAll(/font-size="13"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(id);
    expect(svg).not.toContain('<text x="12" y="86"');
  });

  it("keeps short values beside their key", () => {
    const svg = keyValueGroupsSvg([{ title: "A", rows: [["host", "srv-02"]] }], false);
    expect(svg).toContain(`<text x="196" y="${8 + 40 + 21}"`);
  });

  it("breaks a list after the separator when the first item fits", () => {
    const svg = keyValueGroupsSvg(
      [{ title: "A", rows: [["dt.source_entity", "HOST-1, SERVICE-0000000000000004"]] }],
      false,
    );
    const lines = [...svg.matchAll(/font-size="13"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lines[0]).toBe("HOST-1,");
  });

  it("uses the requested width and fits more text per line", () => {
    const value = "word ".repeat(30);
    const lineCount = (svg: string) => [...svg.matchAll(/font-size="13"/g)].length;
    const rows = [["k", value]] as const;
    const narrow = keyValueGroupsSvg([{ title: "A", rows }], false);
    const wide = keyValueGroupsSvg([{ title: "A", rows }], false, 720);
    expect(wide).toContain('width="720"');
    expect(lineCount(wide)).toBeLessThan(lineCount(narrow));
  });

  it("grows with the number of rows", () => {
    const one = keyValueGroupsSvg([{ title: "A", rows: [["a", "1"]] }], false);
    const two = keyValueGroupsSvg(
      [
        {
          title: "A",
          rows: [
            ["a", "1"],
            ["b", "2"],
          ],
        },
      ],
      false,
    );
    expect(Number(two.match(/height="(\d+)"/)![1])).toBeGreaterThan(Number(one.match(/height="(\d+)"/)![1]));
  });
});
