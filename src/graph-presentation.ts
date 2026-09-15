import type { GraphEdge, GraphNode } from "./dataset.ts";
import { reconstructManualRelationLabelTarget, type ManualNodeLabelOffset, type ManualRelationLabelAnchor } from "./relation-label-presentation.ts";
import { createFeedbackStageInput, createPresentationPassSnapshot, createRouteSelectionSnapshot, type FeedbackStageInput, type PresentationPassSnapshot } from "./presentation-stage-contracts.ts";
import { dependencyFingerprint, type PresentationDependencyTrace } from "./presentation-dependency.ts";
import { compareRouteGeometry, placeEdgeLabel, placeNodeLabel, pointBounds, relationLabelDisplayWidth, routeGraphEdge, routeSamplesHaveLabelCollision, routeSamplesHaveNodeInfluence, routeSamplesHaveOccupiedPathConflict, type LabelPlacementProfile, type LabelPlacementTrace, type LabelRect, type Point, type PointBounds, type RouteArbitrationProfile, type RouteCandidateCache, type RouteCandidateDiagnostic, type RouteGeometryCache, type RouteYieldPath } from "./viewport.ts";

export type RoutingGraphEdge = GraphEdge & { label: string };
export type SelfLoopOverride = { orientation: number; radius: number };
export type AutomaticRouteDecision = {
  edgeId: string;
  pass: "label-free" | "first" | "feedback";
  processingIndex: number;
  usedPreviousRoute: boolean;
  /** A finalizing pass discarded an otherwise safe historical detour for the current safe route. */
  recoveredCurrentRoute: boolean;
  /**
   * Development-only active-recovery state. It explains whether a fresh route
   * was eligible to replace a direct-obstacle detour during the current drag.
   */
  activeRecovery: {
    previousRouteDirectRecoveryObstacleId?: string;
    provenanceMatchesActiveDrag: boolean;
    provenanceMatchesFinalizingDrag: boolean;
    freshRouteIsSafe: boolean;
    freshRouteHasNodeInfluence: boolean;
    freshRouteHasOccupiedPathConflict: boolean;
    freshRouteHasLabelCollision: boolean;
  };
  continuity: {
    previousRoutePresent: boolean;
    draggedNodePresent: boolean;
    isIncident: boolean;
    isEligibleShape: boolean;
    priorRouteHasNodeInfluence: boolean;
    priorRouteHasOccupiedPathConflict: boolean;
    priorRouteHasLabelCollision: boolean;
    /** Development-only explanation of a rejected continuity candidate. */
    blockingNodeIds: readonly string[];
    blockingOccupiedRouteIds: readonly string[];
    blockingNodeLabelIds: readonly string[];
  };
  candidateDiagnostics: readonly RouteCandidateDiagnostic[];
};

export type AutomaticRouteTrace = {
  pass: AutomaticRouteDecision["pass"];
  edgeId: string;
  processingIndex: number;
  routeLabelInputFingerprint: string;
  candidateFingerprint: string;
  selectedRouteFingerprint: string;
  occupiedPathPrefixFingerprint: string;
};

export type AutomaticRelationLabelTrace = {
  pass: AutomaticRouteDecision["pass"];
  relationId: string;
  processingIndex: number;
  routeFingerprint: string;
  inputFingerprint: string;
  occupiedRelationLabelPrefixFingerprint: string;
  candidateFingerprint: string;
  selectedPlacementFingerprint: string;
};

export type AutomaticNodeLabelTrace = {
  pass: AutomaticRouteDecision["pass"];
  nodeId: string;
  processingIndex: number;
  inputFingerprint: string;
  positionFingerprint: string;
  occupiedLabelPrefixFingerprint: string;
  routeSetFingerprint: string;
  yieldingRouteFingerprint: string;
  candidateFingerprint: string;
  selectedPlacementFingerprint: string;
};

export type AutomaticPresentationPassProfile = {
  elapsedMs: number;
  route: RouteArbitrationProfile;
  relationLabel: LabelPlacementProfile;
  nodeLabel: LabelPlacementProfile;
  continuitySafetyMs: number;
  occupiedPathMaintenanceMs: number;
  relationLabelMs: number;
  nodeLabelMs: number;
  routeDecisions: number;
};

export type AutomaticPresentationProfiler = {
  passes: Record<AutomaticRouteDecision["pass"], AutomaticPresentationPassProfile>;
};

function emptyRouteArbitrationProfile(): RouteArbitrationProfile {
  return {
    candidateGenerationMs: 0,
    candidateCacheKeyMs: 0,
    geometryCacheKeyMs: 0,
    geometryCacheLookupMs: 0,
    geometryConstructionMs: 0,
    sampleBoundsMs: 0,
    nodeObstacleMs: 0,
    occupiedPathBoundsMs: 0,
    arbitrationMs: 0,
    occupiedPathCheckMs: 0,
    occupiedPathPointComparisons: 0,
    labelPressureMs: 0,
    candidateScoreAssemblyMs: 0,
    candidateComparisons: 0,
    safeCandidateChecks: 0,
    selectedRouteCommits: 0,
  };
}

function emptyLabelPlacementProfile(): LabelPlacementProfile {
  return {
    elapsedMs: 0,
    pathBoundsPrecomputationMs: 0,
    pathBoundsBuildCount: 0,
    pathBoundsPointVisits: 0,
    candidateEvaluations: 0,
    occupiedLabelChecks: 0,
    otherNodeChecks: 0,
    edgePathPointChecks: 0,
    pathBroadPhaseRejects: 0,
    yieldingRoutePointChecks: 0,
    yieldingRouteBroadPhaseRejects: 0,
    previousPlacementEvaluations: 0,
    manualAnchorReconstructions: 0,
  };
}

export function createAutomaticPresentationProfiler(): AutomaticPresentationProfiler {
  return {
    passes: {
      "label-free": { elapsedMs: 0, route: emptyRouteArbitrationProfile(), relationLabel: emptyLabelPlacementProfile(), nodeLabel: emptyLabelPlacementProfile(), continuitySafetyMs: 0, occupiedPathMaintenanceMs: 0, relationLabelMs: 0, nodeLabelMs: 0, routeDecisions: 0 },
      first: { elapsedMs: 0, route: emptyRouteArbitrationProfile(), relationLabel: emptyLabelPlacementProfile(), nodeLabel: emptyLabelPlacementProfile(), continuitySafetyMs: 0, occupiedPathMaintenanceMs: 0, relationLabelMs: 0, nodeLabelMs: 0, routeDecisions: 0 },
      feedback: { elapsedMs: 0, route: emptyRouteArbitrationProfile(), relationLabel: emptyLabelPlacementProfile(), nodeLabel: emptyLabelPlacementProfile(), continuitySafetyMs: 0, occupiedPathMaintenanceMs: 0, relationLabelMs: 0, nodeLabelMs: 0, routeDecisions: 0 },
    },
  };
}

export type AutomaticRoutingInput = {
  graph: { nodes: readonly GraphNode[]; edges: readonly RoutingGraphEdge[] };
  positions: Readonly<Record<string, Point>>;
  edgeCurveOffsets: Readonly<Record<string, number>>;
  selfLoopOverrides: Readonly<Record<string, SelfLoopOverride>>;
  provisionalNodeLabels: readonly LabelRect[];
  /** Active-drag label snapshot used for route scoring and continuity safety. */
  continuityNodeLabels?: readonly LabelRect[];
  /** Labels displayed with the previous route, for distinguishing a new collision from an accepted prior one. */
  previousContinuityNodeLabels?: ReadonlyMap<string, LabelRect>;
  previousAutomaticRoutes?: ReadonlyMap<string, DerivedAutomaticRoute>;
  draggedNodeId?: string;
  /** Active-only route scoring context; finalizing passes leave this undefined. */
  activeDraggedNodeId?: string;
  /**
   * Explicit finalizing-only continuity authority for an incident route whose
   * previous geometry was rendered at the same Node position. The normal
   * safety predicates still decide whether that route may be retained.
   */
  preserveSafeIncidentPreviousRoute?: boolean;
  routeDecisionSink?: (decision: AutomaticRouteDecision) => void;
  routeTraceSink?: (trace: AutomaticRouteTrace) => void;
  /** Opt-in candidate-generation cache; arbitration remains uncached. */
  candidateCache?: RouteCandidateCache;
  /** Opt-in exact endpoint/offset geometry cache; route arbitration remains uncached. */
  geometryCache?: RouteGeometryCache;
  /** Development-only automatic parallel-group spacing; omitted by normal Product callers. */
  parallelBundleSpacing?: number;
  /** Development-only per-bundle override keyed by sorted endpoint IDs. */
  parallelBundleSpacingByKey?: Readonly<Record<string, number>>;
  /** Development-only slot policy for parallel-group spacing. */
  parallelBundleMode?: "pair" | "bundle" | "corridor";
  /** Opt-in diagnostic timings/counters; omitted by normal Product callers. */
  profiler?: AutomaticPresentationProfiler;
  routeDecisionPass?: AutomaticRouteDecision["pass"];
  /** Diagnostic-only canonical prefix replay. Normal Product calls omit it. */
  replayPrefix?: {
    edgeIds: readonly string[];
    routes: ReadonlyMap<string, DerivedAutomaticRoute>;
  };
  replayPrefixSink?: (edgeIds: readonly string[]) => void;
};

export type DerivedAutomaticRoute = RoutingGraphEdge & Pick<
  ReturnType<typeof routeGraphEdge>,
  "path" | "samples" | "labelPoint" | "controlPoint"
> & {
  /** Endpoint geometry that produced this derived path; used only for bounded continuity checks. */
  sourcePosition?: Point;
  targetPosition?: Point;
  parallelSolverEligible: boolean;
  /**
   * The Node that directly forced this non-incident route away from its prior
   * safe geometry. It survives an unchanged committed detour so a later drag
   * of that same Node can recover without broadening remote-route churn.
   */
  directRecoveryObstacleId?: string;
};

export type AutomaticRouteSelectionAccumulator = {
  input: AutomaticRoutingInput;
  orderedEdges: readonly RoutingGraphEdge[];
  nextIndex: number;
  occupiedPaths: Array<Array<Point>>;
  occupiedPathIds: string[];
  overlapCounts: Map<string, number>;
  nodeMap: Map<string, GraphNode>;
  parallelBundleLabelWidths: Map<string, number>;
  routeLabelRects: LabelRect[];
  continuityLabelRects: LabelRect[];
  routedById: Map<string, Omit<DerivedAutomaticRoute, keyof RoutingGraphEdge>>;
  done: boolean;
};

function compareRoutingPriority(left: RoutingGraphEdge, right: RoutingGraphEdge) {
  return left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.id.localeCompare(right.id);
}

/** Initializes the immutable route plan and the ordered mutable route state. */
export function initializeAutomaticRouteSelection(input: AutomaticRoutingInput): AutomaticRouteSelectionAccumulator {
  const normalizedInput = {
    ...input,
    preserveSafeIncidentPreviousRoute: input.preserveSafeIncidentPreviousRoute ?? false,
    parallelBundleMode: input.parallelBundleMode ?? "bundle",
    routeDecisionPass: input.routeDecisionPass ?? "first",
  };
  const { graph, positions, edgeCurveOffsets, continuityNodeLabels, provisionalNodeLabels } = normalizedInput;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const parallelBundleLabelWidths = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.parallelCount <= 1) continue;
    const key = [edge.sourceId, edge.targetId].sort().join("\u0000");
    parallelBundleLabelWidths.set(key, Math.max(parallelBundleLabelWidths.get(key) ?? 0, relationLabelDisplayWidth(edge.label)));
  }
  // During active drag, use the labels that were actually displayed in the
  // preceding presentation for stationary Nodes, plus the current label for
  // the dragged Node. Idle/final presentations leave this undefined and retain
  // the original provisional-label input.
  const routeLabelRects = [...(continuityNodeLabels ?? provisionalNodeLabels)];
  const continuityLabelRects = [...(continuityNodeLabels ?? routeLabelRects)];
  const fixedEdges = graph.edges.filter((edge) => {
    const sourceNode = nodeMap.get(edge.sourceId)!;
    const targetNode = nodeMap.get(edge.targetId)!;
    const source = positions[sourceNode.id] ?? sourceNode;
    const target = positions[targetNode.id] ?? targetNode;
    return edgeCurveOffsets[edge.id] !== undefined
      || edge.sourceId === edge.targetId
      || (source.x === target.x && source.y === target.y);
  }).sort(compareRoutingPriority);
  const automaticOrdinaryEdges = graph.edges.filter((edge) => !fixedEdges.some(({ id }) => id === edge.id))
    .sort(compareRoutingPriority);
  const orderedEdges = [...fixedEdges, ...automaticOrdinaryEdges];
  const occupiedPaths: Array<Array<Point>> = [];
  const occupiedPathIds: string[] = [];
  const overlapCounts = new Map<string, number>();
  const routedById = new Map<string, Omit<DerivedAutomaticRoute, keyof RoutingGraphEdge>>();
  const replayedEdgeIds = new Set<string>();
  for (const [processingIndex, edge] of orderedEdges.entries()) {
    if (normalizedInput.replayPrefix?.edgeIds[processingIndex] !== edge.id) break;
    const replayedRoute = normalizedInput.replayPrefix.routes.get(edge.id);
    const source = positions[edge.sourceId] ?? nodeMap.get(edge.sourceId)!;
    const target = positions[edge.targetId] ?? nodeMap.get(edge.targetId)!;
    const endpointGeometryMatches = replayedRoute?.sourcePosition?.x === source.x
      && replayedRoute.sourcePosition.y === source.y
      && replayedRoute.targetPosition?.x === target.x
      && replayedRoute.targetPosition.y === target.y;
    if (!replayedRoute || !endpointGeometryMatches) break;
    const overlapKey = `${source.x}\u0000${source.y}`;
    if (edge.sourceId !== edge.targetId && source.x === target.x && source.y === target.y) {
      overlapCounts.set(overlapKey, (overlapCounts.get(overlapKey) ?? 0) + 1);
    }
    occupiedPaths.push(replayedRoute.samples);
    occupiedPathIds.push(edge.id);
    routedById.set(edge.id, replayedRoute);
    replayedEdgeIds.add(edge.id);
  }
  normalizedInput.replayPrefixSink?.([...replayedEdgeIds]);
  return {
    input: normalizedInput,
    orderedEdges,
    nextIndex: replayedEdgeIds.size,
    occupiedPaths,
    occupiedPathIds,
    overlapCounts,
    nodeMap,
    parallelBundleLabelWidths,
    routeLabelRects,
    continuityLabelRects,
    routedById,
    done: replayedEdgeIds.size >= orderedEdges.length,
  };
}

/** Processes exactly one canonical ordered route edge and returns its result. */
export function stepAutomaticRouteSelection(state: AutomaticRouteSelectionAccumulator): { done: boolean; edgeId?: string; route?: DerivedAutomaticRoute } {
  if (state.done) return { done: true };
  const { input, orderedEdges, nodeMap } = state;
  const { graph, positions, edgeCurveOffsets, selfLoopOverrides, draggedNodeId, activeDraggedNodeId, previousAutomaticRoutes, previousContinuityNodeLabels, routeDecisionSink, routeTraceSink, candidateCache, geometryCache, profiler } = input;
  const preserveSafeIncidentPreviousRoute = input.preserveSafeIncidentPreviousRoute ?? false;
  const parallelBundleMode = input.parallelBundleMode ?? "bundle";
  const routeDecisionPass = input.routeDecisionPass ?? "first";
  const occupiedPaths = state.occupiedPaths;
  const occupiedPathIds = state.occupiedPathIds;
  const overlapCounts = state.overlapCounts;
  const parallelBundleLabelWidths = state.parallelBundleLabelWidths;
  const routeLabelRects = state.routeLabelRects;
  const continuityLabelRects = state.continuityLabelRects;
  const processingIndex = state.nextIndex;
  const edge = orderedEdges[processingIndex];
  if (!edge) {
    state.done = true;
    return { done: true };
  }
  const parallelBundleKey = [edge.sourceId, edge.targetId].sort().join("\u0000");
  const parallelBundleSpacing = input.parallelBundleSpacingByKey?.[parallelBundleKey]
    ?? input.parallelBundleSpacing;
    const canonicalPhysicalSideSign = edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1;
    const sourceNode = nodeMap.get(edge.sourceId)!;
    const targetNode = nodeMap.get(edge.targetId)!;
    const source = positions[sourceNode.id] ?? sourceNode;
    const target = positions[targetNode.id] ?? targetNode;
    const obstacles = graph.nodes
      .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
      .map((node) => positions[node.id] ?? node);
    const isOverlappingPair = edge.sourceId !== edge.targetId
      && source.x === target.x
      && source.y === target.y;
    const overlapKey = `${source.x}\u0000${source.y}`;
    const overlapIndex = isOverlappingPair ? (overlapCounts.get(overlapKey) ?? 0) : 0;
    if (isOverlappingPair) overlapCounts.set(overlapKey, overlapIndex + 1);
    const isIncident = edge.sourceId === draggedNodeId || edge.targetId === draggedNodeId;
    const routeLabelsForEdge = activeDraggedNodeId !== undefined && isIncident
      ? state.routeLabelRects.filter((_, index) => {
        const nodeId = graph.nodes[index]?.id;
        return nodeId !== edge.sourceId && nodeId !== edge.targetId;
      })
      : routeLabelRects;
    const previousRoute = previousAutomaticRoutes?.get(edge.id);
    const previousRouteSideSign = draggedNodeId !== undefined
      && edge.parallelCount === 1
      && edgeCurveOffsets[edge.id] === undefined
      && previousRoute?.samples.length
      && previousRoute.controlPoint
      ? Math.sign(
        (target.x - source.x) * (previousRoute.controlPoint.y - (source.y + target.y) / 2)
        - (target.y - source.y) * (previousRoute.controlPoint.x - (source.x + target.x) / 2),
      )
      : 0;
    const candidateDiagnostics: RouteCandidateDiagnostic[] = [];
    const passProfile = profiler?.passes[routeDecisionPass];
    const route = routeGraphEdge(
      source,
      target,
      edge.parallelIndex,
      edge.parallelCount,
      obstacles,
      occupiedPaths,
      edge.sourceId === edge.targetId,
      overlapIndex,
      edgeCurveOffsets[edge.id],
      selfLoopOverrides[edge.id],
      routeLabelsForEdge,
      canonicalPhysicalSideSign,
      routeDecisionSink !== undefined || routeTraceSink !== undefined ? (candidates) => candidateDiagnostics.push(...candidates) : undefined,
      previousRouteSideSign,
      candidateCache,
      passProfile?.route,
      geometryCache,
      parallelBundleSpacing,
      parallelBundleMode,
      parallelBundleLabelWidths.get([edge.sourceId, edge.targetId].sort().join("\u0000")) ?? 0,
    );
    const isEligibleShape = edge.sourceId !== edge.targetId
      && edge.parallelCount === 1
      && edgeCurveOffsets[edge.id] === undefined
      && previousRoute !== undefined
      && previousRoute.samples.length > 1
      && route.samples.length > 1;
    // An incident route can only be reused at finalization when it was drawn
    // for these exact endpoints in the last active frame. Pointer processing
    // may leave a last active sample behind the final release coordinate, so
    // phase identity alone is not enough to reuse its path safely.
    const incidentFinalizationContinuity = isIncident
      && activeDraggedNodeId === undefined
      && preserveSafeIncidentPreviousRoute
      && previousRoute?.sourcePosition?.x === source.x
      && previousRoute.sourcePosition.y === source.y
      && previousRoute.targetPosition?.x === target.x
      && previousRoute.targetPosition.y === target.y;
    const continuityCandidate = previousRoute !== undefined
      && draggedNodeId !== undefined
      && (!isIncident || incidentFinalizationContinuity)
      && isEligibleShape;
    // Keep the existing lazy safety work: ordinary presentation without a
    // continuity candidate does not pay these diagnostic-observable checks.
    const continuityStartedAt = performance.now();
    const priorRouteHasNodeInfluence = continuityCandidate && routeSamplesHaveNodeInfluence(previousRoute.samples, obstacles);
    // Preserve an origin only when this very dragged Node directly blocked the
    // preceding route. Routes that merely changed because an earlier route
    // occupied a different corridor must not receive eager active recovery.
    const priorRouteBlockedByDraggedNode = continuityCandidate
      && routeSamplesHaveNodeInfluence(previousRoute.samples, [positions[draggedNodeId!] ?? nodeMap.get(draggedNodeId!)!]);
    const priorRouteHasOccupiedPathConflict = continuityCandidate && routeSamplesHaveOccupiedPathConflict(previousRoute.samples, occupiedPaths);
    const collidingContinuityNodeLabelIds = continuityCandidate && routeSamplesHaveLabelCollision(previousRoute.samples, continuityLabelRects)
      ? continuityLabelRects.flatMap((label, index) => {
        if (!routeSamplesHaveLabelCollision(previousRoute.samples, [label])) return [];
        const nodeId = graph.nodes[index]?.id ?? `label-${index}`;
        const priorLabel = previousContinuityNodeLabels?.get(nodeId);
        // A label/route overlap that the immediately preceding presentation
        // already displayed is not a new active-drag safety regression for a
        // stationary label; it must not alone trigger unrelated remote-route
        // churn before label feedback. The dragged Node is different: its
        // label is live in the active frame, so a remote route crossing that
        // displayed label must be treated as unsafe even when the same
        // overlap was present in the preceding frame. Otherwise active
        // routing can visibly occupy the label and finalization alone will
        // flip the route after the authoritative label pass.
        return nodeId !== draggedNodeId
          && priorLabel
          && routeSamplesHaveLabelCollision(previousRoute.samples, [priorLabel]) ? [] : [nodeId];
      })
      : [];
    const priorRouteHasLabelCollision = collidingContinuityNodeLabelIds.length > 0;
    const canPreservePreviousRoute = continuityCandidate
      && !priorRouteHasNodeInfluence
      && !priorRouteHasOccupiedPathConflict
      && !priorRouteHasLabelCollision;
    // While a Node is moving, a safe remote route must not churn merely
    // because a different safe candidate becomes available. The same is true
    // at pointer-up unless this Node is returning a route it directly
    // displaced: replacing every safe historical route at finalization made a
    // same-geometry phase boundary visibly re-arbitrate unrelated routes.
    // A directly-caused detour retains its bounded provenance, so its safe
    // recovery remains idempotent without making straightness authoritative.
    const freshRouteHasNodeInfluence = continuityCandidate && routeSamplesHaveNodeInfluence(route.samples, obstacles);
    const freshRouteHasOccupiedPathConflict = continuityCandidate && routeSamplesHaveOccupiedPathConflict(route.samples, occupiedPaths);
    const freshRouteHasLabelCollision = continuityCandidate && routeSamplesHaveLabelCollision(route.samples, routeLabelsForEdge);
    const freshRouteIsSafe = !freshRouteHasNodeInfluence
      && !freshRouteHasOccupiedPathConflict
      && !freshRouteHasLabelCollision;
    if (passProfile) passProfile.continuitySafetyMs += performance.now() - continuityStartedAt;
    const previousDirectRecoveryMatchesDrag = draggedNodeId !== undefined
      && previousRoute?.directRecoveryObstacleId === draggedNodeId;
    const canRecoverDuringActiveDrag = activeDraggedNodeId !== undefined
      && previousDirectRecoveryMatchesDrag;
    const canRecoverDuringFinalization = activeDraggedNodeId === undefined
      && previousDirectRecoveryMatchesDrag;
    const canRecoverCurrentRoute = canPreservePreviousRoute
      && previousRoute!.path !== route.path
      && freshRouteIsSafe
      && (canRecoverDuringActiveDrag || canRecoverDuringFinalization);
    const selectedRoute = canPreservePreviousRoute && !canRecoverCurrentRoute ? previousRoute : route;
    routeTraceSink?.({
      pass: routeDecisionPass,
      edgeId: edge.id,
      processingIndex,
      routeLabelInputFingerprint: JSON.stringify({ routeLabelsForEdge, source, target, obstacles, previousRoute, edgeCurveOffset: edgeCurveOffsets[edge.id] }),
      candidateFingerprint: JSON.stringify(candidateDiagnostics),
      selectedRouteFingerprint: JSON.stringify({ path: selectedRoute.path, samples: selectedRoute.samples, labelPoint: selectedRoute.labelPoint, controlPoint: selectedRoute.controlPoint }),
      occupiedPathPrefixFingerprint: JSON.stringify(occupiedPaths),
    });
    if (passProfile) passProfile.route.selectedRouteCommits += 1;
    // A direct-obstacle recovery can legitimately pass through a safe but
    // still-curved fresh candidate before the original/equivalent route is
    // available again. Keep its bounded cause through an unchanged committed
    // detour as well: a later drag of the same Node has the same narrowly
    // scoped authority, while other Nodes and unmarked remote routes retain
    // ordinary continuity reuse.
    const unchangedCommittedDetour = draggedNodeId === undefined
      && previousRoute?.directRecoveryObstacleId !== undefined
      && previousRoute.path === route.path;
    const directRecoveryObstacleId = selectedRoute === previousRoute
      ? previousRoute.directRecoveryObstacleId
      : priorRouteBlockedByDraggedNode
        ? draggedNodeId
        : previousDirectRecoveryMatchesDrag || unchangedCommittedDetour
          ? previousRoute?.directRecoveryObstacleId
          : undefined;
    // Compute explanatory identities only for the opt-in development sink.
    // The normal Product path retains the original constant-cost predicates.
    const blockingNodeIds = routeDecisionSink !== undefined && priorRouteHasNodeInfluence
      ? graph.nodes
        .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
        .filter((node) => routeSamplesHaveNodeInfluence(previousRoute!.samples, [positions[node.id] ?? node]))
        .map((node) => node.id)
      : [];
    const blockingOccupiedRouteIds = routeDecisionSink !== undefined && priorRouteHasOccupiedPathConflict
      ? occupiedPaths.flatMap((occupiedPath, index) => routeSamplesHaveOccupiedPathConflict(previousRoute!.samples, [occupiedPath]) ? [occupiedPathIds[index]!] : [])
      : [];
    const blockingNodeLabelIds = routeDecisionSink !== undefined ? collidingContinuityNodeLabelIds : [];
    routeDecisionSink?.({
      edgeId: edge.id,
      pass: routeDecisionPass,
      processingIndex,
      usedPreviousRoute: canPreservePreviousRoute && !canRecoverCurrentRoute,
      recoveredCurrentRoute: canRecoverCurrentRoute,
      activeRecovery: {
        previousRouteDirectRecoveryObstacleId: previousRoute?.directRecoveryObstacleId,
        provenanceMatchesActiveDrag: canRecoverDuringActiveDrag,
        provenanceMatchesFinalizingDrag: canRecoverDuringFinalization,
        freshRouteIsSafe,
        freshRouteHasNodeInfluence,
        freshRouteHasOccupiedPathConflict,
        freshRouteHasLabelCollision,
      },
      continuity: {
        previousRoutePresent: previousRoute !== undefined,
        draggedNodePresent: draggedNodeId !== undefined,
        isIncident,
        isEligibleShape,
        priorRouteHasNodeInfluence,
        priorRouteHasOccupiedPathConflict,
        priorRouteHasLabelCollision,
        blockingNodeIds,
        blockingOccupiedRouteIds,
        blockingNodeLabelIds,
      },
      candidateDiagnostics,
    });
    const routeWithoutObstacles = edge.parallelCount > 1
      && edge.sourceId !== edge.targetId
      && !isOverlappingPair
      ? routeGraphEdge(
        source,
        target,
        edge.parallelIndex,
        edge.parallelCount,
        [],
        occupiedPaths,
        false,
        overlapIndex,
        edgeCurveOffsets[edge.id],
        selfLoopOverrides[edge.id],
        [],
        canonicalPhysicalSideSign,
        undefined,
        0,
        undefined,
        passProfile?.route,
        geometryCache,
        parallelBundleSpacing,
        parallelBundleMode,
        parallelBundleLabelWidths.get([edge.sourceId, edge.targetId].sort().join("\u0000")) ?? 0,
      )
      : null;
    const routeWithoutObstaclesOrOccupiedPaths = routeWithoutObstacles !== null
      ? routeGraphEdge(
        source,
        target,
        edge.parallelIndex,
        edge.parallelCount,
        [],
        [],
        false,
        overlapIndex,
        edgeCurveOffsets[edge.id],
        selfLoopOverrides[edge.id],
        [],
        canonicalPhysicalSideSign,
        undefined,
        0,
        undefined,
        passProfile?.route,
        geometryCache,
        parallelBundleSpacing,
        parallelBundleMode,
        parallelBundleLabelWidths.get([edge.sourceId, edge.targetId].sort().join("\u0000")) ?? 0,
      )
      : null;
    const obstacleComparison = routeWithoutObstacles === null
      ? null
      : compareRouteGeometry(routeWithoutObstacles.samples, selectedRoute.samples);
    const occupiedPathComparison = routeWithoutObstacles === null || routeWithoutObstaclesOrOccupiedPaths === null
      ? null
      : compareRouteGeometry(routeWithoutObstaclesOrOccupiedPaths.samples, routeWithoutObstacles.samples);
    const parallelSolverEligible = edge.parallelCount > 1
      && edge.sourceId !== edge.targetId
      && !isOverlappingPair
      && obstacleComparison?.equivalent === true
      && occupiedPathComparison?.equivalent === true;
    const occupiedPathMaintenanceStartedAt = performance.now();
    state.occupiedPaths.push(selectedRoute.samples);
    state.occupiedPathIds.push(edge.id);
    if (passProfile) passProfile.occupiedPathMaintenanceMs += performance.now() - occupiedPathMaintenanceStartedAt;
    if (passProfile) passProfile.routeDecisions += 1;
    const derivedRoute = {
      sourcePosition: { x: source.x, y: source.y },
      targetPosition: { x: target.x, y: target.y },
      path: selectedRoute.path,
      samples: selectedRoute.samples,
      labelPoint: selectedRoute.labelPoint,
      controlPoint: selectedRoute.controlPoint,
      parallelSolverEligible,
      directRecoveryObstacleId,
    };
    state.routedById.set(edge.id, derivedRoute);
    state.nextIndex += 1;
    state.done = state.nextIndex >= orderedEdges.length;
    return { done: state.done, edgeId: edge.id, route: { ...edge, ...derivedRoute } };
}

export function completeAutomaticRouteSelection(state: AutomaticRouteSelectionAccumulator): DerivedAutomaticRoute[] {
  if (!state.done) throw new Error("route selection cannot be completed before all ordered edges are processed");
  return state.input.graph.edges.map((edge) => ({ ...edge, ...state.routedById.get(edge.id)! }));
}

/** Pure Product-owned automatic route derivation. App state arrives as snapshots. */
export function deriveAutomaticRoutes(input: AutomaticRoutingInput): DerivedAutomaticRoute[] {
  const state = initializeAutomaticRouteSelection(input);
  while (!state.done) stepAutomaticRouteSelection(state);
  return completeAutomaticRouteSelection(state);
}

export type AutomaticRelationLabelInput = {
  routedEdges: readonly DerivedAutomaticRoute[];
  nodes: readonly Point[];
  previousPlacements: ReadonlyMap<string, LabelRect>;
  manualAnchors: ReadonlyMap<string, ManualRelationLabelAnchor>;
  /** Development-only arc-length offset by Relation ID; normal Product callers omit it. */
  relationLabelStaggerById?: Readonly<Record<string, number>>;
  draggedNodeId?: string;
  profile?: LabelPlacementProfile;
  pass?: AutomaticRouteDecision["pass"];
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  placementTraceSink?: (trace: AutomaticRelationLabelTrace) => void;
};

export type AutomaticRelationLabelAccumulator = {
  input: AutomaticRelationLabelInput;
  orderedEdges: readonly DerivedAutomaticRoute[];
  nextIndex: number;
  occupiedLabels: LabelRect[];
  result: Map<string, LabelRect>;
  nodePoints: Point[];
  routeBounds: Array<PointBounds | null>;
  done: boolean;
};

export type AutomaticNodeLabelInput = {
  nodes: readonly GraphNode[];
  positions: Readonly<Record<string, Point>>;
  routedEdges: readonly DerivedAutomaticRoute[];
  occupiedRelationLabels: ReadonlyMap<string, LabelRect>;
  previousPlacements: ReadonlyMap<string, LabelRect>;
  manualOffsets: ReadonlyMap<string, ManualNodeLabelOffset>;
  activelyDraggedNodeId?: string;
  yieldingRoutes?: readonly RouteYieldPath[];
  profile?: LabelPlacementProfile;
  pass?: AutomaticRouteDecision["pass"];
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  placementTraceSink?: (trace: AutomaticNodeLabelTrace) => void;
};

export type AutomaticNodeLabelAccumulator = {
  input: AutomaticNodeLabelInput;
  orderedNodes: readonly GraphNode[];
  nextIndex: number;
  initialRelationLabels: readonly LabelRect[];
  occupiedLabels: LabelRect[];
  acceptedNodeLabels: LabelRect[];
  result: Map<string, LabelRect>;
  positions: Readonly<Record<string, Point>>;
  edgePaths: Point[][];
  edgePathBounds: Array<PointBounds | null>;
  yieldingRouteBounds: Array<PointBounds | null>;
  done: boolean;
};

/** Initializes the immutable Relation-label inputs and ordered mutable prefix state. */
export function initializeAutomaticRelationLabelPlacement(input: AutomaticRelationLabelInput): AutomaticRelationLabelAccumulator {
  const normalizedInput = { ...input, pass: input.pass ?? "first" };
  const orderedEdges = [...normalizedInput.routedEdges];
  const nodePoints = [...normalizedInput.nodes];
  const boundsStartedAt = performance.now();
  const routeBounds = orderedEdges.map(({ samples }) => pointBounds(samples));
  if (normalizedInput.profile) {
    normalizedInput.profile.pathBoundsPrecomputationMs += performance.now() - boundsStartedAt;
    normalizedInput.profile.pathBoundsBuildCount += orderedEdges.length;
    normalizedInput.profile.pathBoundsPointVisits += orderedEdges.reduce((total, edge) => total + edge.samples.length, 0);
  }
  return {
    input: normalizedInput,
    orderedEdges,
    nextIndex: 0,
    occupiedLabels: [],
    result: new Map(),
    nodePoints,
    routeBounds,
    done: orderedEdges.length === 0,
  };
}

/** Processes exactly one ordered routed edge, including an empty-label no-op. */
export function stepAutomaticRelationLabelPlacement(state: AutomaticRelationLabelAccumulator): { done: boolean; relationId?: string; placement?: LabelRect; skipped?: boolean } {
  if (state.done) return { done: true };
  const edge = state.orderedEdges[state.nextIndex];
  if (!edge) {
    state.done = true;
    return { done: true };
  }
  const processingIndex = state.nextIndex;
  state.nextIndex += 1;
  if (!edge.label) {
    state.done = state.nextIndex >= state.orderedEdges.length;
    return { done: state.done, relationId: edge.id, skipped: true };
  }
  const { previousPlacements, manualAnchors, relationLabelStaggerById, draggedNodeId, profile, placementTraceSink } = state.input;
  const otherEdgePaths = state.orderedEdges.filter(({ id }) => id !== edge.id).map(({ samples }) => samples);
  const otherEdgePathBounds = state.orderedEdges
    .map((otherEdge, index) => otherEdge.id === edge.id ? undefined : state.routeBounds[index] ?? null)
    .filter((bounds): bounds is PointBounds | null => bounds !== undefined);
  const relationMovesWithDraggedNode = draggedNodeId !== undefined
    && (edge.sourceId === draggedNodeId || edge.targetId === draggedNodeId);
  const occupiedRelationLabelPrefixFingerprint = placementTraceSink ? JSON.stringify(state.occupiedLabels) : "";
  const routeFingerprint = placementTraceSink ? JSON.stringify({ path: edge.path, samples: edge.samples, labelPoint: edge.labelPoint, controlPoint: edge.controlPoint }) : "";
  const inputFingerprint = placementTraceSink ? JSON.stringify({ route: routeFingerprint, label: edge.label, occupiedLabels: state.occupiedLabels, nodes: state.nodePoints, otherEdgePaths, previousPlacement: relationMovesWithDraggedNode ? undefined : previousPlacements.get(edge.id), manualAnchor: manualAnchors.get(edge.id) }) : "";
  let placementTrace: LabelPlacementTrace | undefined;
  const automaticPlacement = placeEdgeLabel(
    edge.samples,
    edge.label,
    state.occupiedLabels,
    state.nodePoints,
    otherEdgePaths,
    relationMovesWithDraggedNode ? undefined : previousPlacements.get(edge.id),
    profile,
    placementTraceSink ? (trace) => { placementTrace = trace; } : undefined,
    otherEdgePathBounds,
    relationLabelStaggerById?.[edge.id] ?? 0,
  );
  const manualAnchor = manualAnchors.get(edge.id);
  if (manualAnchor && profile) profile.manualAnchorReconstructions += 1;
  const placement = manualAnchor
    ? { ...automaticPlacement, ...reconstructManualRelationLabelTarget(edge.samples, manualAnchor) }
    : automaticPlacement;
  placementTraceSink?.({
    pass: state.input.pass ?? "first",
    relationId: edge.id,
    processingIndex,
    routeFingerprint,
    inputFingerprint,
    occupiedRelationLabelPrefixFingerprint,
    candidateFingerprint: placementTrace?.candidateFingerprint ?? "",
    selectedPlacementFingerprint: JSON.stringify(placement),
  });
  state.occupiedLabels.push(placement);
  state.result.set(edge.id, placement);
  state.done = state.nextIndex >= state.orderedEdges.length;
  return { done: state.done, relationId: edge.id, placement };
}

export function completeAutomaticRelationLabelPlacement(state: AutomaticRelationLabelAccumulator): Map<string, LabelRect> {
  if (!state.done) throw new Error("Relation-label placement cannot be completed before all routed edges are processed");
  const result = new Map(state.result);
  const finite = (value: LabelRect) => [value.x, value.y, value.width, value.height, value.directionX, value.directionY].every(Number.isFinite);
  if ([...result.values()].some((value) => !finite(value))) throw new Error("Relation-label placement contains non-finite geometry");
  return result;
}

/** Pure Product-owned automatic Relation-label orchestration. App state arrives as snapshots. */
export function deriveAutomaticRelationLabels(input: AutomaticRelationLabelInput): Map<string, LabelRect> {
  const state = initializeAutomaticRelationLabelPlacement(input);
  while (!state.done) stepAutomaticRelationLabelPlacement(state);
  return completeAutomaticRelationLabelPlacement(state);
}

/** Initializes the immutable Node-label inputs and ordered mutable prefix state. */
export function initializeAutomaticNodeLabelPlacement(input: AutomaticNodeLabelInput): AutomaticNodeLabelAccumulator {
  const normalizedInput = { ...input, yieldingRoutes: input.yieldingRoutes ?? [], pass: input.pass ?? "first" };
  const orderedNodes = [...normalizedInput.nodes];
  const positions = { ...normalizedInput.positions };
  const initialRelationLabels = Array.from(normalizedInput.occupiedRelationLabels.values());
  const occupiedLabels = [...initialRelationLabels];
  const edgePaths = normalizedInput.routedEdges.map(({ samples }) => samples).filter(({ length }) => length > 0);
  const boundsStartedAt = performance.now();
  const edgePathBounds = edgePaths.map((path) => pointBounds(path));
  const yieldingRouteBounds = normalizedInput.yieldingRoutes.map((route) => pointBounds(route.samples));
  if (normalizedInput.profile) {
    normalizedInput.profile.pathBoundsPrecomputationMs += performance.now() - boundsStartedAt;
    normalizedInput.profile.pathBoundsBuildCount += edgePaths.length + normalizedInput.yieldingRoutes.length;
    normalizedInput.profile.pathBoundsPointVisits += edgePaths.reduce((total, path) => total + path.length, 0)
      + normalizedInput.yieldingRoutes.reduce((total, route) => total + route.samples.length, 0);
  }
  return {
    input: normalizedInput,
    orderedNodes,
    nextIndex: 0,
    initialRelationLabels,
    occupiedLabels,
    acceptedNodeLabels: [],
    result: new Map(),
    positions,
    edgePaths,
    edgePathBounds,
    yieldingRouteBounds,
    done: orderedNodes.length === 0,
  };
}

/** Processes exactly one input-order Node-label decision. */
export function stepAutomaticNodeLabelPlacement(state: AutomaticNodeLabelAccumulator): { done: boolean; nodeId?: string; placement?: LabelRect } {
  if (state.done) return { done: true };
  const node = state.orderedNodes[state.nextIndex];
  if (!node) {
    state.done = true;
    return { done: true };
  }
  const processingIndex = state.nextIndex;
  state.nextIndex += 1;
  const { previousPlacements, manualOffsets, activelyDraggedNodeId, profile, placementTraceSink } = state.input;
  const position = state.positions[node.id] ?? node;
  const otherNodes = state.orderedNodes.filter(({ id }) => id !== node.id).map((other) => state.positions[other.id] ?? other);
  const occupiedLabelPrefixFingerprint = placementTraceSink ? JSON.stringify(state.occupiedLabels) : "";
  const routeSetFingerprint = placementTraceSink ? JSON.stringify(state.edgePaths) : "";
  const yieldingRouteFingerprint = placementTraceSink ? JSON.stringify(state.input.yieldingRoutes) : "";
  const inputFingerprint = placementTraceSink ? JSON.stringify({ node: { x: position.x, y: position.y }, name: node.label, description: node.description, occupiedLabels: state.occupiedLabels, otherNodes, edgePaths: state.edgePaths, previousPlacement: activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id), yieldingRoutes: state.input.yieldingRoutes, manualOffset: manualOffsets.get(node.id) }) : "";
  let placementTrace: LabelPlacementTrace | undefined;
  const automaticPlacement = placeNodeLabel(
    position,
    node.label,
    node.description,
    state.occupiedLabels,
    otherNodes,
    state.edgePaths,
    activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id),
    state.input.yieldingRoutes,
    profile,
    placementTraceSink ? (trace) => { placementTrace = trace; } : undefined,
    state.edgePathBounds,
    state.yieldingRouteBounds,
  );
  const manualOffset = manualOffsets.get(node.id);
  const placement = manualOffset
    ? { ...automaticPlacement, x: position.x + manualOffset.x, y: position.y + manualOffset.y }
    : automaticPlacement;
  placementTraceSink?.({
    pass: state.input.pass ?? "first",
    nodeId: node.id,
    processingIndex,
    inputFingerprint,
    positionFingerprint: JSON.stringify(position),
    occupiedLabelPrefixFingerprint,
    routeSetFingerprint,
    yieldingRouteFingerprint,
    candidateFingerprint: placementTrace?.candidateFingerprint ?? "",
    selectedPlacementFingerprint: JSON.stringify(placement),
  });
  state.occupiedLabels.push(placement);
  state.acceptedNodeLabels.push(placement);
  state.result.set(node.id, placement);
  state.done = state.nextIndex >= state.orderedNodes.length;
  return { done: state.done, nodeId: node.id, placement };
}

export function completeAutomaticNodeLabelPlacement(state: AutomaticNodeLabelAccumulator): Map<string, LabelRect> {
  if (!state.done) throw new Error("Node-label placement cannot be completed before all Nodes are processed");
  const result = new Map(state.result);
  const finite = (value: LabelRect) => [value.x, value.y, value.width, value.height, value.directionX, value.directionY].every(Number.isFinite);
  if ([...result.values()].some((value) => !finite(value))) throw new Error("Node-label placement contains non-finite geometry");
  return result;
}

/** Pure Product-owned automatic Node-label orchestration. App state arrives as snapshots. */
export function deriveAutomaticNodeLabels(input: AutomaticNodeLabelInput): Map<string, LabelRect> {
  const state = initializeAutomaticNodeLabelPlacement(input);
  while (!state.done) stepAutomaticNodeLabelPlacement(state);
  return completeAutomaticNodeLabelPlacement(state);
}

export type BoundedAutomaticPresentationInput = {
  graph: { nodes: readonly GraphNode[]; edges: readonly RoutingGraphEdge[] };
  positions: Readonly<Record<string, Point>>;
  edgeCurveOffsets: Readonly<Record<string, number>>;
  selfLoopOverrides: Readonly<Record<string, SelfLoopOverride>>;
  provisionalNodeLabels: readonly LabelRect[];
  previousNodeLabelPlacements: ReadonlyMap<string, LabelRect>;
  previousRelationLabelPlacements: ReadonlyMap<string, LabelRect>;
  manualNodeLabelOffsets: ReadonlyMap<string, ManualNodeLabelOffset>;
  manualRelationLabelAnchors: ReadonlyMap<string, ManualRelationLabelAnchor>;
  previousAutomaticRoutes?: ReadonlyMap<string, DerivedAutomaticRoute>;
  draggedNodeId?: string;
  activeDraggedNodeId?: string;
  /** See AutomaticRoutingInput.preserveSafeIncidentPreviousRoute. */
  preserveSafeIncidentPreviousRoute?: boolean;
  activelyDraggedNodeId?: string;
  continuityNodeLabels?: readonly LabelRect[];
  previousContinuityNodeLabels?: ReadonlyMap<string, LabelRect>;
  feedbackEnabled?: boolean;
  routeDecisionSink?: (decision: AutomaticRouteDecision) => void;
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  routeTraceSink?: (trace: AutomaticRouteTrace) => void;
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  relationLabelTraceSink?: (trace: AutomaticRelationLabelTrace) => void;
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  nodeLabelTraceSink?: (trace: AutomaticNodeLabelTrace) => void;
  /** Opt-in exact input/output dependency fingerprints; omitted by Product callers. */
  presentationDependencySink?: (trace: PresentationDependencyTrace) => void;
  /** Opt-in candidate-generation cache; arbitration remains uncached. */
  candidateCache?: RouteCandidateCache;
  /** Opt-in exact endpoint/offset geometry cache; route arbitration remains uncached. */
  geometryCache?: RouteGeometryCache;
  /** Development-only automatic parallel-group spacing; omitted by normal Product callers. */
  parallelBundleSpacing?: number;
  /** Development-only per-bundle override keyed by sorted endpoint IDs. */
  parallelBundleSpacingByKey?: Readonly<Record<string, number>>;
  /** Development-only arc-length label staggering by Relation ID. */
  relationLabelStaggerById?: Readonly<Record<string, number>>;
  /** Development-only slot policy for parallel-group spacing. */
  parallelBundleMode?: "pair" | "bundle" | "corridor";
  /** Opt-in diagnostic timings/counters; omitted by normal Product callers. */
  profiler?: AutomaticPresentationProfiler;
  /** Diagnostic-only replay input for the first canonical route pass. */
  replayPrefix?: AutomaticRoutingInput["replayPrefix"];
  replayPrefixSink?: (edgeIds: readonly string[]) => void;
  presentationPassSink?: (
    snapshot: PresentationPassSnapshot,
  ) => void;
};

export type BoundedAutomaticPresentation = {
  routedEdges: DerivedAutomaticRoute[];
  relationLabels: Map<string, LabelRect>;
  nodeLabels: Map<string, LabelRect>;
  feedbackApplied: boolean;
};

export type AutomaticPresentationVerificationPhase =
  | "label-free-route"
  | "initialize-first-route"
  | "first-route"
  | "initialize-first-relation-label"
  | "first-relation-label"
  | "initialize-first-node-label"
  | "first-node-label"
  | "prepare-feedback"
  | "initialize-feedback-route"
  | "feedback-route"
  | "initialize-feedback-relation-label"
  | "feedback-relation-label"
  | "initialize-feedback-node-label"
  | "feedback-node-label"
  | "finalize"
  | "completed";

export type AutomaticPresentationVerificationStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "budget-exhausted"
  | "verification-failed";

export type AutomaticPresentationVerificationStep = Readonly<{
  phase: AutomaticPresentationVerificationPhase;
  kind: "work-unit" | "phase-transition" | "finalize";
  elapsedMs: number;
  completedWorkUnits: number;
  completedPhaseTransitions: number;
}>;

export type AutomaticPresentationVerificationAccumulator = {
  input: BoundedAutomaticPresentationInput;
  nodes: Point[];
  phase: AutomaticPresentationVerificationPhase;
  status: AutomaticPresentationVerificationStatus;
  cancelRequested: boolean;
  initializationMs: number;
  scheduledStepCount: number;
  completedWorkUnits: number;
  completedPhaseTransitions: number;
  steps: AutomaticPresentationVerificationStep[];
  labelFreeRoute: AutomaticRouteSelectionAccumulator | null;
  firstRoute: AutomaticRouteSelectionAccumulator | null;
  firstRelationLabel: AutomaticRelationLabelAccumulator | null;
  firstNodeLabel: AutomaticNodeLabelAccumulator | null;
  firstRelationLabels: Map<string, LabelRect> | null;
  firstNodeLabels: Map<string, LabelRect> | null;
  feedbackRoute: AutomaticRouteSelectionAccumulator | null;
  feedbackRelationLabel: AutomaticRelationLabelAccumulator | null;
  feedbackNodeLabel: AutomaticNodeLabelAccumulator | null;
  feedbackRelationLabels: Map<string, LabelRect> | null;
  feedbackNodeLabels: Map<string, LabelRect> | null;
  labelFreeSnapshot: ReturnType<typeof createRouteSelectionSnapshot> | null;
  firstSnapshot: PresentationPassSnapshot | null;
  feedbackSnapshot: PresentationPassSnapshot | null;
  firstYieldingRoutes: RouteYieldPath[];
  feedbackYieldingRoutes: RouteYieldPath[];
  feedbackApplied: boolean;
  result: BoundedAutomaticPresentation | null;
  failureReason?: string;
  passStartedAt: Record<"label-free" | "first" | "feedback", number | null>;
  relationLabelStartedAt: Record<"first" | "feedback", number | null>;
  nodeLabelStartedAt: Record<"first" | "feedback", number | null>;
};

function labelGeometryMoved(left: LabelRect | undefined, right: LabelRect | undefined): boolean {
  if (!left || !right) return left !== right;
  return Math.abs(left.x - right.x) > 0.5
    || Math.abs(left.y - right.y) > 0.5
    || Math.abs(left.width - right.width) > 0.5
    || Math.abs(left.height - right.height) > 0.5;
}

function routeLength(samples: readonly Point[]): number {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(
    point.x - samples[index]!.x,
    point.y - samples[index]!.y,
  ), 0);
}

function routeDeviation(left: readonly Point[], right: readonly Point[]): number {
  const sampleCount = Math.min(left.length, right.length);
  if (sampleCount === 0) return 0;
  return left.slice(0, sampleCount).reduce((total, point, index) => total + Math.hypot(
    point.x - right[index]!.x,
    point.y - right[index]!.y,
  ), 0) / sampleCount;
}

/** Derives the immutable route geometry that Node-label placement must yield to. */
export function deriveYieldingRoutesForPresentation(
  labelFreeRoutes: readonly DerivedAutomaticRoute[],
  routes: readonly DerivedAutomaticRoute[],
): RouteYieldPath[] {
  const labelFreeById = new Map(labelFreeRoutes.map((route) => [route.id, route]));
  return routes.flatMap((route) => {
    const labelFreeRoute = labelFreeById.get(route.id);
    if (!labelFreeRoute || compareRouteGeometry(route.samples, labelFreeRoute.samples).equivalent) return [];
    const deviation = routeDeviation(route.samples, labelFreeRoute.samples);
    return deviation >= 12 ? [{ samples: labelFreeRoute.samples, deviation }] : [];
  });
}

function verificationRouteInput(
  state: AutomaticPresentationVerificationAccumulator,
  provisionalNodeLabels: readonly LabelRect[],
  pass: AutomaticRouteDecision["pass"],
): AutomaticRoutingInput {
  const input = state.input;
  return {
    graph: input.graph,
    positions: input.positions,
    edgeCurveOffsets: input.edgeCurveOffsets,
    selfLoopOverrides: input.selfLoopOverrides,
    provisionalNodeLabels,
    continuityNodeLabels: pass === "label-free" ? undefined : input.continuityNodeLabels,
    previousContinuityNodeLabels: pass === "label-free" ? undefined : input.previousContinuityNodeLabels,
    previousAutomaticRoutes: pass === "label-free" ? undefined : input.previousAutomaticRoutes,
    draggedNodeId: pass === "label-free" ? undefined : input.draggedNodeId,
    activeDraggedNodeId: pass === "label-free" ? undefined : input.activeDraggedNodeId,
    preserveSafeIncidentPreviousRoute: pass === "label-free" ? undefined : input.preserveSafeIncidentPreviousRoute,
    routeDecisionSink: input.routeDecisionSink,
    routeTraceSink: input.routeTraceSink,
    candidateCache: input.candidateCache,
    geometryCache: input.geometryCache,
    parallelBundleSpacing: input.parallelBundleSpacing,
    parallelBundleSpacingByKey: input.parallelBundleSpacingByKey,
    parallelBundleMode: input.parallelBundleMode ?? "bundle",
    profiler: input.profiler,
    routeDecisionPass: pass,
    replayPrefix: pass === "first" ? input.replayPrefix : undefined,
    replayPrefixSink: pass === "first" ? input.replayPrefixSink : undefined,
  };
}

function verificationRelationLabelInput(
  state: AutomaticPresentationVerificationAccumulator,
  routedEdges: readonly DerivedAutomaticRoute[],
  pass: "first" | "feedback",
): AutomaticRelationLabelInput {
  const input = state.input;
  return {
    routedEdges,
    nodes: state.nodes,
    previousPlacements: input.previousRelationLabelPlacements,
    manualAnchors: input.manualRelationLabelAnchors,
    relationLabelStaggerById: input.relationLabelStaggerById,
    draggedNodeId: input.draggedNodeId,
    profile: input.profiler?.passes[pass].relationLabel,
    pass,
    placementTraceSink: input.relationLabelTraceSink,
  };
}

function verificationNodeLabelInput(
  state: AutomaticPresentationVerificationAccumulator,
  routedEdges: readonly DerivedAutomaticRoute[],
  relationLabels: ReadonlyMap<string, LabelRect>,
  yieldingRoutes: readonly RouteYieldPath[],
  pass: "first" | "feedback",
): AutomaticNodeLabelInput {
  const input = state.input;
  return {
    nodes: input.graph.nodes,
    positions: input.positions,
    routedEdges,
    occupiedRelationLabels: relationLabels,
    previousPlacements: input.previousNodeLabelPlacements,
    manualOffsets: input.manualNodeLabelOffsets,
    activelyDraggedNodeId: input.activelyDraggedNodeId,
    yieldingRoutes,
    profile: input.profiler?.passes[pass].nodeLabel,
    pass,
    placementTraceSink: input.nodeLabelTraceSink,
  };
}

function reportVerificationDependency(
  state: AutomaticPresentationVerificationAccumulator,
  stage: PresentationDependencyTrace["stage"],
  pass: PresentationDependencyTrace["pass"],
  input: unknown,
  output: unknown,
) {
  state.input.presentationDependencySink?.({
    stage,
    pass,
    input: dependencyFingerprint(input),
    output: dependencyFingerprint(output),
  });
}

function firstFinalRouteLabels(state: AutomaticPresentationVerificationAccumulator): LabelRect[] {
  if (!state.firstSnapshot) return [];
  return state.input.graph.nodes
    .map((node, index) => state.firstSnapshot!.nodeLabel.labels.get(node.id) ?? state.input.provisionalNodeLabels[index])
    .filter((label): label is LabelRect => label !== undefined);
}

function closePassTiming(state: AutomaticPresentationVerificationAccumulator, pass: "label-free" | "first" | "feedback") {
  const startedAt = state.passStartedAt[pass];
  if (startedAt !== null && state.input.profiler) state.input.profiler.passes[pass].elapsedMs += performance.now() - startedAt;
  state.passStartedAt[pass] = null;
}

function closeRelationLabelTiming(state: AutomaticPresentationVerificationAccumulator, pass: "first" | "feedback") {
  const startedAt = state.relationLabelStartedAt[pass];
  if (startedAt !== null && state.input.profiler) state.input.profiler.passes[pass].relationLabelMs += performance.now() - startedAt;
  state.relationLabelStartedAt[pass] = null;
}

function closeNodeLabelTiming(state: AutomaticPresentationVerificationAccumulator, pass: "first" | "feedback") {
  const startedAt = state.nodeLabelStartedAt[pass];
  if (startedAt !== null && state.input.profiler) state.input.profiler.passes[pass].nodeLabelMs += performance.now() - startedAt;
  state.nodeLabelStartedAt[pass] = null;
}

function finishPresentationPass(
  state: AutomaticPresentationVerificationAccumulator,
  pass: "first" | "feedback",
  routedEdges: readonly DerivedAutomaticRoute[],
  relationLabels: ReadonlyMap<string, LabelRect>,
  nodeLabels: ReadonlyMap<string, LabelRect>,
  yieldingRoutes: readonly RouteYieldPath[],
) {
  const snapshot = createPresentationPassSnapshot(
    createRouteSelectionSnapshot(pass, routedEdges),
    relationLabels,
    nodeLabels,
    yieldingRoutes,
  );
  if (pass === "first") state.firstSnapshot = snapshot;
  else state.feedbackSnapshot = snapshot;
  state.input.presentationPassSink?.(snapshot);
  closeNodeLabelTiming(state, pass);
  closePassTiming(state, pass);
}

/** Initializes the complete Product-authoritative verification dependency graph. */
export function initializeAutomaticPresentationVerification(
  input: BoundedAutomaticPresentationInput,
): AutomaticPresentationVerificationAccumulator {
  const startedAt = performance.now();
  const state: AutomaticPresentationVerificationAccumulator = {
    input,
    nodes: input.graph.nodes.map((node) => input.positions[node.id] ?? node),
    phase: "label-free-route",
    status: "running",
    cancelRequested: false,
    initializationMs: 0,
    scheduledStepCount: 0,
    completedWorkUnits: 0,
    completedPhaseTransitions: 0,
    steps: [],
    labelFreeRoute: null,
    firstRoute: null,
    firstRelationLabel: null,
    firstNodeLabel: null,
    firstRelationLabels: null,
    firstNodeLabels: null,
    feedbackRoute: null,
    feedbackRelationLabel: null,
    feedbackNodeLabel: null,
    feedbackRelationLabels: null,
    feedbackNodeLabels: null,
    labelFreeSnapshot: null,
    firstSnapshot: null,
    feedbackSnapshot: null,
    firstYieldingRoutes: [],
    feedbackYieldingRoutes: [],
    feedbackApplied: false,
    result: null,
    passStartedAt: { "label-free": startedAt, first: null, feedback: null },
    relationLabelStartedAt: { first: null, feedback: null },
    nodeLabelStartedAt: { first: null, feedback: null },
  };
  state.labelFreeRoute = initializeAutomaticRouteSelection(verificationRouteInput(state, [], "label-free"));
  state.initializationMs = performance.now() - startedAt;
  return state;
}

/** Requests cancellation at the next complete work-unit boundary. */
export function requestAutomaticPresentationVerificationCancellation(
  state: AutomaticPresentationVerificationAccumulator,
): AutomaticPresentationVerificationAccumulator {
  if (state.status === "running") state.cancelRequested = true;
  return state;
}

/** Advances exactly one route/label unit, phase transition, or finalization unit. */
export function stepAutomaticPresentationVerification(
  state: AutomaticPresentationVerificationAccumulator,
): AutomaticPresentationVerificationAccumulator {
  if (state.status !== "running") return state;
  if (state.cancelRequested) {
    state.status = "cancelled";
    return state;
  }
  const phase = state.phase;
  const startedAt = performance.now();
  let kind: AutomaticPresentationVerificationStep["kind"] = "phase-transition";
  try {
    switch (phase) {
      case "label-free-route": {
        kind = "work-unit";
        const step = stepAutomaticRouteSelection(state.labelFreeRoute!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const routes = completeAutomaticRouteSelection(state.labelFreeRoute!);
          state.labelFreeSnapshot = createRouteSelectionSnapshot("label-free", routes);
          reportVerificationDependency(state, "route-selection", "label-free", {
            graph: state.input.graph,
            positions: state.input.positions,
            edgeCurveOffsets: state.input.edgeCurveOffsets,
            selfLoopOverrides: state.input.selfLoopOverrides,
            provisionalNodeLabels: [],
            parallelBundleSpacing: state.input.parallelBundleSpacing,
            parallelBundleSpacingByKey: state.input.parallelBundleSpacingByKey,
            parallelBundleMode: state.input.parallelBundleMode ?? "bundle",
            routeDecisionPass: "label-free",
          }, { routes: state.labelFreeSnapshot.routes });
          closePassTiming(state, "label-free");
          state.phase = "initialize-first-route";
        }
        break;
      }
      case "initialize-first-route":
        state.passStartedAt.first = performance.now();
        state.firstRoute = initializeAutomaticRouteSelection(verificationRouteInput(state, state.input.provisionalNodeLabels, "first"));
        state.phase = "first-route";
        break;
      case "first-route": {
        kind = "work-unit";
        const step = stepAutomaticRouteSelection(state.firstRoute!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const routes = completeAutomaticRouteSelection(state.firstRoute!);
          const snapshot = createRouteSelectionSnapshot("first", routes);
          reportVerificationDependency(state, "route-selection", "first", {
            graph: state.input.graph,
            positions: state.input.positions,
            edgeCurveOffsets: state.input.edgeCurveOffsets,
            selfLoopOverrides: state.input.selfLoopOverrides,
            provisionalNodeLabels: state.input.provisionalNodeLabels,
            continuityNodeLabels: state.input.continuityNodeLabels,
            previousContinuityNodeLabels: state.input.previousContinuityNodeLabels,
            previousAutomaticRoutes: state.input.previousAutomaticRoutes,
            draggedNodeId: state.input.draggedNodeId,
            activeDraggedNodeId: state.input.activeDraggedNodeId,
            preserveSafeIncidentPreviousRoute: state.input.preserveSafeIncidentPreviousRoute,
            parallelBundleSpacing: state.input.parallelBundleSpacing,
            parallelBundleSpacingByKey: state.input.parallelBundleSpacingByKey,
            parallelBundleMode: state.input.parallelBundleMode ?? "bundle",
            routeDecisionPass: "first",
            replayPrefix: state.input.replayPrefix,
          }, { routes: snapshot.routes });
          state.phase = "initialize-first-relation-label";
        }
        break;
      }
      case "initialize-first-relation-label":
        state.relationLabelStartedAt.first = performance.now();
        state.firstRelationLabel = initializeAutomaticRelationLabelPlacement(verificationRelationLabelInput(state, completeAutomaticRouteSelection(state.firstRoute!), "first"));
        state.phase = "first-relation-label";
        break;
      case "first-relation-label": {
        kind = "work-unit";
        const step = stepAutomaticRelationLabelPlacement(state.firstRelationLabel!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const labels = completeAutomaticRelationLabelPlacement(state.firstRelationLabel!);
          reportVerificationDependency(state, "relation-label", "first", {
            pass: "first",
            routedEdges: completeAutomaticRouteSelection(state.firstRoute!),
            nodes: state.nodes,
            previousPlacements: state.input.previousRelationLabelPlacements,
            manualAnchors: state.input.manualRelationLabelAnchors,
            relationLabelStaggerById: state.input.relationLabelStaggerById,
            draggedNodeId: state.input.draggedNodeId,
          }, { labels });
          closeRelationLabelTiming(state, "first");
          state.phase = "initialize-first-node-label";
          state.firstRelationLabels = labels;
        }
        break;
      }
      case "initialize-first-node-label":
        state.firstYieldingRoutes = deriveYieldingRoutesForPresentation(state.labelFreeSnapshot!.routes, completeAutomaticRouteSelection(state.firstRoute!));
        state.nodeLabelStartedAt.first = performance.now();
        state.firstNodeLabel = initializeAutomaticNodeLabelPlacement(verificationNodeLabelInput(state, completeAutomaticRouteSelection(state.firstRoute!), state.firstRelationLabels!, state.firstYieldingRoutes, "first"));
        state.phase = "first-node-label";
        break;
      case "first-node-label": {
        kind = "work-unit";
        const step = stepAutomaticNodeLabelPlacement(state.firstNodeLabel!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const labels = completeAutomaticNodeLabelPlacement(state.firstNodeLabel!);
          reportVerificationDependency(state, "node-label", "first", {
            pass: "first",
            nodes: state.input.graph.nodes,
            positions: state.input.positions,
            routedEdges: completeAutomaticRouteSelection(state.firstRoute!),
            occupiedRelationLabels: state.firstRelationLabels,
            previousPlacements: state.input.previousNodeLabelPlacements,
            manualOffsets: state.input.manualNodeLabelOffsets,
            activelyDraggedNodeId: state.input.activelyDraggedNodeId,
            yieldingRoutes: state.firstYieldingRoutes,
          }, { labels, yieldingRoutes: state.firstYieldingRoutes });
          finishPresentationPass(state, "first", completeAutomaticRouteSelection(state.firstRoute!), state.firstRelationLabels!, labels, state.firstYieldingRoutes);
          state.firstNodeLabels = labels;
          state.phase = "prepare-feedback";
        }
        break;
      }
      case "prepare-feedback": {
        const finalRouteLabels = firstFinalRouteLabels(state);
        const feedbackInput: FeedbackStageInput = createFeedbackStageInput(
          state.labelFreeSnapshot!,
          state.firstSnapshot!,
          finalRouteLabels,
          state.input.feedbackEnabled !== false
            && finalRouteLabels.length === state.input.graph.nodes.length
            && finalRouteLabels.some((label, index) => labelGeometryMoved(state.input.provisionalNodeLabels[index], label)),
        );
        state.feedbackApplied = feedbackInput.shouldRun;
        reportVerificationDependency(state, "feedback", "feedback", feedbackInput, { shouldRun: feedbackInput.shouldRun });
        state.phase = feedbackInput.shouldRun ? "initialize-feedback-route" : "finalize";
        break;
      }
      case "initialize-feedback-route": {
        state.passStartedAt.feedback = performance.now();
        state.feedbackRoute = initializeAutomaticRouteSelection(verificationRouteInput(state, firstFinalRouteLabels(state), "feedback"));
        state.phase = "feedback-route";
        break;
      }
      case "feedback-route": {
        kind = "work-unit";
        const step = stepAutomaticRouteSelection(state.feedbackRoute!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const routes = completeAutomaticRouteSelection(state.feedbackRoute!);
          const snapshot = createRouteSelectionSnapshot("feedback", routes);
          reportVerificationDependency(state, "route-selection", "feedback", {
            graph: state.input.graph,
            positions: state.input.positions,
            edgeCurveOffsets: state.input.edgeCurveOffsets,
            selfLoopOverrides: state.input.selfLoopOverrides,
            provisionalNodeLabels: firstFinalRouteLabels(state),
            continuityNodeLabels: state.input.continuityNodeLabels,
            previousContinuityNodeLabels: state.input.previousContinuityNodeLabels,
            previousAutomaticRoutes: state.input.previousAutomaticRoutes,
            draggedNodeId: state.input.draggedNodeId,
            activeDraggedNodeId: state.input.activeDraggedNodeId,
            preserveSafeIncidentPreviousRoute: state.input.preserveSafeIncidentPreviousRoute,
            parallelBundleSpacing: state.input.parallelBundleSpacing,
            parallelBundleSpacingByKey: state.input.parallelBundleSpacingByKey,
            parallelBundleMode: state.input.parallelBundleMode ?? "bundle",
            routeDecisionPass: "feedback",
            replayPrefix: undefined,
          }, { routes: snapshot.routes });
          state.phase = "initialize-feedback-relation-label";
        }
        break;
      }
      case "initialize-feedback-relation-label":
        state.relationLabelStartedAt.feedback = performance.now();
        state.feedbackRelationLabel = initializeAutomaticRelationLabelPlacement(verificationRelationLabelInput(state, completeAutomaticRouteSelection(state.feedbackRoute!), "feedback"));
        state.phase = "feedback-relation-label";
        break;
      case "feedback-relation-label": {
        kind = "work-unit";
        const step = stepAutomaticRelationLabelPlacement(state.feedbackRelationLabel!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const labels = completeAutomaticRelationLabelPlacement(state.feedbackRelationLabel!);
          reportVerificationDependency(state, "relation-label", "feedback", {
            pass: "feedback",
            routedEdges: completeAutomaticRouteSelection(state.feedbackRoute!),
            nodes: state.nodes,
            previousPlacements: state.input.previousRelationLabelPlacements,
            manualAnchors: state.input.manualRelationLabelAnchors,
            relationLabelStaggerById: state.input.relationLabelStaggerById,
            draggedNodeId: state.input.draggedNodeId,
          }, { labels });
          closeRelationLabelTiming(state, "feedback");
          state.feedbackRelationLabels = labels;
          state.phase = "initialize-feedback-node-label";
        }
        break;
      }
      case "initialize-feedback-node-label":
        state.feedbackYieldingRoutes = deriveYieldingRoutesForPresentation(state.labelFreeSnapshot!.routes, completeAutomaticRouteSelection(state.feedbackRoute!));
        state.nodeLabelStartedAt.feedback = performance.now();
        state.feedbackNodeLabel = initializeAutomaticNodeLabelPlacement(verificationNodeLabelInput(state, completeAutomaticRouteSelection(state.feedbackRoute!), state.feedbackRelationLabels!, state.feedbackYieldingRoutes, "feedback"));
        state.phase = "feedback-node-label";
        break;
      case "feedback-node-label": {
        kind = "work-unit";
        const step = stepAutomaticNodeLabelPlacement(state.feedbackNodeLabel!);
        state.completedWorkUnits += 1;
        if (step.done) {
          const labels = completeAutomaticNodeLabelPlacement(state.feedbackNodeLabel!);
          reportVerificationDependency(state, "node-label", "feedback", {
            pass: "feedback",
            nodes: state.input.graph.nodes,
            positions: state.input.positions,
            routedEdges: completeAutomaticRouteSelection(state.feedbackRoute!),
            occupiedRelationLabels: state.feedbackRelationLabels,
            previousPlacements: state.input.previousNodeLabelPlacements,
            manualOffsets: state.input.manualNodeLabelOffsets,
            activelyDraggedNodeId: state.input.activelyDraggedNodeId,
            yieldingRoutes: state.feedbackYieldingRoutes,
          }, { labels, yieldingRoutes: state.feedbackYieldingRoutes });
          finishPresentationPass(state, "feedback", completeAutomaticRouteSelection(state.feedbackRoute!), state.feedbackRelationLabels!, labels, state.feedbackYieldingRoutes);
          state.feedbackNodeLabels = labels;
          state.phase = "finalize";
        }
        break;
      }
      case "finalize": {
        kind = "finalize";
        const snapshot = state.feedbackSnapshot ?? state.firstSnapshot;
        if (!snapshot) throw new Error("presentation verification has no completed pass");
        state.result = {
          routedEdges: [...snapshot.route.routes],
          relationLabels: new Map(snapshot.relationLabel.labels),
          nodeLabels: new Map(snapshot.nodeLabel.labels),
          feedbackApplied: state.feedbackApplied,
        };
        state.status = "completed";
        state.phase = "completed";
        break;
      }
      case "completed":
        return state;
    }
  } catch (error) {
    state.status = "verification-failed";
    state.failureReason = error instanceof Error ? error.message : String(error);
    state.result = null;
  }
  state.scheduledStepCount += 1;
  const elapsedMs = performance.now() - startedAt;
  if (kind === "work-unit") state.completedWorkUnits += 0;
  else state.completedPhaseTransitions += 1;
  state.steps.push({
    phase,
    kind,
    elapsedMs,
    completedWorkUnits: state.completedWorkUnits,
    completedPhaseTransitions: state.completedPhaseTransitions,
  });
  return state;
}

/** Drains the verification accumulator without publishing an incomplete result. */
export function completeAutomaticPresentationVerification(
  state: AutomaticPresentationVerificationAccumulator,
): BoundedAutomaticPresentation {
  if (state.status !== "completed" || !state.result) {
    throw new Error(`presentation verification is not complete: ${state.status}`);
  }
  return state.result;
}

export function runAutomaticPresentationVerification(
  input: BoundedAutomaticPresentationInput,
  options: { maxSteps?: number } = {},
): AutomaticPresentationVerificationAccumulator {
  const state = initializeAutomaticPresentationVerification(input);
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
  while (state.status === "running" && state.scheduledStepCount < maxSteps) stepAutomaticPresentationVerification(state);
  if (state.status === "running") state.status = "budget-exhausted";
  return state;
}

/**
 * Performs one deterministic label/routing feedback pass. The first pass
 * establishes relation labels and final Node labels from the existing
 * provisional route. If a final Node label moved, a single second pass uses
 * those final bounds as route obstacles. This is intentionally bounded: it
 * does not iterate toward a fixed point or take ownership from manual data.
 */
export function deriveBoundedAutomaticPresentation({
  graph,
  positions,
  edgeCurveOffsets,
  selfLoopOverrides,
  provisionalNodeLabels,
  previousNodeLabelPlacements,
  previousRelationLabelPlacements,
  manualNodeLabelOffsets,
  manualRelationLabelAnchors,
  previousAutomaticRoutes,
  draggedNodeId,
  activeDraggedNodeId,
  preserveSafeIncidentPreviousRoute,
  activelyDraggedNodeId,
  continuityNodeLabels,
  previousContinuityNodeLabels,
  feedbackEnabled = true,
  routeDecisionSink,
  routeTraceSink,
  relationLabelTraceSink,
  nodeLabelTraceSink,
  presentationDependencySink,
  candidateCache,
  geometryCache,
  parallelBundleSpacing,
  parallelBundleSpacingByKey,
  relationLabelStaggerById,
  parallelBundleMode = "bundle",
  profiler,
  replayPrefix,
  replayPrefixSink,
  presentationPassSink,
}: BoundedAutomaticPresentationInput): BoundedAutomaticPresentation {
  const nodes = graph.nodes.map((node) => positions[node.id] ?? node);
  const reportDependency = (
    stage: PresentationDependencyTrace["stage"],
    pass: PresentationDependencyTrace["pass"],
    input: unknown,
    output: unknown,
  ) => {
    if (!presentationDependencySink) return;
    presentationDependencySink({ stage, pass, input: dependencyFingerprint(input), output: dependencyFingerprint(output) });
  };
  // The label-free counterfactual depends only on graph geometry and manual
  // route authority. Reuse it when the bounded feedback pass is repeated;
  // recomputing it for each route-label snapshot adds cost without changing
  // the dependency result.
  const labelFreeStartedAt = performance.now();
  const labelFreeRouteInput = {
    graph,
    positions,
    edgeCurveOffsets,
    selfLoopOverrides,
    provisionalNodeLabels: [],
    parallelBundleSpacing,
    parallelBundleSpacingByKey,
    parallelBundleMode,
    routeDecisionPass: "label-free" as const,
  };
  const routesWithoutNodeLabels = deriveAutomaticRoutes({
    graph,
    positions,
    edgeCurveOffsets,
    selfLoopOverrides,
    provisionalNodeLabels: [],
    routeDecisionSink,
    candidateCache,
    geometryCache,
    profiler,
    routeTraceSink,
    routeDecisionPass: "label-free",
    parallelBundleSpacing,
    parallelBundleSpacingByKey,
    parallelBundleMode,
  });
  const labelFreeSnapshot = createRouteSelectionSnapshot("label-free", routesWithoutNodeLabels);
  reportDependency("route-selection", "label-free", labelFreeRouteInput, { routes: labelFreeSnapshot.routes });
  if (profiler) profiler.passes["label-free"].elapsedMs += performance.now() - labelFreeStartedAt;
  const derivePass = (routeLabels: readonly LabelRect[], routeDecisionPass: AutomaticRouteDecision["pass"]) => {
    const passProfile = profiler?.passes[routeDecisionPass];
    const passStartedAt = performance.now();
    const routeStageInput = {
      graph,
      positions,
      edgeCurveOffsets,
      selfLoopOverrides,
      provisionalNodeLabels: routeLabels,
      continuityNodeLabels,
      previousContinuityNodeLabels,
      previousAutomaticRoutes,
      draggedNodeId,
      activeDraggedNodeId,
      preserveSafeIncidentPreviousRoute,
      parallelBundleSpacing,
      parallelBundleSpacingByKey,
      parallelBundleMode,
      routeDecisionPass,
      replayPrefix: routeDecisionPass === "first" ? replayPrefix : undefined,
    };
    const routeSnapshot = createRouteSelectionSnapshot(routeDecisionPass, deriveAutomaticRoutes({
      graph,
      positions,
      edgeCurveOffsets,
      selfLoopOverrides,
      provisionalNodeLabels: routeLabels,
      continuityNodeLabels,
      previousContinuityNodeLabels,
      previousAutomaticRoutes,
      draggedNodeId,
      activeDraggedNodeId,
      preserveSafeIncidentPreviousRoute,
      candidateCache,
      geometryCache,
      profiler,
      routeDecisionSink,
      routeTraceSink,
      routeDecisionPass,
      replayPrefix: routeDecisionPass === "first" ? replayPrefix : undefined,
      replayPrefixSink: routeDecisionPass === "first" ? replayPrefixSink : undefined,
      parallelBundleSpacing,
      parallelBundleSpacingByKey,
      parallelBundleMode,
    }));
    reportDependency("route-selection", routeDecisionPass, routeStageInput, { routes: routeSnapshot.routes });
    const yieldingRoutes = deriveYieldingRoutesForPresentation(labelFreeSnapshot.routes, routeSnapshot.routes);
    const relationLabelStartedAt = performance.now();
    const relationLabelStageInput = {
      pass: routeDecisionPass,
      routedEdges: routeSnapshot.routes,
      nodes,
      previousPlacements: previousRelationLabelPlacements,
      manualAnchors: manualRelationLabelAnchors,
      relationLabelStaggerById,
      draggedNodeId,
    };
    const relationLabels = deriveAutomaticRelationLabels({
      routedEdges: routeSnapshot.routes,
      nodes,
      previousPlacements: previousRelationLabelPlacements,
      manualAnchors: manualRelationLabelAnchors,
      relationLabelStaggerById,
      draggedNodeId,
      profile: passProfile?.relationLabel,
      pass: routeDecisionPass,
      placementTraceSink: relationLabelTraceSink,
    });
    reportDependency("relation-label", routeDecisionPass, relationLabelStageInput, { labels: relationLabels });
    if (passProfile) passProfile.relationLabelMs += performance.now() - relationLabelStartedAt;
    const nodeLabelStartedAt = performance.now();
    const nodeLabelStageInput = {
      pass: routeDecisionPass,
      nodes: graph.nodes,
      positions,
      routedEdges: routeSnapshot.routes,
      occupiedRelationLabels: relationLabels,
      previousPlacements: previousNodeLabelPlacements,
      manualOffsets: manualNodeLabelOffsets,
      activelyDraggedNodeId,
      yieldingRoutes,
    };
    const nodeLabels = deriveAutomaticNodeLabels({
      nodes: graph.nodes,
      positions,
      routedEdges: routeSnapshot.routes,
      occupiedRelationLabels: relationLabels,
      previousPlacements: previousNodeLabelPlacements,
      manualOffsets: manualNodeLabelOffsets,
      activelyDraggedNodeId,
      yieldingRoutes,
      profile: passProfile?.nodeLabel,
      pass: routeDecisionPass,
      placementTraceSink: nodeLabelTraceSink,
    });
    reportDependency("node-label", routeDecisionPass, nodeLabelStageInput, { labels: nodeLabels, yieldingRoutes });
    if (passProfile) {
      passProfile.nodeLabelMs += performance.now() - nodeLabelStartedAt;
      passProfile.elapsedMs += performance.now() - passStartedAt;
    }
    const snapshot = createPresentationPassSnapshot(routeSnapshot, relationLabels, nodeLabels, yieldingRoutes);
    presentationPassSink?.(snapshot);
    return snapshot;
  };

  const first = derivePass(provisionalNodeLabels, "first");
  const finalRouteLabels = graph.nodes
    .map((node, index) => first.nodeLabel.labels.get(node.id) ?? provisionalNodeLabels[index])
    .filter((label): label is LabelRect => label !== undefined);
  const feedbackApplied = finalRouteLabels.length === graph.nodes.length
    && finalRouteLabels.some((label, index) => labelGeometryMoved(provisionalNodeLabels[index], label));
  const feedbackInput: FeedbackStageInput = createFeedbackStageInput(
    labelFreeSnapshot,
    first,
    finalRouteLabels,
    feedbackEnabled && feedbackApplied,
  );
  reportDependency("feedback", "feedback", feedbackInput, { shouldRun: feedbackInput.shouldRun });
  const result = feedbackInput.shouldRun ? derivePass(feedbackInput.finalRouteLabels, "feedback") : feedbackInput.first;
  return {
    routedEdges: [...result.route.routes],
    relationLabels: new Map(result.relationLabel.labels),
    nodeLabels: new Map(result.nodeLabel.labels),
    feedbackApplied: feedbackInput.shouldRun,
  };
}
