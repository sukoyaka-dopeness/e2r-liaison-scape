import assert from "node:assert/strict";
import test from "node:test";
import { beginProvider, createProviderState, providerEnvelope } from "../experimental/production-shaped-quality-provider1/contract.mjs";
import { createProductVerificationExecution, productVerificationExecutionContract, requestProductVerificationExecutionCancellation, stepProductVerificationExecution } from "../experimental/product-verification-execution-architecture1/execution.mjs";
import { createWorkerVerificationJob, validateWorkerVerificationMessage, workerVerificationContract } from "../experimental/product-verification-execution-architecture1/worker-protocol.mjs";

const snapshot = { datasetIdentity: "d", datasetRevision: 1, graphFingerprint: "g", sessionPositions: { a: { x: 0, y: 0 } }, algorithmVersion: "v1", budgetPolicy: { maxWorkUnits: 100 } };
const candidates = [
  { family: "a", fingerprint: "a", positions: { a: { x: 1, y: 1 } }, cheapFeatures: { crossings: 0, separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 0, angularPressure: 0, extentDiagonal: 1 } },
  { family: "b", fingerprint: "b", positions: { a: { x: 2, y: 2 } }, cheapFeatures: { crossings: 1, separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 0, angularPressure: 0, extentDiagonal: 2 } },
];
function start(options = {}) { const state = beginProvider(createProviderState(), snapshot); return createProductVerificationExecution(state, providerEnvelope(state), options); }
function dependencies(fail = false) { return { generateCandidates: () => candidates, initializeVerification: () => ({ status: "running", phase: "route", count: 0 }), stepVerification: (state: any) => { state.count += 1; state.status = fail ? "verification-failed" : state.count >= 2 ? "completed" : "running"; }, completeVerification: (_state: any, candidate: any) => ({ status: "completed", product: { score: candidate.fingerprint === "b" ? 0 : 1 } }) }; }
function drain(execution: any, deps = dependencies()) { for (let turn = 0; execution.providerState.active && turn < 100; turn += 1) stepProductVerificationExecution(execution, deps, { currentSnapshot: snapshot, normalK: 2, maxWorkUnits: 100 }); return execution; }

test("architecture reuses source work units without moving Product authority", () => {
  assert.equal(productVerificationExecutionContract.executorUnderComparison, "main-thread-resumable-product-verification");
  assert.equal(productVerificationExecutionContract.checkpointSelectedArchitecture, "worker-product-verification-main-thread-selection");
  assert.match(productVerificationExecutionContract.authority, /Product accumulators/);
  const result = drain(start());
  assert.equal(result.providerState.lastOutcome?.status, "completed");
  assert.equal(result.providerState.lastOutcome?.result?.fingerprint, "b");
  assert.equal(result.sourceStepCount, 4);
});

test("cancellation is observed before another source unit and exposes no result", () => {
  const execution = start();
  stepProductVerificationExecution(execution, dependencies(), { currentSnapshot: snapshot, normalK: 2 });
  stepProductVerificationExecution(execution, dependencies(), { currentSnapshot: snapshot, normalK: 2 });
  requestProductVerificationExecutionCancellation(execution);
  const before = execution.sourceStepCount;
  stepProductVerificationExecution(execution, dependencies(), { currentSnapshot: snapshot, normalK: 2 });
  assert.equal(execution.sourceStepCount, before);
  assert.equal(execution.providerState.lastOutcome?.status, "cancelled");
  assert.equal(execution.providerState.lastOutcome?.result, null);
});

test("source-step and wall budgets fail closed", () => {
  const exhausted = drain(start({ maxSourceSteps: 1 }));
  assert.equal(exhausted.providerState.lastOutcome?.status, "budget-exhausted");
  assert.equal(exhausted.providerState.lastOutcome?.result, null);
  const wall = start({ maxWallMs: -1 });
  stepProductVerificationExecution(wall, dependencies(), { currentSnapshot: snapshot });
  assert.equal(wall.providerState.lastOutcome?.status, "budget-exhausted");
});

test("verification failure and changed input fail closed", () => {
  const failed = drain(start(), dependencies(true));
  assert.equal(failed.providerState.lastOutcome?.status, "failed");
  assert.equal(failed.providerState.lastOutcome?.result, null);
  const stale = start();
  stepProductVerificationExecution(stale, dependencies(), { currentSnapshot: { ...snapshot, graphFingerprint: "changed" } });
  assert.equal(stale.providerState.lastOutcome?.status, "stale");
  assert.equal(stale.providerState.lastOutcome?.result, null);
});

test("Worker messages are accepted only for the exact operation, snapshot, and candidate", () => {
  const state = beginProvider(createProviderState(), snapshot); const envelope = providerEnvelope(state)!; const candidate = candidates[0]!;
  const job = createWorkerVerificationJob(envelope, candidate, { graph: "payload" });
  const message = { ...job, status: "completed", product: { score: 1 }, signature: "exact" };
  assert.equal(workerVerificationContract.transport.includes("structured-clone"), true);
  assert.equal(validateWorkerVerificationMessage(envelope, candidate, message), true);
  assert.equal(validateWorkerVerificationMessage(envelope, candidate, { ...message, generation: message.generation + 1 }), false);
  assert.equal(validateWorkerVerificationMessage(envelope, { ...candidate, fingerprint: "other" }, message), false);
  assert.equal(validateWorkerVerificationMessage(envelope, candidate, { ...message, status: "failed" }), false);
});
