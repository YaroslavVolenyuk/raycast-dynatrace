import { listSectionSubtitle, listSectionTitle } from "../sectionTitle";

describe("listSectionTitle", () => {
  it("joins the count and the set parts", () => {
    expect(listSectionTitle(3, "log", ["Last 2 hours", "“timeout”", "Prod"])).toBe(
      "3 logs · Last 2 hours · “timeout” · Prod",
    );
  });

  it("uses the singular for one record", () => {
    expect(listSectionTitle(1, "span", ["Last 2 hours"])).toBe("1 span · Last 2 hours");
  });

  it("uses the plural for zero records", () => {
    expect(listSectionTitle(0, "span", [])).toBe("0 spans");
  });

  it("skips parts that are not set", () => {
    expect(listSectionTitle(2, "log", ["Last 2 hours", undefined, ""])).toBe("2 logs · Last 2 hours");
  });
});

describe("listSectionSubtitle", () => {
  it("reports unreadable records", () => {
    expect(listSectionSubtitle(1)).toBe("1 record could not be read");
    expect(listSectionSubtitle(4)).toBe("4 records could not be read");
  });

  it("prefers unreadable records over the Load More hint", () => {
    expect(listSectionSubtitle(2, true)).toBe("2 records could not be read");
  });

  it("hints at Load More when more records are available", () => {
    expect(listSectionSubtitle(0, true)).toBe("More available — ⌘L to load more");
  });

  it("is empty otherwise", () => {
    expect(listSectionSubtitle(0)).toBeUndefined();
    expect(listSectionSubtitle(0, false)).toBeUndefined();
  });
});
