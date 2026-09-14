import {
  completeAutomaticNodeLabelPlacement,
  createAutomaticPresentationProfiler,
  deriveAutomaticNodeLabels,
  initializeAutomaticNodeLabelPlacement,
  stepAutomaticNodeLabelPlacement,
} from "../../src/graph-presentation.ts";

function labelSignature(labels) {
  return [...labels.entries()];
}

export function createNodeLabelAccumulator(input) {
  return initializeAutomaticNodeLabelPlacement(input);
}

export function stepNodeLabelAccumulator(state) {
  const startedAt = performance.now();
  const result = stepAutomaticNodeLabelPlacement(state);
  return {
    ...result,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    acceptedPrefixLength: state.acceptedNodeLabels.length,
    occupiedSequenceLength: state.occupiedLabels.length,
  };
}

export function completeNodeLabelAccumulator(state) {
  return completeAutomaticNodeLabelPlacement(state);
}

export function runNodeLabelAccumulator(input, { maxStepMs = 50, maxSteps = Number.POSITIVE_INFINITY } = {}) {
  const pass = input.pass ?? "first";
  const profiler = createAutomaticPresentationProfiler();
  const profile = profiler.passes[pass].nodeLabel;
  const initializeStartedAt = performance.now();
  const state = createNodeLabelAccumulator({ ...input, profile });
  const initializeMs = Number((performance.now() - initializeStartedAt).toFixed(3));
  const steps = [];
  while (!state.done && steps.length < maxSteps) steps.push(stepNodeLabelAccumulator(state));
  const budgetExhausted = !state.done;
  const labels = state.done ? completeNodeLabelAccumulator(state) : null;
  return {
    status: budgetExhausted ? "budget-exhausted" : "completed",
    labels,
    initializeMs,
    initializeOverBudget: initializeMs > maxStepMs,
    steps,
    maxStepMs: Math.max(...steps.map(({ elapsedMs }) => elapsedMs), 0),
    overBudgetSteps: steps.filter(({ elapsedMs }) => elapsedMs > maxStepMs).map(({ nodeId }) => nodeId),
    acceptedPrefixLength: state.acceptedNodeLabels.length,
    initialRelationLabelCount: state.initialRelationLabels.length,
    orderedNodeCount: state.orderedNodes.length,
    edgePathCount: state.edgePaths.length,
    yieldingRouteCount: state.input.yieldingRoutes.length,
    pathBoundsBuildCount: profile.pathBoundsBuildCount,
    pathBoundsPointVisits: profile.pathBoundsPointVisits,
    candidateEvaluations: profile.candidateEvaluations,
    occupiedLabelChecks: profile.occupiedLabelChecks,
    otherNodeChecks: profile.otherNodeChecks,
    edgePathPointChecks: profile.edgePathPointChecks,
    yieldingRoutePointChecks: profile.yieldingRoutePointChecks,
    pathBroadPhaseRejects: profile.pathBroadPhaseRejects,
    yieldingRouteBroadPhaseRejects: profile.yieldingRouteBroadPhaseRejects,
    previousPlacementEvaluations: profile.previousPlacementEvaluations,
    state,
  };
}

export function compareNodeLabelAccumulatorWithSynchronous(input, options = {}) {
  const incrementalTrace = [];
  const synchronousTrace = [];
  const incremental = runNodeLabelAccumulator({
    ...input,
    placementTraceSink: (trace) => incrementalTrace.push(trace),
  }, options);
  const synchronous = deriveAutomaticNodeLabels({
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

export const nodeLabelAccumulatorContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-NODE-LABEL-ACCUMULATOR-v1",
  immutablePrecomputation: ["input-order Node list", "current positions", "initial Relation-label occupancy", "complete edge path set", "edge path bounds", "complete yielding-route set", "yielding-route bounds"],
  mutableState: ["current Node index", "initial Relation-label prefix plus accepted Node-label prefix", "accepted Node-label map", "diagnostic/profile state"],
  workUnit: "one input-order Node-label decision",
  manualOffsetAuthority: "apply current manual offset after automatic placement, unchanged",
  activeDragAuthority: "suppress previous placement reuse only for the actively dragged Node, unchanged",
  partialProductCommit: false,
  datasetMutation: false,
  authorityMigration: false,
});
