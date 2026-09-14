import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  completeNodeLabelAccumulator,
  compareNodeLabelAccumulatorWithSynchronous,
  createNodeLabelAccumulator,
  nodeLabelAccumulatorContract,
  stepNodeLabelAccumulator,
} from "../experimental/node-label-accumulator1/prototype.mjs";
import { deriveAutomaticNodeLabels, deriveAutomaticRoutes } from "../src/graph-presentation.ts";

const browserSummary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "experimental", "node-label-accumulator1", "browser-result-summary.json"), "utf8"));

function input() {
  const graph = {
    nodes: [
      { id: "a", label: "Alpha", description: "", x: 0, y: 0 },
      { id: "b", label: "Beta", description: "", x: 220, y: 0 },
      { id: "c", label: "Gamma", description: "", x: 110, y: 160 },
      { id: "d", label: "Delta", description: "", x: 110, y: 320 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "A to B" },
      { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "B to C" },
    ],
  };
  const positions = { a: { x: 0, y: 0 }, b: { x: 220, y: 0 }, c: { x: 110, y: 160 }, d: { x: 110, y: 320 } };
  const routedEdges = deriveAutomaticRoutes({ graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] });
  return {
    nodes: graph.nodes,
    positions,
    routedEdges,
    occupiedRelationLabels: new Map([["relation", { x: 110, y: -40, width: 64, height: 22, directionX: 0, directionY: -1 }]]),
    previousPlacements: new Map([
      ["b", { x: 220, y: 48, width: 54, height: 22, directionX: 0, directionY: 1 }],
      ["c", { x: 154, y: 160, width: 54, height: 22, directionX: 1, directionY: 0 }],
    ]),
    manualOffsets: new Map([["c", { x: 22, y: 34 }]]),
    activelyDraggedNodeId: "b",
    yieldingRoutes: [{ samples: routedEdges[0]!.samples, deviation: 18 }],
  };
}

test("one-Node steps are exactly equivalent, including prefix, manual offset, active drag, yielding route, and traces", () => {
  const result = compareNodeLabelAccumulatorWithSynchronous(input());
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.traceEquivalent, true);
  assert.equal(result.steps.length, result.orderedNodeCount);
  assert.equal(result.acceptedPrefixLength, result.orderedNodeCount);
  assert.equal(result.initialRelationLabelCount, 1);
  assert.equal(result.yieldingRouteCount, 1);
  assert.equal(result.previousPlacementEvaluations, 32);
});

test("initial Relation-label occupancy and accepted Node-label prefix remain distinct and ordered", () => {
  const state = createNodeLabelAccumulator(input());
  assert.equal(state.initialRelationLabels.length, 1);
  assert.equal(state.occupiedLabels.length, 1);
  assert.equal(state.acceptedNodeLabels.length, 0);
  const first = stepNodeLabelAccumulator(state);
  assert.equal(first.acceptedPrefixLength, 1);
  assert.equal(first.occupiedSequenceLength, 2);
  assert.equal(state.initialRelationLabels.length, 1);
  assert.equal(state.occupiedLabels[0], state.initialRelationLabels[0]);
  assert.equal(state.occupiedLabels[1], state.acceptedNodeLabels[0]);
});

test("incomplete Node-label accumulator cannot be finalized or exposed as Product output", () => {
  const state = createNodeLabelAccumulator(input());
  stepNodeLabelAccumulator(state);
  assert.throws(() => completeNodeLabelAccumulator(state), /before all Nodes/);
  assert.equal(nodeLabelAccumulatorContract.partialProductCommit, false);
  assert.equal(nodeLabelAccumulatorContract.authorityMigration, false);
});

test("step-count exhaustion and non-finite geometry fail closed", () => {
  const exhausted = compareNodeLabelAccumulatorWithSynchronous(input(), { maxSteps: 1, maxStepMs: 50 });
  assert.equal(exhausted.status, "budget-exhausted");
  assert.equal(exhausted.labels, null);
  const invalidInput = input();
  invalidInput.positions.a = { x: Number.NaN, y: 0 };
  const invalidState = createNodeLabelAccumulator(invalidInput);
  while (!invalidState.done) stepNodeLabelAccumulator(invalidState);
  assert.throws(() => completeNodeLabelAccumulator(invalidState), /non-finite geometry/);
});

test("current synchronous Node-label output remains deterministic", () => {
  const value = input();
  assert.deepEqual(
    deriveAutomaticNodeLabels(value),
    deriveAutomaticNodeLabels(value),
  );
});

test("fixed browser evidence keeps both Node-label passes under the interactive reference", () => {
  assert.equal(browserSummary.cases.length, 5);
  for (const item of browserSummary.cases) {
    for (const [pass, result] of Object.entries(item.passes) as Array<[string, { semanticEquivalent: boolean; traceEquivalent: boolean; initializeMs: number; maxStepMs: number }]> ) {
      assert.equal(result.semanticEquivalent, true, `${item.id}/${pass}`);
      assert.equal(result.traceEquivalent, true, `${item.id}/${pass}`);
      assert.ok(result.initializeMs <= browserSummary.budgetTargetsMs.preferredInteractiveSlice, `${item.id}/${pass}`);
      assert.ok(result.maxStepMs <= browserSummary.budgetTargetsMs.preferredInteractiveSlice, `${item.id}/${pass}`);
    }
    assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
  }
});
