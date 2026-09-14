import assert from "node:assert/strict";
import test from "node:test";
import {
  beginProvider,
  createProviderState,
  providerEnvelope,
  providerExecutionContract,
  requestProviderCancellation,
  runProvider,
  stepProvider,
} from "../experimental/production-shaped-quality-provider1/contract.mjs";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    datasetIdentity: "dataset-1",
    datasetRevision: 1,
    graphFingerprint: "graph-1",
    sessionPositions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 150 } },
    storedCoordinateFingerprint: "stored-none",
    adoptedCoordinateFingerprint: "adopted-none",
    coordinateOwnership: { a: "derived", b: "derived", c: "derived" },
    manualRelationRouteFingerprint: "routes-1",
    manualSelfLoopFingerprint: "loops-1",
    manualRelationLabelFingerprint: "labels-1",
    manualNodeLabelFingerprint: "node-labels-1",
    locale: "en",
    algorithmVersion: "provider-test-v1",
    budgetPolicy: { maxWorkUnits: 100 },
    ...overrides,
  };
}

function candidates() {
  return [
    { family: "structural-native-v3", fingerprint: "a", positions: { a: { x: 10, y: 10 }, b: { x: 210, y: 10 }, c: { x: 110, y: 160 } }, cheapFeatures: { crossings: 0, separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 0, angularPressure: 0, extentDiagonal: 1 } },
    { family: "frontier-adaptive-12", fingerprint: "b", positions: { a: { x: 20, y: 20 }, b: { x: 220, y: 20 }, c: { x: 120, y: 170 } }, cheapFeatures: { crossings: 0, separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 0, angularPressure: 0, extentDiagonal: 2 } },
    { family: "discrete-feasibility-first", fingerprint: "c", positions: { a: { x: 30, y: 30 }, b: { x: 230, y: 30 }, c: { x: 130, y: 180 } }, cheapFeatures: { crossings: 1, separationDeficit: 1, labelSpanDeficit: 1, coarseCorridorPressure: 1, angularPressure: 1, extentDiagonal: 3 } },
    { family: "control", fingerprint: "d", positions: { a: { x: 40, y: 40 }, b: { x: 240, y: 40 }, c: { x: 140, y: 190 } }, cheapFeatures: { crossings: 2, separationDeficit: 2, labelSpanDeficit: 2, coarseCorridorPressure: 2, angularPressure: 2, extentDiagonal: 4 } },
  ];
}

function started(input = snapshot()) {
  const state = beginProvider(createProviderState(), input);
  return { input, state, envelope: providerEnvelope(state)! };
}

test("provider contract keeps proposal execution separate from Product authority", () => {
  assert.deepEqual(providerExecutionContract.phases, ["candidate-generation", "cheap-screen", "product-verification", "final-selection"]);
  assert.match(providerExecutionContract.authority, /Product presentation remains authoritative/);
  assert.match(providerExecutionContract.persistence, /never mutates Dataset/);
});

test("normal K plus boundary completion verifies every selected finalist before exposing a result", () => {
  const current = started();
  const result = runProvider(current.state, current.envelope, {
    generateCandidates: () => candidates(),
    verifyCandidate: (candidate) => ({ status: "completed", product: { score: candidate.fingerprint === "a" ? 0 : 1 }, telemetry: { source: "test" } }),
  }, { currentSnapshot: current.input, normalK: 2 });
  assert.equal(result.lastOutcome?.status, "completed");
  assert.equal(result.lastOutcome?.result?.finalistCount, 2);
  assert.equal(result.lastOutcome?.result?.fingerprint, "a");
  assert.equal(result.lastOutcome?.result?.boundaryClassCount, 0);
  assert.equal(result.lastOutcome?.result?.workUnits, 6);
});

test("Product verification failure fails closed without exposing a partial candidate", () => {
  const current = started();
  const result = runProvider(current.state, current.envelope, {
    generateCandidates: () => candidates(),
    verifyCandidate: () => ({ status: "failed", telemetry: { source: "test" } }),
  }, { currentSnapshot: current.input, normalK: 2 });
  assert.equal(result.lastOutcome?.status, "failed");
  assert.equal(result.lastOutcome?.result, null);
});

test("cancellation, stale envelopes, and budget exhaustion expose no result", () => {
  const current = started();
  const cancelled = stepProvider(requestProviderCancellation(current.state), current.envelope, { generateCandidates: () => candidates(), verifyCandidate: () => ({ status: "completed", product: { score: 0 } }) }, { currentSnapshot: current.input });
  assert.equal(cancelled.lastOutcome?.status, "cancelled");
  assert.equal(cancelled.lastOutcome?.result, null);

  const stale = stepProvider(current.state, { ...current.envelope, operationId: current.envelope.operationId + 1 }, { generateCandidates: () => candidates(), verifyCandidate: () => ({ status: "completed", product: { score: 0 } }) }, { currentSnapshot: current.input });
  assert.equal(stale.lastOutcome?.status, "stale");
  assert.equal(stale.lastOutcome?.result, undefined);

  const exhausted = stepProvider(current.state, current.envelope, { generateCandidates: () => candidates(), verifyCandidate: () => ({ status: "completed", product: { score: 0 } }) }, { currentSnapshot: current.input, maxWorkUnits: 0 });
  assert.equal(exhausted.lastOutcome?.status, "budget-exhausted");
  assert.equal(exhausted.lastOutcome?.result, null);
});

test("changed semantic input stales the operation before Product verification", () => {
  const current = started();
  const changed = { ...current.input, locale: "ja" };
  const stale = stepProvider(current.state, current.envelope, { generateCandidates: () => candidates(), verifyCandidate: () => ({ status: "completed", product: { score: 0 } }) }, { currentSnapshot: changed });
  assert.equal(stale.lastOutcome?.status, "stale");
  assert.equal(stale.lastOutcome?.reason, "input-changed");
});
