import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { placeNodeLabel } from "../src/viewport.ts";
import { compareFullVerificationWithSynchronous } from "../experimental/full-verification1/prototype.mjs";
import {
  compareScheduledVerificationWithSynchronous,
  requestSchedulerCancellation,
  runScheduledVerification,
  schedulerPolicies,
  schedulerPolicyContract,
  stepScheduledTurn,
  createSchedulerEnvelope,
} from "../experimental/scheduler-policy1/prototype.mjs";

const browserSummary = JSON.parse(readFileSync("experimental/scheduler-policy1/browser-result-summary.json", "utf8"));

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

function outputSignature(result) {
  return {
    routedEdges: result.routedEdges.map(({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId }) => ({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId })),
    relationLabels: [...result.relationLabels.entries()],
    nodeLabels: [...result.nodeLabels.entries()],
    feedbackApplied: result.feedbackApplied,
  };
}

test("all scheduler policies preserve exact Product output and complete", () => {
  const reference = compareFullVerificationWithSynchronous(input(), { maxSteps: 1000 });
  for (const policy of Object.values(schedulerPolicies)) {
    const result = runScheduledVerification(input(), { policy, maxTurns: 1000 });
    assert.equal(result.status, "completed", policy.id);
    assert.equal(result.partialResultExposed, false, policy.id);
    assert.deepEqual(outputSignature(result.result), reference.semanticResult, policy.id);
  }
});

test("batched scheduler preserves normalized diagnostic traces", () => {
  const result = compareScheduledVerificationWithSynchronous(input(), { policy: schedulerPolicies.hybridEightTwo, maxTurns: 1000 });
  assert.equal(result.semanticEquivalent, true);
  assert.equal(result.traceEquivalent, true);
});

test("batching reduces turns without changing ordered authority", () => {
  const one = runScheduledVerification(input(), { policy: schedulerPolicies.oneUnit, maxTurns: 1000 });
  const fixed = runScheduledVerification(input(), { policy: schedulerPolicies.fixedTwo, maxTurns: 1000 });
  const hybrid = runScheduledVerification(input(), { policy: schedulerPolicies.hybridEightTwo, maxTurns: 1000 });
  assert.ok(fixed.scheduledTurnCount < one.scheduledTurnCount);
  assert.ok(hybrid.scheduledTurnCount <= one.scheduledTurnCount);
  assert.ok(fixed.maxUnitsPerTurnObserved <= 2);
  assert.ok(hybrid.maxUnitsPerTurnObserved <= 2);
  assert.equal(fixed.completedWorkUnits, one.completedWorkUnits);
  assert.equal(hybrid.completedWorkUnits, one.completedWorkUnits);
});

test("cancellation is observed only at a scheduled-turn boundary and exposes no result", () => {
  const envelope = createSchedulerEnvelope(input(), { policy: schedulerPolicies.fixedTwo });
  stepScheduledTurn(envelope);
  requestSchedulerCancellation(envelope);
  stepScheduledTurn(envelope);
  assert.equal(envelope.state.status, "cancelled");
  assert.equal(envelope.state.result, null);
  assert.equal(envelope.schedulerTurns.at(-1)?.cancelObserved, true);
});

test("work-unit budget exhaustion is fail-closed", () => {
  const result = runScheduledVerification(input(), { policy: schedulerPolicies.fixedTwo, maxWorkUnits: 1, maxTurns: 1000 });
  assert.equal(result.status, "budget-exhausted");
  assert.equal(result.failureReason, "max-work-units");
  assert.equal(result.result, null);
  assert.equal(result.partialResultExposed, false);
});

test("scheduler contract separates soft wall-time yield from deterministic authority", () => {
  assert.equal(schedulerPolicyContract.authorityOrder, "unchanged-full-verification-state-machine");
  assert.equal(schedulerPolicyContract.partialProductCommit, false);
  assert.equal(schedulerPolicyContract.wallClockQuota, "soft-yield-target; current unit/batch may overshoot");
  assert.deepEqual(schedulerPolicyContract.policies.map(({ id }) => id), ["one-unit", "fixed-two", "elapsed-eight-ms", "hybrid-eight-ms-two-units"]);
});

test("source-step attribution exposes bounded authority and phase summaries", () => {
  const result = runScheduledVerification(input(), { policy: schedulerPolicies.oneUnit, maxTurns: 1000, captureDiagnostics: false });
  assert.equal(result.status, "completed");
  assert.ok(result.longestSteps.length <= 8);
  assert.ok(result.longestSteps.every(({ phase, kind, elapsedMs }) => typeof phase === "string" && typeof kind === "string" && typeof elapsedMs === "number"));
  assert.ok(Object.keys(result.phaseCostSummary).length > 0);
  assert.equal(result.phaseCostSummary["first-route"]?.workUnitCount, 4);
  assert.equal(result.phaseCostSummary.finalize?.finalizeCount, 1);
});

test("fixed browser policy evidence keeps budget closure open despite observed improvement", () => {
  assert.equal(browserSummary.controls.length, 5);
  assert.deepEqual(Object.keys(browserSummary.policies), ["one-unit", "fixed-two", "elapsed-eight-ms", "hybrid-eight-ms-two-units"]);
  assert.equal(browserSummary.policies["elapsed-eight-ms"].run1.exactAll, true);
  assert.equal(browserSummary.policies["elapsed-eight-ms"].run2.exactAll, true);
  assert.ok(browserSummary.policies["elapsed-eight-ms"].run2.completeMaxElapsedMs < browserSummary.policies["one-unit"].run2.completeMaxElapsedMs);
  assert.equal(browserSummary.disposition.productWideVerificationBudget, "NOT_ESTABLISHED");
  assert.equal(browserSummary.disposition.hard50msCeiling, "NOT_ESTABLISHED_PRODUCT_WIDE");
});
