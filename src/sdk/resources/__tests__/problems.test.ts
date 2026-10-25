import { problemRecordSchema, normalizeProblem, buildProblemsQuery, listProblems } from "../problems";
import type { DynatraceTransport } from "../../transport";
import type { TenantConfig } from "../../auth";
import fixture from "../__fixtures__/problems.search.json";

const TENANT = { id: "t1" } as TenantConfig;

describe("problemRecordSchema contract", () => {
  it("parses every fixture record", () => {
    for (const r of fixture.records) expect(() => problemRecordSchema.parse(r)).not.toThrow();
  });
});

describe("normalizeProblem", () => {
  it("maps a closed problem", () => {
    const e = normalizeProblem(problemRecordSchema.parse(fixture.records[0]));
    expect(e.id).toBe("-1000000000000000001_1792921500000V2");
    expect(e.displayId).toBe("P-260000001");
    expect(e.isOpen).toBe(false);
    expect(e.endTime).toBeDefined();
  });

  it("treats ACTIVE as open", () => {
    const e = normalizeProblem(problemRecordSchema.parse(fixture.records[1]));
    expect(e.isOpen).toBe(true);
    expect(e.endTime).toBeUndefined();
  });
});

describe("buildProblemsQuery", () => {
  it("dedups before filtering open", () => {
    const q = buildProblemsQuery();
    expect(q.indexOf("dedup")).toBeLessThan(q.indexOf("filter"));
    expect(q).toContain('event.status != "CLOSED"');
  });

  it("omits the status filter for all", () => {
    expect(buildProblemsQuery({ status: "all" })).not.toContain("filter");
  });
});

describe("listProblems", () => {
  it("skips invalid records and passes required scopes", async () => {
    const executeDql = jest.fn().mockResolvedValue([...fixture.records, { bogus: true }]);
    const transport = { executeDql } as unknown as DynatraceTransport;
    const out = await listProblems(transport, TENANT);
    expect(out).toHaveLength(2);
    expect(executeDql.mock.calls[0][2].requiredScopes).toContain("storage:events:read");
  });
});

describe("extraFilter", () => {
  it("appends the filter after the status filter", () => {
    const q = buildProblemsQuery({ extraFilter: 'event.category == "ERROR"' });
    expect(q).toContain('| filter event.status != "CLOSED" | filter event.category == "ERROR" | sort');
  });
  it("rejects pipes, line breaks and a leading filter keyword", () => {
    expect(() => buildProblemsQuery({ extraFilter: "a == 1 | limit 1" })).toThrow(/extra dql filter/i);
    expect(() => buildProblemsQuery({ extraFilter: "a\nb" })).toThrow();
    expect(() => buildProblemsQuery({ extraFilter: "filter a == 1" })).toThrow();
  });
  it("ignores a blank filter", () => {
    expect(buildProblemsQuery({ extraFilter: "  " })).not.toContain("filter event.category");
  });
});
