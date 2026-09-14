import {
  completeAutomaticPresentationVerification,
  createFullVerificationState,
  deriveBoundedAutomaticPresentation,
  presentationSignature,
  requestFullVerificationCancellation,
  snapshotSignature,
  stepFullVerification,
} from "../full-verification1/prototype.mjs";

export const schedulerPolicies = Object.freeze({
  oneUnit: Object.freeze({ id: "one-unit", mode: "work-count", maxUnitsPerTurn: 1 }),
  fixedTwo: Object.freeze({ id: "fixed-two", mode: "work-count", maxUnitsPerTurn: 2 }),
  elapsedEight: Object.freeze({ id: "elapsed-eight-ms", mode: "elapsed-quota", quotaMs: 8 }),
  hybridEightTwo: Object.freeze({ id: "hybrid-eight-ms-two-units", mode: "hybrid", quotaMs: 8, maxUnitsPerTurn: 2 }),
});

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function normalizePolicy(policy = schedulerPolicies.oneUnit) {
  if (typeof policy === "string") return schedulerPolicies[policy] ?? Object.values(schedulerPolicies).find(({ id }) => id === policy) ?? schedulerPolicies.oneUnit;
  return policy;
}

export function createSchedulerEnvelope(input, options = {}) {
  return {
    ...createFullVerificationState(input, { captureDiagnostics: options.captureDiagnostics !== false }),
    policy: normalizePolicy(options.policy),
    schedulerTurns: [],
    startedAt: now(),
    cancelRequested: false,
    budget: {
      maxTurns: options.maxTurns ?? Infinity,
      maxWorkUnits: options.maxWorkUnits ?? Infinity,
      maxWallMs: options.maxWallMs ?? Infinity,
    },
  };
}

export function requestSchedulerCancellation(envelope) {
  envelope.cancelRequested = true;
  return envelope;
}

function markBudgetExhausted(envelope, reason) {
  if (envelope.state.status !== "running") return;
  envelope.state.status = "budget-exhausted";
  envelope.state.failureReason = reason;
  envelope.state.result = null;
}

function turnShouldStop(envelope, turnStartedAt, unitsThisTurn) {
  const policy = envelope.policy;
  if (policy.mode === "work-count") return unitsThisTurn >= policy.maxUnitsPerTurn;
  if (policy.mode === "elapsed-quota") return unitsThisTurn > 0 && now() - turnStartedAt >= policy.quotaMs;
  return unitsThisTurn >= policy.maxUnitsPerTurn || (unitsThisTurn > 0 && now() - turnStartedAt >= policy.quotaMs);
}

export function stepScheduledTurn(envelope) {
  if (envelope.state.status !== "running") return envelope;
  const turnStartedAt = now();
  const beforeWorkUnits = envelope.state.completedWorkUnits;
  const beforeTransitions = envelope.state.completedPhaseTransitions;
  const beforeSteps = envelope.state.scheduledStepCount;
  const beforeSlices = envelope.schedulerSlices.length;
  let unitsThisTurn = 0;

  if (envelope.cancelRequested) {
    requestFullVerificationCancellation(envelope);
    stepFullVerification(envelope);
  } else {
    while (envelope.state.status === "running") {
      if (envelope.state.completedWorkUnits >= envelope.budget.maxWorkUnits) {
        markBudgetExhausted(envelope, "max-work-units");
        break;
      }
      stepFullVerification(envelope);
      unitsThisTurn += 1;
      if (turnShouldStop(envelope, turnStartedAt, unitsThisTurn)) break;
      if (now() - envelope.startedAt >= envelope.budget.maxWallMs) {
        markBudgetExhausted(envelope, "max-wall-time");
        break;
      }
    }
  }

  const turnEndedAt = now();
  const elapsedMs = turnEndedAt - turnStartedAt;
  const sourceSteps = envelope.schedulerSlices.slice(beforeSlices).map(({ stepIndex, startedAt, endedAt, phase, kind, authority, elapsedMs: sourceStepElapsedMs }) => ({
    stepIndex,
    startedAt,
    endedAt,
    phase,
    kind,
    authority,
    elapsedMs: sourceStepElapsedMs,
  }));
  const sourceStepElapsedMs = sourceSteps.reduce((sum, { elapsedMs: stepElapsedMs }) => sum + stepElapsedMs, 0);
  envelope.schedulerTurns.push({
    turnId: envelope.schedulerTurns.length,
    startedAt: turnStartedAt,
    endedAt: turnEndedAt,
    phase: envelope.state.steps[beforeSteps]?.phase ?? envelope.state.phase,
    elapsedMs,
    sourceStepCount: sourceSteps.length,
    sourceSteps,
    sourceStepElapsedMs,
    schedulerGapMs: Math.max(0, elapsedMs - sourceStepElapsedMs),
    workUnits: envelope.state.completedWorkUnits - beforeWorkUnits,
    phaseTransitions: envelope.state.completedPhaseTransitions - beforeTransitions,
    cancelObserved: envelope.state.status === "cancelled",
  });
  return envelope;
}

export function runScheduledVerification(input, options = {}) {
  const envelope = createSchedulerEnvelope(input, options);
  while (envelope.state.status === "running") {
    if (envelope.schedulerTurns.length >= envelope.budget.maxTurns) {
      markBudgetExhausted(envelope, "max-scheduled-turns");
      break;
    }
    stepScheduledTurn(envelope);
  }
  return summarizeScheduledVerification(envelope);
}

export function summarizeScheduledVerification(envelope) {
  const state = envelope.state;
  const turns = [...envelope.schedulerTurns];
  const steps = state.steps.map((step, index) => ({
    index,
    phase: step.phase,
    kind: step.kind,
    elapsedMs: step.elapsedMs,
    completedWorkUnits: step.completedWorkUnits,
    completedPhaseTransitions: step.completedPhaseTransitions,
  }));
  const phaseCostSummary = Object.fromEntries([...new Set(steps.map(({ phase }) => phase))].map((phase) => {
    const phaseSteps = steps.filter((step) => step.phase === phase);
    return [phase, {
      count: phaseSteps.length,
      workUnitCount: phaseSteps.filter(({ kind }) => kind === "work-unit").length,
      phaseTransitionCount: phaseSteps.filter(({ kind }) => kind === "phase-transition").length,
      finalizeCount: phaseSteps.filter(({ kind }) => kind === "finalize").length,
      maxMs: Math.max(...phaseSteps.map(({ elapsedMs }) => elapsedMs), 0),
      totalMs: phaseSteps.reduce((sum, { elapsedMs }) => sum + elapsedMs, 0),
    }];
  }));
  return {
    status: state.status,
    result: state.result,
    semanticResult: state.result ? presentationSignature(state.result) : null,
    initializationMs: state.initializationMs,
    scheduledStepCount: state.scheduledStepCount,
    completedWorkUnits: state.completedWorkUnits,
    completedPhaseTransitions: state.completedPhaseTransitions,
    scheduledTurnCount: turns.length,
    maxTurnMs: Math.max(...turns.map(({ elapsedMs }) => elapsedMs), 0),
    totalTurnComputeMs: turns.reduce((sum, { elapsedMs }) => sum + elapsedMs, 0),
    maxUnitsPerTurnObserved: Math.max(...turns.map(({ workUnits }) => workUnits), 0),
    maxWorkUnitMs: Math.max(...state.steps.filter(({ kind }) => kind === "work-unit").map(({ elapsedMs }) => elapsedMs), 0),
    maxPhaseTransitionMs: Math.max(...state.steps.filter(({ kind }) => kind === "phase-transition").map(({ elapsedMs }) => elapsedMs), 0),
    longestSteps: [...steps].sort((left, right) => right.elapsedMs - left.elapsedMs).slice(0, 8),
    phaseCostSummary,
    turns,
    partialResultExposed: state.status !== "completed" && state.result !== null,
    feedbackApplied: state.feedbackApplied,
    failureReason: state.failureReason ?? null,
    traces: envelope.traces,
  };
}

function normalizedTraces(traces) {
  return {
    routeDecisions: traces.routeDecisions,
    routeTraces: traces.routeTraces,
    relationLabelTraces: traces.relationLabelTraces,
    nodeLabelTraces: traces.nodeLabelTraces,
    dependencies: traces.dependencies.map(({ stage, pass, input, output }) => ({
      stage,
      pass,
      input: { serialized: input.serialized, digest: input.digest, characterLength: input.characterLength },
      output: { serialized: output.serialized, digest: output.digest, characterLength: output.characterLength },
    })),
    passSnapshots: traces.passSnapshots,
  };
}

export function tracesEquivalent(left, right) {
  return JSON.stringify(normalizedTraces(left)) === JSON.stringify(normalizedTraces(right));
}

export function compareScheduledVerificationWithSynchronous(input, options = {}) {
  const scheduled = runScheduledVerification(input, { ...options, captureDiagnostics: true });
  const referenceTraces = { routeDecisions: [], routeTraces: [], relationLabelTraces: [], nodeLabelTraces: [], dependencies: [], passSnapshots: [] };
  const reference = deriveBoundedAutomaticPresentation({
    ...input,
    routeDecisionSink: (value) => referenceTraces.routeDecisions.push(value),
    routeTraceSink: (value) => referenceTraces.routeTraces.push(value),
    relationLabelTraceSink: (value) => referenceTraces.relationLabelTraces.push(value),
    presentationDependencySink: (value) => referenceTraces.dependencies.push(value),
    presentationPassSink: (value) => referenceTraces.passSnapshots.push(snapshotSignature(value)),
    profiler: undefined,
  });
  return {
    ...scheduled,
    semanticEquivalent: scheduled.status === "completed" && JSON.stringify(scheduled.semanticResult) === JSON.stringify(presentationSignature(reference)),
    traceEquivalent: tracesEquivalent(scheduled.traces, referenceTraces),
  };
}

export function completeScheduledVerification(envelope) {
  if (envelope.state.status !== "completed") throw new Error(`Cannot complete scheduler state: ${envelope.state.status}`);
  return completeAutomaticPresentationVerification(envelope.state);
}

export const schedulerPolicyContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-SCHEDULER-POLICY-STUDY-v1",
  policies: Object.values(schedulerPolicies),
  authorityOrder: "unchanged-full-verification-state-machine",
  partialProductCommit: false,
  budgetExhaustion: "fail-closed-at-turn-boundary",
  cancellation: "observed-before-next-scheduled-turn",
  wallClockQuota: "soft-yield-target; current unit/batch may overshoot",
  workerDecision: "not-decided-by-this-checkpoint",
});
