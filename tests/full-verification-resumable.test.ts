import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { placeNodeLabel } from "../src/viewport.ts";
import {
  compareFullVerificationWithSynchronous,
  createFullVerificationState,
  fullVerificationExecutionContract,
  requestFullVerificationCancellation,
  runFullVerification,
  stepFullVerification,
} from "../experimental/full-verification1/prototype.mjs";

const browserSummary = JSON.parse(readFileSync("experimental/full-verification1/browser-result-summary.json", "utf8"));

function input(feedbackEnabled = true) {
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
    feedbackEnabled,
  };
}

test("full accumulator is exact-equivalent to synchronous Product authority and traces", () => {
  const result = compareFullVerificationWithSynchronous(input(), { maxSteps: 1000 });
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.traceEquivalent, true);
  assert.equal(result.partialResultExposed, false);
  assert.equal(result.feedbackApplied, result.reference.feedbackApplied);
  assert.ok(result.completedWorkUnits >= 4);
  assert.ok(result.completedPhaseTransitions >= 4);
  assert.ok(result.maxScheduledSliceMs >= result.maxWorkUnitMs);
});

test("feedback decision is a bounded phase and preserves no-feedback semantics", () => {
  const result = compareFullVerificationWithSynchronous(input(false), { maxSteps: 1000 });
  assert.equal(result.status, "completed");
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.traceEquivalent, true);
  assert.equal(result.feedbackApplied, false);
  assert.deepEqual(result.steps.map(({ phase }) => phase).filter((phase) => phase === "prepare-feedback"), ["prepare-feedback"]);
  assert.equal(result.steps.some(({ phase }) => phase === "feedback-route"), false);
});

test("cancellation between any scheduler turns exposes no partial Product result", () => {
  for (let cancelAtStep = 0; cancelAtStep < 12; cancelAtStep += 1) {
    const result = runFullVerification(input(), { cancelAtStep, maxSteps: 1000 });
    assert.equal(result.status, "cancelled");
    assert.equal(result.partialResultExposed, false);
    assert.equal(result.semanticResult, null);
  }
});

test("budget exhaustion is fail-closed while retaining completed intermediate state privately", () => {
  const result = runFullVerification(input(), { maxSteps: 3 });
  assert.equal(result.status, "budget-exhausted");
  assert.equal(result.partialResultExposed, false);
  assert.equal(result.semanticResult, null);
  assert.ok(result.completedWorkUnits > 0);
});

test("direct state cancellation wins before the next work unit", () => {
  const envelope = createFullVerificationState(input());
  stepFullVerification(envelope);
  requestFullVerificationCancellation(envelope);
  stepFullVerification(envelope);
  assert.equal(envelope.state.status, "cancelled");
  assert.equal(envelope.state.result, null);
});

test("execution contract keeps authority and Worker/provider decisions separate", () => {
  assert.equal(fullVerificationExecutionContract.partialProductCommit, false);
  assert.equal(fullVerificationExecutionContract.datasetMutation, false);
  assert.equal(fullVerificationExecutionContract.workerDecision, "not-decided-by-this-checkpoint");
  assert.deepEqual(fullVerificationExecutionContract.naturalWorkUnits, {
    route: "one canonical ordered edge",
    relationLabel: "one ordered routed edge",
    nodeLabel: "one input-order Node",
  });
});

test("fixed Edge evidence preserves exactness while keeping Product-wide budget open", () => {
  const latest = browserSummary.runs.find(({ id }) => id === "run-3-cooperative-completion");
  assert.equal(latest.cases.length, 5);
  assert.equal(latest.cases.every(({ status, semanticEquivalent, traceEquivalent, partialResultExposed }) => (
    status === "completed" && semanticEquivalent && traceEquivalent && partialResultExposed === false
  )), true);
  assert.equal(latest.cases.every(({ cooperativeCancel }) => (
    cooperativeCancel.status === "cancelled" && cooperativeCancel.partialProductResultExposed === false
  )), true);
  assert.equal(browserSummary.disposition.resumableSeam, "ESTABLISHED");
  assert.equal(browserSummary.disposition.productWideBudget, "NOT_ESTABLISHED");
  assert.equal(browserSummary.disposition.preferred16msSlice, "NOT_UNIFORM");
  assert.equal(browserSummary.disposition.diagnostic50msCeiling, "NOT_ESTABLISHED_PRODUCT_WIDE");
});
