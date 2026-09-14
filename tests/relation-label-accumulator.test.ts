import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  completeRelationLabelAccumulator,
  compareRelationLabelAccumulatorWithSynchronous,
  createRelationLabelAccumulator,
  relationLabelAccumulatorContract,
  stepRelationLabelAccumulator,
} from "../experimental/relation-label-accumulator1/prototype.mjs";
import { deriveAutomaticRoutes } from "../src/graph-presentation.ts";

const browserSummary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "experimental", "relation-label-accumulator1", "browser-result-summary.json"), "utf8"));

function input() {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 220, y: 0 },
      { id: "c", label: "C", description: "", x: 110, y: 160 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "A to B" },
      { id: "bc-empty", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "" },
      { id: "ca", sourceId: "c", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "C to A" },
    ],
  };
  const routes = deriveAutomaticRoutes({
    graph,
    positions: { a: { x: 0, y: 0 }, b: { x: 220, y: 0 }, c: { x: 110, y: 160 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
  });
  return {
    routedEdges: routes,
    nodes: graph.nodes.map(({ x, y }) => ({ x, y })),
    previousPlacements: new Map([["ab", { x: 90, y: -38, width: 48, height: 22, directionX: 0, directionY: -1 }]]),
    manualAnchors: new Map([["ca", { fraction: 0.4, tangentOffset: 8, normalOffset: -18 }]]),
  };
}

test("one routed-edge Relation-label steps are exactly equivalent, including manual anchors and traces", () => {
  const result = compareRelationLabelAccumulatorWithSynchronous(input());
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.traceEquivalent, true);
  assert.equal(result.steps.length, result.orderedEdgeCount);
  assert.equal(result.acceptedPrefixLength, 2);
  assert.equal(result.labelledEdgeCount, 2);
  assert.equal(result.manualAnchorReconstructions, 1);
});

test("Relation-label state retains global route bounds and future edge information while prefix grows", () => {
  const state = createRelationLabelAccumulator(input());
  assert.equal(state.routeBounds.length, 3);
  assert.equal(state.orderedEdges.length, 3);
  const first = stepRelationLabelAccumulator(state);
  assert.equal(first.relationId, "ab");
  assert.equal(first.acceptedPrefixLength, 1);
  assert.equal(state.nextIndex, 1);
  assert.equal(state.orderedEdges.length > state.nextIndex, true);
  assert.equal(state.routeBounds.length, state.orderedEdges.length);
});

test("incomplete Relation-label accumulator cannot be finalized or exposed as Product output", () => {
  const state = createRelationLabelAccumulator(input());
  stepRelationLabelAccumulator(state);
  assert.throws(() => completeRelationLabelAccumulator(state), /before all routed edges/);
  assert.equal(relationLabelAccumulatorContract.partialProductCommit, false);
  assert.equal(relationLabelAccumulatorContract.authorityMigration, false);
});

test("step-count exhaustion is fail-closed", () => {
  const result = compareRelationLabelAccumulatorWithSynchronous(input(), { maxSteps: 1, maxStepMs: 50 });
  assert.equal(result.status, "budget-exhausted");
  assert.equal(result.labels, null);
  assert.equal(result.semanticEquivalent, false);
});

test("non-finite Relation-label geometry is rejected at completion", () => {
  const value = input();
  const first = value.routedEdges[0]!;
  const invalid = { ...first, samples: [{ x: Number.NaN, y: 0 }] };
  const state = createRelationLabelAccumulator({ ...value, routedEdges: [invalid, ...value.routedEdges.slice(1)] });
  while (!state.done) stepRelationLabelAccumulator(state);
  assert.throws(() => completeRelationLabelAccumulator(state), /non-finite geometry/);
});

test("fixed browser evidence preserves both passes under the diagnostic ceiling", () => {
  assert.equal(browserSummary.cases.length, 5);
  for (const item of browserSummary.cases) {
    for (const [pass, result] of Object.entries(item.passes) as Array<[string, { semanticEquivalent: boolean; traceEquivalent: boolean; initializeMs: number; maxStepMs: number }]> ) {
      assert.equal(result.semanticEquivalent, true, `${item.id}/${pass}`);
      assert.equal(result.traceEquivalent, true, `${item.id}/${pass}`);
      assert.ok(result.initializeMs <= browserSummary.budgetTargetsMs.diagnosticCeiling, `${item.id}/${pass}`);
      assert.ok(result.maxStepMs <= browserSummary.budgetTargetsMs.diagnosticCeiling, `${item.id}/${pass}`);
    }
    assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
  }
});
