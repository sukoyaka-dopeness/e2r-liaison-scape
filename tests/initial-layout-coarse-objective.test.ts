import test from "node:test";
import assert from "node:assert/strict";
import { generateBoundedCoarseCandidate, scoreCoarseInitialLayout } from "../src/initial-layout-coarse-objective.ts";

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

test("Relation-label corridor pressure changes when a foreign Node enters the corridor", () => {
  const base = {
    entities: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
    relations: [{ id: "ab", sourceId: "a", targetId: "b", label: "a long relation label" }],
  };
  const clear = scoreCoarseInitialLayout({ ...base, positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 200 } } });
  const occupied = scoreCoarseInitialLayout({ ...base, positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 10 } } });
  assert.equal(clear.relationLabelCorridorPressure, 0);
  assert.ok(occupied.relationLabelCorridorPressure > clear.relationLabelCorridorPressure);
});

test("Self-loops do not create ordinary zero-chord or parallel pressure", () => {
  const base = {
    entities: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    relations: [{ id: "ab", sourceId: "a", targetId: "b", label: "works with" }],
    positions: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
  };
  const withLoop = scoreCoarseInitialLayout({ ...base, relations: [...base.relations, { id: "aa", sourceId: "a", targetId: "a", label: "self" }] });
  assert.deepEqual(withLoop, scoreCoarseInitialLayout(base));
});

test("coarse candidate generation is bounded and deterministic", () => {
  const input = { entities: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], relations: [{ id: "ab", sourceId: "a", targetId: "b", label: "works" }, { id: "bc", sourceId: "b", targetId: "c", label: "works" }] };
  const first = generateBoundedCoarseCandidate(input);
  const second = generateBoundedCoarseCandidate({ ...input, entities: [...input.entities].reverse() });
  assert.equal(first.status, "completed");
  assert.deepEqual(first.positions, second.positions);
  assert.ok(first.elapsedMs < 1000);
});
