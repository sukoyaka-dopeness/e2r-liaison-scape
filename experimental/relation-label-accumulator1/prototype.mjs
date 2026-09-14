import {
  completeAutomaticRelationLabelPlacement,
  createAutomaticPresentationProfiler,
  deriveAutomaticRelationLabels,
  initializeAutomaticRelationLabelPlacement,
  stepAutomaticRelationLabelPlacement,
} from "../../src/graph-presentation.ts";

function labelSignature(labels) {
  return [...labels.entries()];
}

export function createRelationLabelAccumulator(input) {
  return initializeAutomaticRelationLabelPlacement(input);
}

export function stepRelationLabelAccumulator(state) {
  const startedAt = performance.now();
  const result = stepAutomaticRelationLabelPlacement(state);
  return {
    ...result,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    acceptedPrefixLength: state.occupiedLabels.length,
  };
}

export function completeRelationLabelAccumulator(state) {
  return completeAutomaticRelationLabelPlacement(state);
}

export function runRelationLabelAccumulator(input, { maxStepMs = 50, maxSteps = Number.POSITIVE_INFINITY } = {}) {
  const pass = input.pass ?? "first";
  const profiler = createAutomaticPresentationProfiler();
  const profile = profiler.passes[pass].relationLabel;
  const initializeStartedAt = performance.now();
  const state = createRelationLabelAccumulator({ ...input, profile });
  const initializeMs = Number((performance.now() - initializeStartedAt).toFixed(3));
  const steps = [];
  while (!state.done && steps.length < maxSteps) steps.push(stepRelationLabelAccumulator(state));
  const budgetExhausted = !state.done;
  const labels = state.done ? completeRelationLabelAccumulator(state) : null;
  return {
    status: budgetExhausted ? "budget-exhausted" : "completed",
    labels,
    initializeMs,
    initializeOverBudget: initializeMs > maxStepMs,
    steps,
    maxStepMs: Math.max(...steps.map(({ elapsedMs }) => elapsedMs), 0),
    overBudgetSteps: steps.filter(({ elapsedMs }) => elapsedMs > maxStepMs).map(({ relationId }) => relationId),
    acceptedPrefixLength: state.occupiedLabels.length,
    orderedEdgeCount: state.orderedEdges.length,
    labelledEdgeCount: state.orderedEdges.filter(({ label }) => Boolean(label)).length,
    pathBoundsBuildCount: profile.pathBoundsBuildCount,
    pathBoundsPointVisits: profile.pathBoundsPointVisits,
    candidateEvaluations: profile.candidateEvaluations,
    occupiedLabelChecks: profile.occupiedLabelChecks,
    edgePathPointChecks: profile.edgePathPointChecks,
    pathBroadPhaseRejects: profile.pathBroadPhaseRejects,
    manualAnchorReconstructions: profile.manualAnchorReconstructions,
    state,
  };
}

export function compareRelationLabelAccumulatorWithSynchronous(input, options = {}) {
  const incrementalTrace = [];
  const synchronousTrace = [];
  const incremental = runRelationLabelAccumulator({
    ...input,
    placementTraceSink: (trace) => incrementalTrace.push(trace),
  }, options);
  const synchronous = deriveAutomaticRelationLabels({
    ...input,
    placementTraceSink: (trace) => synchronousTrace.push(trace),
  });
  return {
    ...incremental,
    semanticEquivalent: incremental.status === "completed"
      && JSON.stringify(labelSignature(incremental.labels)) === JSON.stringify(labelSignature(synchronous)),
    traceEquivalent: JSON.stringify(incrementalTrace) === JSON.stringify(synchronousTrace),
    synchronous,
    incrementalTrace,
    synchronousTrace,
  };
}

export const relationLabelAccumulatorContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-RELATION-LABEL-ACCUMULATOR-v1",
  immutablePrecomputation: ["ordered routed-edge list", "node point snapshot", "route/path bounds cache", "label and route geometry input"],
  mutableState: ["current routed-edge index", "occupied Relation-label prefix", "accepted placement map", "diagnostic/profile state"],
  workUnit: "one ordered routed-edge Relation-label decision, including empty-label no-op",
  manualAnchorAuthority: "reconstruct current manual anchor after automatic placement, unchanged",
  partialProductCommit: false,
  datasetMutation: false,
  authorityMigration: false,
});
