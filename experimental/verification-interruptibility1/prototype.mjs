import {
  deriveAutomaticNodeLabels,
  deriveAutomaticRelationLabels,
  deriveAutomaticRoutes,
  deriveBoundedAutomaticPresentation,
} from "../../src/graph-presentation.ts";
import { compareRouteGeometry } from "../../src/viewport.ts";

const STAGE_NAMES = [
  "label-free-route",
  "first-route",
  "first-relation-label",
  "first-node-label",
];

function routeDeviation(left, right) {
  const count = Math.min(left.length, right.length);
  if (count === 0) return 0;
  return left.slice(0, count).reduce((total, point, index) => total + Math.hypot(
    point.x - right[index].x,
    point.y - right[index].y,
  ), 0) / count;
}

function labelsMoved(left, right) {
  if (!left || !right) return left !== right;
  return Math.abs(left.x - right.x) > 0.5
    || Math.abs(left.y - right.y) > 0.5
    || Math.abs(left.width - right.width) > 0.5
    || Math.abs(left.height - right.height) > 0.5;
}

function routeLabelsForNodePass(input, routes) {
  const labelFree = input._labelFreeRoutes;
  return routes.flatMap((route) => {
    const labelFreeRoute = labelFree.find((candidate) => candidate.id === route.id);
    if (!labelFreeRoute || compareRouteGeometry(route.samples, labelFreeRoute.samples).equivalent) return [];
    const deviation = routeDeviation(route.samples, labelFreeRoute.samples);
    return deviation >= 12 ? [{ samples: labelFreeRoute.samples, deviation }] : [];
  });
}

function routeInput(input, provisionalNodeLabels, pass) {
  return {
    graph: input.graph,
    positions: input.positions,
    edgeCurveOffsets: input.edgeCurveOffsets,
    selfLoopOverrides: input.selfLoopOverrides,
    provisionalNodeLabels,
    continuityNodeLabels: input.continuityNodeLabels,
    previousContinuityNodeLabels: input.previousContinuityNodeLabels,
    previousAutomaticRoutes: input.previousAutomaticRoutes,
    draggedNodeId: input.draggedNodeId,
    activeDraggedNodeId: input.activeDraggedNodeId,
    preserveSafeIncidentPreviousRoute: input.preserveSafeIncidentPreviousRoute,
    routeDecisionPass: pass,
  };
}

function deriveRoutes(input, provisionalNodeLabels, pass) {
  return deriveAutomaticRoutes(routeInput(input, provisionalNodeLabels, pass));
}

function deriveRelationLabels(input, routes, pass) {
  return deriveAutomaticRelationLabels({
    routedEdges: routes,
    nodes: input._nodes,
    previousPlacements: input.previousRelationLabelPlacements,
    manualAnchors: input.manualRelationLabelAnchors,
    draggedNodeId: input.draggedNodeId,
    pass,
  });
}

function deriveNodeLabels(input, routes, relationLabels, yieldingRoutes, pass) {
  return deriveAutomaticNodeLabels({
    nodes: input.graph.nodes,
    positions: input.positions,
    routedEdges: routes,
    occupiedRelationLabels: relationLabels,
    previousPlacements: input.previousNodeLabelPlacements,
    manualOffsets: input.manualNodeLabelOffsets,
    activelyDraggedNodeId: input.activelyDraggedNodeId,
    yieldingRoutes,
    pass,
  });
}

function normalizedInput(input) {
  return {
    ...input,
    _nodes: input.graph.nodes.map((node) => input.positions[node.id] ?? node),
    _labelFreeRoutes: [],
  };
}

export function createVerificationState(input, { maxStepMs = 50 } = {}) {
  const normalized = normalizedInput(input);
  return {
    input: normalized,
    queue: [...STAGE_NAMES],
    stageIndex: 0,
    status: "running",
    cancelRequested: false,
    maxStepMs,
    overBudgetStages: [],
    stageTimings: [],
    labelFreeRoutes: null,
    firstRoutes: null,
    firstRelationLabels: null,
    firstNodeLabels: null,
    feedbackRoutes: null,
    feedbackRelationLabels: null,
    feedbackNodeLabels: null,
    feedbackApplied: false,
    result: null,
  };
}

function firstFinalRouteLabels(state) {
  return state.input.graph.nodes
    .map((node, index) => state.firstNodeLabels.get(node.id) ?? state.input.provisionalNodeLabels[index])
    .filter((label) => label !== undefined);
}

function prepareFeedback(state) {
  const finalRouteLabels = firstFinalRouteLabels(state);
  const feedbackApplied = finalRouteLabels.length === state.input.graph.nodes.length
    && finalRouteLabels.some((label, index) => labelsMoved(state.input.provisionalNodeLabels[index], label));
  state.feedbackApplied = Boolean(state.input.feedbackEnabled !== false && feedbackApplied);
  state.queue = state.feedbackApplied
    ? ["feedback-route", "feedback-relation-label", "feedback-node-label"]
    : ["finalize"];
  state.stageIndex = 0;
}

function executeStage(state, stage) {
  const input = state.input;
  if (stage === "label-free-route") {
    state.labelFreeRoutes = deriveRoutes(input, [], "label-free");
    input._labelFreeRoutes = state.labelFreeRoutes;
    return;
  }
  if (stage === "first-route") {
    state.firstRoutes = deriveRoutes(input, input.provisionalNodeLabels, "first");
    return;
  }
  if (stage === "first-relation-label") {
    state.firstRelationLabels = deriveRelationLabels(input, state.firstRoutes, "first");
    return;
  }
  if (stage === "first-node-label") {
    const yieldingRoutes = routeLabelsForNodePass(input, state.firstRoutes);
    state.firstNodeLabels = deriveNodeLabels(input, state.firstRoutes, state.firstRelationLabels, yieldingRoutes, "first");
    prepareFeedback(state);
    return;
  }
  if (stage === "feedback-route") {
    state.feedbackRoutes = deriveRoutes(input, firstFinalRouteLabels(state), "feedback");
    return;
  }
  if (stage === "feedback-relation-label") {
    state.feedbackRelationLabels = deriveRelationLabels(input, state.feedbackRoutes, "feedback");
    return;
  }
  if (stage === "feedback-node-label") {
    const yieldingRoutes = routeLabelsForNodePass(input, state.feedbackRoutes);
    state.feedbackNodeLabels = deriveNodeLabels(input, state.feedbackRoutes, state.feedbackRelationLabels, yieldingRoutes, "feedback");
    state.queue = ["finalize"];
    state.stageIndex = 0;
    return;
  }
  if (stage === "finalize") {
    const routes = state.feedbackRoutes ?? state.firstRoutes;
    const relationLabels = state.feedbackRelationLabels ?? state.firstRelationLabels;
    const nodeLabels = state.feedbackNodeLabels ?? state.firstNodeLabels;
    state.result = {
      routedEdges: [...routes],
      relationLabels: new Map(relationLabels),
      nodeLabels: new Map(nodeLabels),
      feedbackApplied: state.feedbackApplied,
    };
    state.status = "completed";
    return;
  }
  throw new Error(`unknown verification stage: ${stage}`);
}

export function requestVerificationCancellation(state) {
  if (state.status !== "running") return state;
  return { ...state, cancelRequested: true };
}

export function stepVerification(state) {
  if (state.status !== "running") return state;
  if (state.cancelRequested) return { ...state, status: "cancelled" };
  const stage = state.queue[state.stageIndex];
  const startedAt = performance.now();
  const queueBefore = state.queue;
  const indexBefore = state.stageIndex;
  executeStage(state, stage);
  const elapsedMs = performance.now() - startedAt;
  state.stageTimings.push({ stage, elapsedMs: Number(elapsedMs.toFixed(3)), interruptible: false });
  if (elapsedMs > state.maxStepMs && stage !== "finalize") state.overBudgetStages.push(stage);
  if (state.status === "completed") return state;
  if (state.queue === queueBefore && state.stageIndex === indexBefore) state.stageIndex += 1;
  return state;
}

export function runVerification(input, options = {}) {
  let state = createVerificationState(input, options);
  const maxSteps = options.maxSteps ?? 16;
  while (state.status === "running" && state.stageTimings.length < maxSteps) state = stepVerification(state);
  if (state.status === "running") state = { ...state, status: "budget-exhausted" };
  return {
    status: state.status,
    result: state.result,
    feedbackApplied: state.feedbackApplied,
    stageTimings: state.stageTimings,
    overBudgetStages: [...state.overBudgetStages],
    stageCount: state.stageTimings.length,
    maxStageMs: Math.max(...state.stageTimings.map(({ elapsedMs }) => elapsedMs), 0),
    state,
  };
}

export function runSynchronousReference(input) {
  return deriveBoundedAutomaticPresentation(input);
}

export function compareWithSynchronousReference(input, options = {}) {
  const staged = runVerification(input, options);
  const reference = runSynchronousReference(input);
  return {
    ...staged,
    semanticEquivalent: staged.status === "completed"
      && JSON.stringify(presentationSignature(staged.result)) === JSON.stringify(presentationSignature(reference)),
    reference,
  };
}

function presentationSignature(result) {
  if (!result) return null;
  return {
    routedEdges: result.routedEdges.map(({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId }) => ({ id, sourcePosition, targetPosition, path, samples, labelPoint, controlPoint, parallelSolverEligible, directRecoveryObstacleId })),
    relationLabels: [...result.relationLabels.entries()],
    nodeLabels: [...result.nodeLabels.entries()],
    feedbackApplied: result.feedbackApplied,
  };
}

export const verificationExecutionContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-VERIFICATION-INTERRUPTIBILITY-v1",
  stageOrder: STAGE_NAMES,
  stageCallsAreDiagnosticWholePasses: true,
  partialProductCommit: false,
  datasetMutation: false,
  authorityMigration: false,
  currentDisposition: "partial-interruptibility-only",
});
