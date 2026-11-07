import { listSectionSubtitle, listSectionTitle } from "../sectionTitle";

describe("listSectionTitle", () => {
  it("joins the count and the parts that are set", () => {
    expect(listSectionTitle(3, "log", ["Last 2 hours", undefined, "", "Prod"])).toBe("3 logs · Last 2 hours · Prod");
  });

  it("uses the singular for one record only", () => {
    expect(listSectionTitle(1, "span", [])).toBe("1 span");
    expect(listSectionTitle(0, "span", [])).toBe("0 spans");
  });
});

describe("listSectionSubtitle", () => {
  it("reports unreadable records, ahead of the Load More hint", () => {
    expect(listSectionSubtitle(1)).toBe("1 record could not be read");
    expect(listSectionSubtitle(2, true)).toBe("2 records could not be read");
  });

  it("hints at Load More when more records are available, and is empty otherwise", () => {
    expect(listSectionSubtitle(0, true)).toBe("More available — ⌘L to load more");
    expect(listSectionSubtitle(0)).toBeUndefined();
  });
});
