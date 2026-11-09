import type { ReactElement } from "react";
import { serialize, type Node } from "../../../__tests__/raycastTree";
import { HOSTILE, unfencedLines } from "../../../__tests__/markdownSafety";
import { RecordDetail } from "../DqlResults";

jest.mock("@raycast/api", () => ({
  ...jest.requireActual("@raycast/api"),
  ...jest
    .requireActual<typeof import("../../../__tests__/raycastTree")>("../../../__tests__/raycastTree")
    .raycastStubs(),
}));

// THREAT_MODEL.md R1: a Run DQL record is all telemetry, column names included.
it("keeps a hostile record inside fences and SVG cards", () => {
  const record = { [HOSTILE]: HOSTILE, status: HOSTILE, nested: { a: HOSTILE } };
  const view = RecordDetail({
    record,
    columns: Object.keys(record),
    position: 1,
    title: HOSTILE,
    subtitle: HOSTILE,
    json: JSON.stringify(record, null, 2),
  }) as ReactElement<Record<string, unknown>>;
  const tree = serialize(view) as Exclude<Node, string>;
  expect(unfencedLines(tree.props.markdown as string)).toEqual([]);
});
