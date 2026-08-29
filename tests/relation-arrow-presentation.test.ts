import assert from "node:assert/strict";
import test from "node:test";

import { getRelationArrowheadGeometries } from "../src/relation-arrow-presentation.ts";
import { routeGraphEdge, type Point } from "../src/viewport.ts";

const samples: Point[] = [{ x: 0, y: 0 }, { x: 48, y: 24 }, { x: 100, y: 0 }];

test("maps the four modes to target, source, or both arrowhead ends", () => {
  const original = structuredClone(samples);
  const normal = getRelationArrowheadGeometries(samples, "normal", 2);
  const reverse = getRelationArrowheadGeometries(samples, "reverse", 2);
  const undirected = getRelationArrowheadGeometries(samples, "undirected", 2);
  const bidirectional = getRelationArrowheadGeometries(samples, "bidirectional", 2);

  assert.equal(normal.length, 1);
  assert.deepEqual(normal[0]?.tip, samples.at(-1));
  assert.equal(reverse.length, 1);
  assert.deepEqual(reverse[0]?.tip, samples[0]);
  assert.equal(undirected.length, 0);
  assert.equal(bidirectional.length, 2);
  assert.deepEqual(bidirectional.map(({ tip }) => tip), [samples[0], samples.at(-1)]);
  assert.deepEqual(samples, original);
});

test("preserves selected arrowhead sizing consistently at both ends", () => {
  const selected = getRelationArrowheadGeometries(samples, "bidirectional", 2.75);
  assert.equal(selected.length, 2);
  for (const arrowhead of selected) {
    assert.ok(Math.abs(Math.hypot(arrowhead.baseA.x - arrowhead.baseB.x, arrowhead.baseA.y - arrowhead.baseB.y) - 16.5) < 1e-9);
  }
});

test("handles curved and self-loop-like routes without changing their samples", () => {
  const curved = routeGraphEdge({ x: 0, y: 0 }, { x: 160, y: 80 }, 1, 2).samples;
  const curvedArrowheads = getRelationArrowheadGeometries(curved, "bidirectional", 2);
  assert.equal(curvedArrowheads.length, 2);
  assert.ok(curvedArrowheads.every(({ tip, baseA, baseB }) =>
    [tip, baseA, baseB].every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))));

  const self = routeGraphEdge({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 1).samples;
  const originalSelf = structuredClone(self);
  const normal = getRelationArrowheadGeometries(self, "normal", 2);
  const reverse = getRelationArrowheadGeometries(self, "reverse", 2);
  const undirected = getRelationArrowheadGeometries(self, "undirected", 2);
  const bidirectional = getRelationArrowheadGeometries(self, "bidirectional", 2);
  assert.deepEqual(normal[0]?.tip, self.at(-1));
  assert.deepEqual(reverse[0]?.tip, self[0]);
  assert.equal(undirected.length, 0);
  assert.equal(bidirectional.length, 2);
  assert.notDeepEqual(bidirectional[0]?.tip, bidirectional[1]?.tip);
  assert.deepEqual(self, originalSelf);
});
