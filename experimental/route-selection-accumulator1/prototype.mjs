import {
  completeAutomaticRouteSelection,
  deriveAutomaticRoutes,
  initializeAutomaticRouteSelection,
  stepAutomaticRouteSelection,
} from "../../src/graph-presentation.ts";

function routeSignature(routes) {
  return routes.map(({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId }) => ({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId }));
}

export function createRouteAccumulator(input) {
  return initializeAutomaticRouteSelection(input);
}

export function stepRouteAccumulator(state) {
  const startedAt = performance.now();
  const result = stepAutomaticRouteSelection(state);
  return { ...result, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), acceptedPrefixLength: state.occupiedPaths.length };
}

export function completeRouteAccumulator(state) {
  return completeAutomaticRouteSelection(state);
}

export function runRouteAccumulator(input, { maxStepMs = 50, maxSteps = Number.POSITIVE_INFINITY } = {}) {
  const candidateCounts = new Map();
  const originalSink = input.routeDecisionSink;
  const initializeStartedAt = performance.now();
  const state = createRouteAccumulator({
    ...input,
    routeDecisionSink: (decision) => {
      candidateCounts.set(decision.edgeId, decision.candidateDiagnostics.length);
      originalSink?.(decision);
    },
  });
  const initializeMs = Number((performance.now() - initializeStartedAt).toFixed(3));
  const steps = [];
  while (!state.done && steps.length < maxSteps) steps.push(stepRouteAccumulator(state));
  const budgetExhausted = !state.done;
  const routes = state.done ? completeRouteAccumulator(state) : null;
  return {
    status: budgetExhausted ? "budget-exhausted" : "completed",
    routes,
    initializeMs,
    initializeOverBudget: initializeMs > maxStepMs,
    steps,
    maxStepMs: Math.max(...steps.map(({ elapsedMs }) => elapsedMs), 0),
    overBudgetSteps: steps.filter(({ elapsedMs }) => elapsedMs > maxStepMs).map(({ edgeId }) => edgeId),
    candidateCounts: Object.fromEntries(candidateCounts),
    acceptedPrefixLength: state.occupiedPaths.length,
    orderedEdgeIds: state.orderedEdges.map(({ id }) => id),
    orderedEdgeCount: state.orderedEdges.length,
    precomputedParallelBundleCount: state.parallelBundleLabelWidths.size,
    futureEdgesRetained: state.orderedEdges.length > state.nextIndex,
    state,
  };
}

export function compareRouteAccumulatorWithSynchronous(input, options = {}) {
  const incremental = runRouteAccumulator(input, options);
  const synchronous = deriveAutomaticRoutes(input);
  return {
    ...incremental,
    semanticEquivalent: incremental.status === "completed"
      && JSON.stringify(routeSignature(incremental.routes)) === JSON.stringify(routeSignature(synchronous)),
    synchronous,
  };
}

export const routeAccumulatorContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-ROUTE-SELECTION-ACCUMULATOR-v1",
  immutablePrecomputation: ["canonical ordered edge list", "node map", "parallel bundle label widths", "route label snapshot"],
  mutableState: ["current edge index", "accepted route map", "occupied path prefix", "overlap counts", "diagnostic state"],
  workUnit: "one canonical ordered edge route decision",
  partialProductCommit: false,
  datasetMutation: false,
  authorityMigration: false,
});
