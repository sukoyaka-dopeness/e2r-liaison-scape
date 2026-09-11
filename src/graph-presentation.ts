import type { GraphEdge, GraphNode } from "./dataset.ts";
import { reconstructManualRelationLabelTarget, type ManualNodeLabelOffset, type ManualRelationLabelAnchor } from "./relation-label-presentation.ts";
import { createFeedbackStageInput, createPresentationPassSnapshot, createRouteSelectionSnapshot, type FeedbackStageInput, type PresentationPassSnapshot } from "./presentation-stage-contracts.ts";
import { dependencyFingerprint, type PresentationDependencyTrace } from "./presentation-dependency.ts";
import { compareRouteGeometry, placeEdgeLabel, placeNodeLabel, pointBounds, routeGraphEdge, routeSamplesHaveLabelCollision, routeSamplesHaveNodeInfluence, routeSamplesHaveOccupiedPathConflict, type LabelPlacementProfile, type LabelPlacementTrace, type LabelRect, type Point, type PointBounds, type RouteArbitrationProfile, type RouteCandidateCache, type RouteCandidateDiagnostic, type RouteGeometryCache, type RouteYieldPath } from "./viewport.ts";

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
    arbitrationMs: 0,
    occupiedPathCheckMs: 0,
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

/** Pure Product-owned automatic route derivation. App state arrives as snapshots. */
export function deriveAutomaticRoutes({
  graph,
  positions,
  edgeCurveOffsets,
  selfLoopOverrides,
  provisionalNodeLabels,
  continuityNodeLabels,
  previousContinuityNodeLabels,
  previousAutomaticRoutes,
  draggedNodeId,
  activeDraggedNodeId,
  preserveSafeIncidentPreviousRoute = false,
  routeDecisionSink,
  routeTraceSink,
  candidateCache,
  geometryCache,
  profiler,
  routeDecisionPass = "first",
  replayPrefix,
  replayPrefixSink,
}: AutomaticRoutingInput): DerivedAutomaticRoute[] {
  const occupiedPaths: Array<Array<Point>> = [];
  const occupiedPathIds: string[] = [];
  const overlapCounts = new Map<string, number>();
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  // During active drag, use the labels that were actually displayed in the
  // preceding presentation for stationary Nodes, plus the current label for
  // the dragged Node. This avoids scoring a route against a provisional
  // endpoint-label position that the bounded feedback pass immediately
  // replaces. Idle/final presentations leave this undefined and retain the
  // original provisional-label input.
  const routeLabelRects = [...(continuityNodeLabels ?? provisionalNodeLabels)];
  const continuityLabelRects = continuityNodeLabels ?? routeLabelRects;
  const routedById = new Map<string, Omit<DerivedAutomaticRoute, keyof RoutingGraphEdge>>();
  const compareRoutingPriority = (left: RoutingGraphEdge, right: RoutingGraphEdge) =>
    left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.id.localeCompare(right.id);
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
  const replayedEdgeIds = new Set<string>();
  for (const [processingIndex, edge] of orderedEdges.entries()) {
    if (replayPrefix?.edgeIds[processingIndex] !== edge.id) break;
    const replayedRoute = replayPrefix.routes.get(edge.id);
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
  replayPrefixSink?.([...replayedEdgeIds]);
  for (const [processingIndex, edge] of orderedEdges.entries()) {
    if (replayedEdgeIds.has(edge.id)) continue;
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
      ? routeLabelRects.filter((_, index) => {
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
    occupiedPaths.push(selectedRoute.samples);
    occupiedPathIds.push(edge.id);
    if (passProfile) passProfile.occupiedPathMaintenanceMs += performance.now() - occupiedPathMaintenanceStartedAt;
    if (passProfile) passProfile.routeDecisions += 1;
    routedById.set(edge.id, {
      sourcePosition: { x: source.x, y: source.y },
      targetPosition: { x: target.x, y: target.y },
      path: selectedRoute.path,
      samples: selectedRoute.samples,
      labelPoint: selectedRoute.labelPoint,
      controlPoint: selectedRoute.controlPoint,
      parallelSolverEligible,
      directRecoveryObstacleId,
    });
  }
  return graph.edges.map((edge) => ({ ...edge, ...routedById.get(edge.id)! }));
}

export type AutomaticRelationLabelInput = {
  routedEdges: readonly DerivedAutomaticRoute[];
  nodes: readonly Point[];
  previousPlacements: ReadonlyMap<string, LabelRect>;
  manualAnchors: ReadonlyMap<string, ManualRelationLabelAnchor>;
  draggedNodeId?: string;
  profile?: LabelPlacementProfile;
  pass?: AutomaticRouteDecision["pass"];
  /** Diagnostic-only item trace; omitted by normal Product callers. */
  placementTraceSink?: (trace: AutomaticRelationLabelTrace) => void;
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

/** Pure Product-owned automatic Relation-label orchestration. App state arrives as snapshots. */
export function deriveAutomaticRelationLabels({
  routedEdges,
  nodes,
  previousPlacements,
  manualAnchors,
  draggedNodeId,
  profile,
  pass = "first",
  placementTraceSink,
}: AutomaticRelationLabelInput): Map<string, LabelRect> {
  const occupiedLabels: LabelRect[] = [];
  const result = new Map<string, LabelRect>();
  const nodePoints = [...nodes];
  const boundsStartedAt = performance.now();
  const routeBounds = routedEdges.map(({ samples }) => pointBounds(samples));
  if (profile) {
    profile.pathBoundsPrecomputationMs += performance.now() - boundsStartedAt;
    profile.pathBoundsBuildCount += routedEdges.length;
    profile.pathBoundsPointVisits += routedEdges.reduce((total, edge) => total + edge.samples.length, 0);
  }
  for (const [processingIndex, edge] of routedEdges.entries()) {
    if (!edge.label) continue;
    const otherEdgePaths = routedEdges.filter(({ id }) => id !== edge.id).map(({ samples }) => samples);
    const otherEdgePathBounds = routedEdges
      .map((otherEdge, index) => otherEdge.id === edge.id ? undefined : routeBounds[index] ?? null)
      .filter((bounds): bounds is PointBounds | null => bounds !== undefined);
    const relationMovesWithDraggedNode = draggedNodeId !== undefined
      && (edge.sourceId === draggedNodeId || edge.targetId === draggedNodeId);
    const occupiedRelationLabelPrefixFingerprint = placementTraceSink ? JSON.stringify(occupiedLabels) : "";
    const routeFingerprint = placementTraceSink ? JSON.stringify({ path: edge.path, samples: edge.samples, labelPoint: edge.labelPoint, controlPoint: edge.controlPoint }) : "";
    const inputFingerprint = placementTraceSink ? JSON.stringify({ route: routeFingerprint, label: edge.label, occupiedLabels, nodes: nodePoints, otherEdgePaths, previousPlacement: relationMovesWithDraggedNode ? undefined : previousPlacements.get(edge.id), manualAnchor: manualAnchors.get(edge.id) }) : "";
    let placementTrace: LabelPlacementTrace | undefined;
    const automaticPlacement = placeEdgeLabel(
      edge.samples,
      edge.label,
      occupiedLabels,
      nodePoints,
      otherEdgePaths,
      relationMovesWithDraggedNode ? undefined : previousPlacements.get(edge.id),
      profile,
      placementTraceSink ? (trace) => { placementTrace = trace; } : undefined,
      otherEdgePathBounds,
    );
    const manualAnchor = manualAnchors.get(edge.id);
    if (manualAnchor && profile) profile.manualAnchorReconstructions += 1;
    const placement = manualAnchor
      ? { ...automaticPlacement, ...reconstructManualRelationLabelTarget(edge.samples, manualAnchor) }
      : automaticPlacement;
    placementTraceSink?.({
      pass,
      relationId: edge.id,
      processingIndex,
      routeFingerprint,
      inputFingerprint,
      occupiedRelationLabelPrefixFingerprint,
      candidateFingerprint: placementTrace?.candidateFingerprint ?? "",
      selectedPlacementFingerprint: JSON.stringify(placement),
    });
    occupiedLabels.push(placement);
    result.set(edge.id, placement);
  }
  return result;
}

/** Pure Product-owned automatic Node-label orchestration. App state arrives as snapshots. */
export function deriveAutomaticNodeLabels({
  nodes,
  positions,
  routedEdges,
  occupiedRelationLabels,
  previousPlacements,
  manualOffsets,
  activelyDraggedNodeId,
  yieldingRoutes = [],
  profile,
  pass = "first",
  placementTraceSink,
}: AutomaticNodeLabelInput): Map<string, LabelRect> {
  const occupiedLabels: LabelRect[] = Array.from(occupiedRelationLabels.values());
  const result = new Map<string, LabelRect>();
  const edgePaths = routedEdges.map(({ samples }) => samples).filter(({ length }) => length > 0);
  const boundsStartedAt = performance.now();
  const edgePathBounds = edgePaths.map((path) => pointBounds(path));
  const yieldingRouteBounds = yieldingRoutes.map((route) => pointBounds(route.samples));
  if (profile) {
    profile.pathBoundsPrecomputationMs += performance.now() - boundsStartedAt;
    profile.pathBoundsBuildCount += edgePaths.length + yieldingRoutes.length;
    profile.pathBoundsPointVisits += edgePaths.reduce((total, path) => total + path.length, 0)
      + yieldingRoutes.reduce((total, route) => total + route.samples.length, 0);
  }
  for (const [processingIndex, node] of nodes.entries()) {
    const position = positions[node.id] ?? node;
    const occupiedLabelPrefixFingerprint = placementTraceSink ? JSON.stringify(occupiedLabels) : "";
    const routeSetFingerprint = placementTraceSink ? JSON.stringify(edgePaths) : "";
    const yieldingRouteFingerprint = placementTraceSink ? JSON.stringify(yieldingRoutes) : "";
    const inputFingerprint = placementTraceSink ? JSON.stringify({ node: { x: position.x, y: position.y }, name: node.label, description: node.description, occupiedLabels, otherNodes: nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other), edgePaths, previousPlacement: activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id), yieldingRoutes, manualOffset: manualOffsets.get(node.id) }) : "";
    let placementTrace: LabelPlacementTrace | undefined;
    const automaticPlacement = placeNodeLabel(
      position,
      node.label,
      node.description,
      occupiedLabels,
      nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
      edgePaths,
      activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id),
      yieldingRoutes,
      profile,
      placementTraceSink ? (trace) => { placementTrace = trace; } : undefined,
      edgePathBounds,
      yieldingRouteBounds,
    );
    const manualOffset = manualOffsets.get(node.id);
    const placement = manualOffset
      ? { ...automaticPlacement, x: position.x + manualOffset.x, y: position.y + manualOffset.y }
      : automaticPlacement;
    placementTraceSink?.({
      pass,
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
    occupiedLabels.push(placement);
    result.set(node.id, placement);
  }
  return result;
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
    }));
    reportDependency("route-selection", routeDecisionPass, routeStageInput, { routes: routeSnapshot.routes });
    const routeById = new Map(labelFreeSnapshot.routes.map((route) => [route.id, route]));
    const yieldingRoutes: RouteYieldPath[] = routeSnapshot.routes.flatMap((route) => {
      const labelFreeRoute = routeById.get(route.id);
      if (!labelFreeRoute || compareRouteGeometry(route.samples, labelFreeRoute.samples).equivalent) return [];
      const deviation = routeDeviation(route.samples, labelFreeRoute.samples);
      return deviation >= 12 ? [{ samples: labelFreeRoute.samples, deviation }] : [];
    });
    const relationLabelStartedAt = performance.now();
    const relationLabelStageInput = {
      pass: routeDecisionPass,
      routedEdges: routeSnapshot.routes,
      nodes,
      previousPlacements: previousRelationLabelPlacements,
      manualAnchors: manualRelationLabelAnchors,
      draggedNodeId,
    };
    const relationLabels = deriveAutomaticRelationLabels({
      routedEdges: routeSnapshot.routes,
      nodes,
      previousPlacements: previousRelationLabelPlacements,
      manualAnchors: manualRelationLabelAnchors,
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
