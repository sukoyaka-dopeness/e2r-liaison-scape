import test from "node:test";
import assert from "node:assert/strict";
import { scoreCoarseInitialLayout } from "../src/initial-layout-coarse-objective.ts";

test("coarse objective detects geometry proxies without invoking Product routing", () => {
  const result = scoreCoarseInitialLayout({
    entities: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }],
    relations: [{ id: "ab", sourceId: "a", targetId: "b", label: "a long relation label" }, { id: "ac", sourceId: "a", targetId: "c", label: "parallel" }],
    positions: { a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, c: { x: 0, y: 500 } },
  });
  assert.equal(result.nodeBodyOverlaps, 0);
  assert.equal(result.longEdges, 2);
  assert.ok(result.score > 0);
});

test("same geometry and reordered input produce the same score", () => {
  const base = { entities: [{ id: "a", label: "A" }, { id: "b", label: "B" }], relations: [{ id: "ab", sourceId: "a", targetId: "b", label: "works with" }], positions: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } } };
  const first = scoreCoarseInitialLayout(base);
  const second = scoreCoarseInitialLayout({ ...base, entities: [...base.entities].reverse(), relations: [...base.relations].reverse() });
  assert.deepEqual(first, second);
});
