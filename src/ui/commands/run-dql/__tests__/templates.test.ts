import { DQL_TEMPLATES, templateScopes } from "../templates";

describe("DQL templates", () => {
  it.each(DQL_TEMPLATES.map((t) => [t.title, t] as const))("%s names its data scope", (_title, t) => {
    expect(templateScopes(t)).toHaveLength(2); // storage:buckets:read + the source's scope
  });

  it("avoids the deprecated request.is_* span fields", () => {
    for (const t of DQL_TEMPLATES) expect(t.query).not.toMatch(/request\.is_/);
  });
});
