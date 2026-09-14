import {
  completeAutomaticPresentationVerification,
  deriveBoundedAutomaticPresentation,
  initializeAutomaticPresentationVerification,
  requestAutomaticPresentationVerificationCancellation,
  stepAutomaticPresentationVerification,
} from "../../src/graph-presentation.ts";

export function presentationSignature(result) {
  if (!result) return null;
  return {
    routedEdges: result.routedEdges.map(({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId }) => ({
      id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId,
    })),
    relationLabels: [...result.relationLabels.entries()],
    nodeLabels: [...result.nodeLabels.entries()],
    feedbackApplied: result.feedbackApplied,
  };
}

export function snapshotSignature(snapshot) {
  if (!snapshot) return null;
  return {
    pass: snapshot.route.pass,
    routes: presentationSignature({ routedEdges: snapshot.route.routes, relationLabels: new Map(), nodeLabels: new Map(), feedbackApplied: false }).routedEdges,
    relationLabels: [...snapshot.relationLabel.labels.entries()],
    nodeLabels: [...snapshot.nodeLabel.labels.entries()],
    yieldingRoutes: snapshot.nodeLabel.yieldingRoutes,
  };
}

function traceInput(input, traces, captureDiagnostics = true) {
  return {
    ...input,
    routeDecisionSink: captureDiagnostics ? (value) => traces.routeDecisions.push(value) : undefined,
    routeTraceSink: captureDiagnostics ? (value) => traces.routeTraces.push(value) : undefined,
    relationLabelTraceSink: captureDiagnostics ? (value) => traces.relationLabelTraces.push(value) : undefined,
    presentationDependencySink: captureDiagnostics ? (value) => traces.dependencies.push(value) : undefined,
    presentationPassSink: captureDiagnostics ? (value) => traces.passSnapshots.push(snapshotSignature(value)) : undefined,
    profiler: undefined,
  };
}

function createTraces() {
  return {
    routeDecisions: [],
    routeTraces: [],
    relationLabelTraces: [],
    nodeLabelTraces: [],
    dependencies: [],
    passSnapshots: [],
  };
}

export function createFullVerificationState(input, options = {}) {
  const traces = createTraces();
  const state = initializeAutomaticPresentationVerification(traceInput(input, traces, options.captureDiagnostics !== false));
  return { state, traces, schedulerSlices: [] };
}

export function requestFullVerificationCancellation(envelope) {
  requestAutomaticPresentationVerificationCancellation(envelope.state);
  return envelope;
}

export function stepFullVerification(envelope) {
  const before = envelope.state.scheduledStepCount;
  const startedAt = performance.now();
  stepAutomaticPresentationVerification(envelope.state);
  const endedAt = performance.now();
  const elapsedMs = endedAt - startedAt;
  const newSteps = envelope.state.steps.slice(before);
  envelope.schedulerSlices.push({
    stepIndex: before,
    startedAt,
    endedAt,
    phase: newSteps[0]?.phase ?? envelope.state.phase,
    kind: newSteps[0]?.kind ?? "cancellation-check",
    authority: sourceStepAuthority(newSteps[0]?.phase, newSteps[0]?.kind),
    elapsedMs,
    completedWorkUnits: envelope.state.completedWorkUnits,
    completedPhaseTransitions: envelope.state.completedPhaseTransitions,
  });
  return envelope;
}

function sourceStepAuthority(phase, kind) {
  if (kind !== "work-unit") return "orchestration";
  if (phase === "label-free-route" || phase === "first-route" || phase === "feedback-route") return "Route";
  if (phase === "first-relation-label" || phase === "feedback-relation-label") return "Relation-label";
  if (phase === "first-node-label" || phase === "feedback-node-label") return "Node-label";
  return "orchestration";
}

export function runFullVerification(input, options = {}) {
  const envelope = {
    ...createFullVerificationState(input),
    schedulerSlices: [],
  };
  const maxSteps = options.maxSteps ?? 100000;
  const cancelAtStep = options.cancelAtStep;
  while (envelope.state.status === "running" && envelope.state.scheduledStepCount < maxSteps) {
    if (cancelAtStep !== undefined && envelope.state.scheduledStepCount >= cancelAtStep) requestFullVerificationCancellation(envelope);
    stepFullVerification(envelope);
  }
  if (envelope.state.status === "running") envelope.state.status = "budget-exhausted";
  return summarizeEnvelope(envelope);
}

function summarizeEnvelope(envelope) {
  const state = envelope.state;
  return {
    status: state.status,
    result: state.result,
    semanticResult: state.result ? presentationSignature(state.result) : null,
    initializationMs: state.initializationMs,
    steps: [...state.steps],
    schedulerSlices: [...envelope.schedulerSlices],
    scheduledStepCount: state.scheduledStepCount,
    completedWorkUnits: state.completedWorkUnits,
    completedPhaseTransitions: state.completedPhaseTransitions,
    maxWorkUnitMs: Math.max(...state.steps.filter(({ kind }) => kind === "work-unit").map(({ elapsedMs }) => elapsedMs), 0),
    maxScheduledSliceMs: Math.max(...envelope.schedulerSlices.map(({ elapsedMs }) => elapsedMs), 0),
    totalVerificationMs: envelope.schedulerSlices.reduce((sum, { elapsedMs }) => sum + elapsedMs, 0),
    partialResultExposed: state.status !== "completed" && state.result !== null,
    feedbackApplied: state.feedbackApplied,
    failureReason: state.failureReason ?? null,
    traces: envelope.traces,
  };
}

export function compareFullVerificationWithSynchronous(input, options = {}) {
  const full = runFullVerification(input, options);
  const referenceTraces = createTraces();
  const referenceInput = traceInput(input, referenceTraces);
  const reference = deriveBoundedAutomaticPresentation(referenceInput);
  const referenceSignature = presentationSignature(reference);
  const normalizeTraces = (traces) => ({
    routeDecisions: traces.routeDecisions,
    routeTraces: traces.routeTraces,
    relationLabelTraces: traces.relationLabelTraces,
    nodeLabelTraces: traces.nodeLabelTraces,
    dependencies: traces.dependencies.map(({ stage, pass, input: dependencyInput, output }) => ({
      stage,
      pass,
      input: { serialized: dependencyInput.serialized, digest: dependencyInput.digest, characterLength: dependencyInput.characterLength },
      output: { serialized: output.serialized, digest: output.digest, characterLength: output.characterLength },
    })),
    passSnapshots: traces.passSnapshots,
  });
  const traceEquivalent = JSON.stringify(normalizeTraces(full.traces)) === JSON.stringify(normalizeTraces(referenceTraces));
  return {
    ...full,
    semanticEquivalent: full.status === "completed" && JSON.stringify(full.semanticResult) === JSON.stringify(referenceSignature),
    traceEquivalent,
    reference,
    referenceSignature,
    referenceTraces,
  };
}

export const fullVerificationExecutionContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-FULL-VERIFICATION-RESUMABLE-v1",
  phaseOrder: [
    "label-free-route",
    "first-route",
    "first-relation-label",
    "first-node-label",
    "feedback-decision",
    "feedback-route",
    "feedback-relation-label",
    "feedback-node-label",
    "finalize",
  ],
  naturalWorkUnits: {
    route: "one canonical ordered edge",
    relationLabel: "one ordered routed edge",
    nodeLabel: "one input-order Node",
  },
  partialProductCommit: false,
  datasetMutation: false,
  authorityMigration: false,
  workerDecision: "not-decided-by-this-checkpoint",
});

export { completeAutomaticPresentationVerification, deriveBoundedAutomaticPresentation };
