import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  completeRouteAccumulator,
  compareRouteAccumulatorWithSynchronous,
  createRouteAccumulator,
  routeAccumulatorContract,
  stepRouteAccumulator,
} from "../experimental/route-selection-accumulator1/prototype.mjs";

const browserSummary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "experimental", "route-selection-accumulator1", "browser-result-summary.json"), "utf8"));

function input() {
  return {
    graph: {
      nodes: [
        { id: "a", label: "A", description: "", x: 0, y: 0 },
        { id: "b", label: "B", description: "", x: 220, y: 0 },
        { id: "c", label: "C", description: "", x: 110, y: 160 },
        { id: "d", label: "D", description: "", x: 110, y: 320 },
      ],
      edges: [
        { id: "ab-1", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 2, label: "first" },
        { id: "ab-2", sourceId: "a", targetId: "b", parallelIndex: 1, parallelCount: 2, label: "second" },
        { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "third" },
        { id: "cc", sourceId: "c", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "loop" },
        { id: "ad", sourceId: "a", targetId: "d", parallelIndex: 0, parallelCount: 1, label: "fourth" },
      ],
    },
    positions: { a: { x: 0, y: 0 }, b: { x: 220, y: 0 }, c: { x: 110, y: 160 }, d: { x: 110, y: 320 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
  };
}

test("one-edge accumulator steps are exactly equivalent to the synchronous route authority", () => {
  const result = compareRouteAccumulatorWithSynchronous(input(), { maxStepMs: 50 });
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.steps.length, result.orderedEdgeCount);
  assert.equal(result.acceptedPrefixLength, result.orderedEdgeCount);
  assert.equal(result.futureEdgesRetained, false);
  assert.equal(result.precomputedParallelBundleCount, 1);
});

test("ordered state retains future-edge information while occupied paths grow one prefix at a time", () => {
  const state = createRouteAccumulator(input());
  const originalEdges = JSON.stringify(state.input.graph.edges);
  const originalPositions = JSON.stringify(state.input.positions);
  const first = stepRouteAccumulator(state);
  assert.equal(first.acceptedPrefixLength, 1);
  assert.equal(state.orderedEdges.length, 5);
  assert.equal(state.nextIndex, 1);
  assert.equal(state.done, false);
  assert.equal(state.orderedEdges.length > state.nextIndex, true);
  assert.equal(JSON.stringify(state.input.graph.edges), originalEdges);
  assert.equal(JSON.stringify(state.input.positions), originalPositions);
});

test("incomplete accumulator cannot be completed or exposed as a Product result", () => {
  const state = createRouteAccumulator(input());
  stepRouteAccumulator(state);
  assert.throws(() => completeRouteAccumulator(state), /before all ordered edges/);
  assert.equal(routeAccumulatorContract.partialProductCommit, false);
});

test("fixed browser evidence stays within the observed interactive route budget", () => {
  assert.equal(browserSummary.cases.length, 5);
  for (const item of browserSummary.cases) {
    assert.equal(item.semanticEquivalent, true, item.id);
    assert.equal(item.acceptedPrefixLength, item.orderedEdgeCount, item.id);
    assert.ok(item.initializeMs <= browserSummary.budgetTargetsMs.preferredInteractiveSlice, item.id);
    assert.ok(item.maxStepMs <= browserSummary.budgetTargetsMs.preferredInteractiveSlice, item.id);
    assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
  }
});
