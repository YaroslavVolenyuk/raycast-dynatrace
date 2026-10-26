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

describe("records with null fields", () => {
  // Shape of a custom alert without affected entities, as Grail returns it.
  const custom = {
    "event.id": "-1_1V2",
    "event.name": "Stress: shipping",
    "event.status": "ACTIVE",
    "event.category": "CUSTOM_ALERT",
    "event.start": "2026-10-25T17:07:00.000Z",
    "event.end": null,
    display_id: "P-2610257",
    affected_entity_ids: null,
    affected_entity_names: null,
    "maintenance.is_under_maintenance": null,
  };

  it("keeps a problem whose optional fields are null", async () => {
    const executeDql = jest.fn().mockResolvedValue([custom]);
    const out = await listProblems({ executeDql } as unknown as DynatraceTransport, TENANT);
    expect(out).toHaveLength(1);
    expect(out[0].affectedEntityNames).toEqual([]);
  });

  it("throws instead of reporting no problems when no record can be read", async () => {
    const executeDql = jest.fn().mockResolvedValue([{ ...custom, "event.name": 42 }]);
    await expect(listProblems({ executeDql } as unknown as DynatraceTransport, TENANT)).rejects.toThrow(
      /Unexpected problem record format \(event\.name/,
    );
  });
});

describe("live record shape", () => {
  // Field set of a generated CUSTOM_ALERT problem from a live tenant (2026-10-25):
  // no event.end, no affected_entity_* keys at all.
  const live = {
    timestamp: "2026-10-25T17:17:26.699Z",
    "dt.openpipeline.source": "classic_root_cause_analysis",
    "dt.davis.mute.status": "NOT_MUTED",
    "dt.davis.is_frequent_event": false,
    "dt.analysis.ready": true,
    "dt.settings.references": [],
    "event.kind": "DAVIS_PROBLEM",
    "maintenance.is_under_maintenance": false,
    "event.category": "CUSTOM_ALERT",
    "dt.davis.analysis_time_budget": "0",
    rca_engine: "classic",
    "dt.davis.analysis_trigger_delay": "0",
    "dt.openpipeline.pipelines": ["davis.problems:default"],
    "dt.davis.impact_level": ["Environment"],
    "dt.davis.is_duplicate": false,
    "event.name": "Stress: shipping carrier API unavailable",
    "event.start": "2026-10-25T17:07:00.000Z",
    display_id: "P-2610257",
    "event.id": "4059720967948234132_1792948042177V2",
    "dt.davis.event_ids": [],
    "event.description": "# Stress",
    "event.status_transition": "CREATED",
    "event.status": "ACTIVE",
    "dt.duration_marker": "10 min",
  };

  it("parses it as an open problem", async () => {
    const executeDql = jest.fn().mockResolvedValue([live]);
    const [p] = await listProblems({ executeDql } as unknown as DynatraceTransport, TENANT);
    expect(p).toMatchObject({ displayId: "P-2610257", isOpen: true, category: "CUSTOM_ALERT" });
  });
});
