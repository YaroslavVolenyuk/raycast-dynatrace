import { DQL_TEMPLATES, templateScopes } from "../templates";

describe("DQL templates", () => {
  it("names the data scope of every template", () => {
    // storage:buckets:read + the source's scope
    const withoutSource = DQL_TEMPLATES.filter((t) => templateScopes(t).length !== 2).map((t) => t.title);
    expect(withoutSource).toEqual([]);
  });

  it("avoids the deprecated request.is_* span fields", () => {
    for (const t of DQL_TEMPLATES) expect(t.query).not.toMatch(/request\.is_/);
  });
});
