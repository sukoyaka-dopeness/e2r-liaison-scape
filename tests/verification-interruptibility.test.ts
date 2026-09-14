import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  compareWithSynchronousReference,
  createVerificationState,
  requestVerificationCancellation,
  runVerification,
  stepVerification,
  verificationExecutionContract,
} from "../experimental/verification-interruptibility1/prototype.mjs";
import { placeNodeLabel } from "../src/viewport.ts";

function input() {
  const graph = {
    nodes: [
      { id: "a", label: "Alpha", description: "", x: 0, y: 0 },
      { id: "b", label: "Beta", description: "", x: 220, y: 0 },
      { id: "c", label: "Gamma", description: "", x: 110, y: 170 },
    ],
    edges: [
      { id: "ab-1", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 2, label: "first relation" },
      { id: "ab-2", sourceId: "a", targetId: "b", parallelIndex: 1, parallelCount: 2, label: "second relation" },
      { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "long relation" },
      { id: "cc", sourceId: "c", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "self relation" },
    ],
  };
  const positions = Object.fromEntries(graph.nodes.map(({ id, x, y }) => [id, { x, y }]));
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]), [],
  ));
  return {
    graph,
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: true,
  };
}

test("staged verification is semantically equivalent to the current synchronous Product authority", () => {
  const result = compareWithSynchronousReference(input(), { maxStepMs: 50 });
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.feedbackApplied, result.reference.feedbackApplied);
  assert.deepEqual(result.stageTimings.map(({ stage }) => stage), [
    "label-free-route", "first-route", "first-relation-label", "first-node-label",
    "feedback-route", "feedback-relation-label", "feedback-node-label", "finalize",
  ]);
});

test("stage budget records non-interruptible current whole-pass work without partial Product commit", () => {
  const result = runVerification(input(), { maxStepMs: 0 });
  assert.equal(result.status, "completed");
  assert.ok(result.overBudgetStages.length > 0);
  assert.ok(result.stageTimings.every(({ interruptible }) => interruptible === false));
  assert.equal(result.state.result !== null, true);
  assert.equal(verificationExecutionContract.partialProductCommit, false);
});

test("cancellation between stages is safe and does not expose a partial result", () => {
  let state = createVerificationState(input(), { maxStepMs: 50 });
  state = stepVerification(state);
  state = requestVerificationCancellation(state);
  state = stepVerification(state);
  assert.equal(state.status, "cancelled");
  assert.equal(state.result, null);
});

test("browser summary retains dense over-budget and no-partial-output evidence", () => {
  const summary = JSON.parse(fs.readFileSync(path.resolve("experimental/verification-interruptibility1/browser-result-summary.json"), "utf8"));
  const dense = summary.cases.find((item: { id: string }) => item.id === "dense-k7-7");
  assert.equal(summary.status.classification, "PARTIAL INTERRUPTIBILITY ONLY");
  assert.ok(dense.maxStageMs > summary.budgetPolicyProbe.diagnosticFailureThresholdMs);
  assert.ok(summary.cases.every((item: { cooperative: { partialResultExposed: boolean } }) => item.cooperative.partialResultExposed === false));
});
