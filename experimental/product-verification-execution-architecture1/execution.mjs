import { requestProviderCancellation, stepProvider } from "../production-shaped-quality-provider1/contract.mjs";

function now() { return typeof performance === "undefined" ? Date.now() : performance.now(); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function snapshotIdentity(snapshot) {
  if (!snapshot) return null;
  const { viewportFingerprint: _viewport, readOnlySelectionFingerprint: _selection, ...semantic } = snapshot;
  return stable(semantic);
}
function failClosed(execution, status, reason) {
  const operationId = execution.providerState.active?.operationId ?? execution.envelope?.operationId ?? null;
  execution.providerState = { ...execution.providerState, active: null, lastOutcome: { operationId, status, reason, result: null } };
  execution.verification = null;
  return execution;
}

export function createProductVerificationExecution(providerState, envelope, options = {}) {
  return {
    providerState,
    envelope,
    verification: null,
    candidateFingerprint: null,
    startedAt: now(),
    sourceStepCount: 0,
    slices: [],
    maxSourceSteps: options.maxSourceSteps ?? 100_000,
    maxWallMs: options.maxWallMs ?? Number.POSITIVE_INFINITY,
  };
}

export function requestProductVerificationExecutionCancellation(execution) {
  execution.providerState = requestProviderCancellation(execution.providerState);
  return execution;
}

export function stepProductVerificationExecution(execution, dependencies, options = {}) {
  const active = execution.providerState.active;
  if (!active) return execution;
  const startedAt = now();
  let kind = `provider-${active.phase}`;
  if (active.cancelRequested) {
    execution.providerState = stepProvider(execution.providerState, execution.envelope, { generateCandidates: () => [], verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: options.currentSnapshot, normalK: options.normalK, maxWorkUnits: options.maxWorkUnits });
    execution.verification = null;
  } else if (snapshotIdentity(options.currentSnapshot ?? active.snapshot) !== active.snapshotIdentity) {
    failClosed(execution, "stale", "input-changed");
  } else if (execution.sourceStepCount >= execution.maxSourceSteps) {
    failClosed(execution, "budget-exhausted", "max-source-steps");
  } else if (now() - execution.startedAt >= execution.maxWallMs) {
    failClosed(execution, "budget-exhausted", "max-wall-time");
  } else if (active.phase !== "product-verification") {
    execution.providerState = stepProvider(execution.providerState, execution.envelope, dependencies, { currentSnapshot: options.currentSnapshot, normalK: options.normalK, maxWorkUnits: options.maxWorkUnits });
  } else if (active.cursor >= active.finalists.length) {
    execution.providerState = stepProvider(execution.providerState, execution.envelope, { ...dependencies, verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: options.currentSnapshot, normalK: options.normalK, maxWorkUnits: options.maxWorkUnits });
  } else {
    const candidate = active.finalists[active.cursor];
    if (!execution.verification || execution.candidateFingerprint !== candidate.fingerprint) {
      kind = "candidate-verification-initialize";
      execution.verification = dependencies.initializeVerification(candidate, active.snapshot);
      execution.candidateFingerprint = candidate.fingerprint;
      if (!execution.verification || execution.verification.status !== "running") failClosed(execution, "failed", "verification-initialization-failed");
    } else {
      kind = `candidate-verification-${execution.verification.phase ?? "work-unit"}`;
      dependencies.stepVerification(execution.verification);
      execution.sourceStepCount += 1;
      if (execution.verification.status === "completed") {
        const completed = dependencies.completeVerification(execution.verification, candidate, active.snapshot);
        execution.providerState = stepProvider(execution.providerState, execution.envelope, { ...dependencies, verifyCandidate: () => completed }, { currentSnapshot: options.currentSnapshot, normalK: options.normalK, maxWorkUnits: options.maxWorkUnits });
        execution.verification = null;
        execution.candidateFingerprint = null;
      } else if (execution.verification.status !== "running") {
        failClosed(execution, "failed", execution.verification.failureReason ?? `verification-${execution.verification.status}`);
      }
    }
  }
  execution.slices.push({ kind, elapsedMs: now() - startedAt, sourceStepCount: execution.sourceStepCount });
  return execution;
}

export const productVerificationExecutionContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-VERIFICATION-EXECUTION-ARCHITECTURE-v1",
  selectedArchitecture: "main-thread-resumable-product-verification",
  sourceUnit: "one current Product route, Relation-label, Node-label, phase-transition, or finalization step",
  scheduling: "one source unit per event-loop turn in the browser diagnostic",
  cancellation: "observed before the next source unit; no partial Product result is exposed",
  budgets: ["provider work units", "verification source steps", "wall time"],
  authority: "current Product accumulators and final Product metric selection remain authoritative",
  worker: "deferred unless source-faithful main-thread resumability fails the measured responsiveness boundary",
});
