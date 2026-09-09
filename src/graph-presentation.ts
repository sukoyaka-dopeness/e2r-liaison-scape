import type { GraphEdge, GraphNode } from "./dataset.ts";
import { reconstructManualRelationLabelTarget, type ManualNodeLabelOffset, type ManualRelationLabelAnchor } from "./relation-label-presentation.ts";
import { compareRouteGeometry, placeEdgeLabel, placeNodeLabel, routeGraphEdge, routeSamplesHaveLabelCollision, routeSamplesHaveNodeInfluence, routeSamplesHaveOccupiedPathConflict, type LabelRect, type Point, type RouteCandidateDiagnostic, type RouteYieldPath } from "./viewport.ts";

export type RoutingGraphEdge = GraphEdge & { label: string };
export type SelfLoopOverride = { orientation: number; radius: number };
export type AutomaticRouteDecision = {
  edgeId: string;
  pass: "label-free" | "first" | "feedback";
  processingIndex: number;
  usedPreviousRoute: boolean;
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
  routeDecisionSink?: (decision: AutomaticRouteDecision) => void;
  routeDecisionPass?: AutomaticRouteDecision["pass"];
};

export type DerivedAutomaticRoute = RoutingGraphEdge & Pick<
  ReturnType<typeof routeGraphEdge>,
  "path" | "samples" | "labelPoint" | "controlPoint"
> & { parallelSolverEligible: boolean };

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
  routeDecisionSink,
  routeDecisionPass = "first",
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
  for (const [processingIndex, edge] of [...fixedEdges, ...automaticOrdinaryEdges].entries()) {
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
      routeDecisionSink ? (candidates) => candidateDiagnostics.push(...candidates) : undefined,
      previousRouteSideSign,
    );
    const isEligibleShape = edge.sourceId !== edge.targetId
      && edge.parallelCount === 1
      && edgeCurveOffsets[edge.id] === undefined
      && previousRoute !== undefined
      && previousRoute.samples.length > 1
      && route.samples.length > 1;
    const continuityCandidate = previousRoute !== undefined
      && draggedNodeId !== undefined
      && !isIncident
      && isEligibleShape;
    // Keep the existing lazy safety work: ordinary presentation without a
    // continuity candidate does not pay these diagnostic-observable checks.
    const priorRouteHasNodeInfluence = continuityCandidate && routeSamplesHaveNodeInfluence(previousRoute.samples, obstacles);
    const priorRouteHasOccupiedPathConflict = continuityCandidate && routeSamplesHaveOccupiedPathConflict(previousRoute.samples, occupiedPaths);
    const collidingContinuityNodeLabelIds = continuityCandidate && routeSamplesHaveLabelCollision(previousRoute.samples, continuityLabelRects)
      ? continuityLabelRects.flatMap((label, index) => {
        if (!routeSamplesHaveLabelCollision(previousRoute.samples, [label])) return [];
        const nodeId = graph.nodes[index]?.id ?? `label-${index}`;
        const priorLabel = previousContinuityNodeLabels?.get(nodeId);
        // A label/route overlap that the immediately preceding presentation
        // already displayed is not a new active-drag safety regression. It
        // must not alone trigger a remote route flip before label feedback.
        return priorLabel && routeSamplesHaveLabelCollision(previousRoute.samples, [priorLabel]) ? [] : [nodeId];
      })
      : [];
    const priorRouteHasLabelCollision = collidingContinuityNodeLabelIds.length > 0;
    const canPreservePreviousRoute = continuityCandidate
      && !priorRouteHasNodeInfluence
      && !priorRouteHasOccupiedPathConflict
      && !priorRouteHasLabelCollision;
    const selectedRoute = canPreservePreviousRoute ? previousRoute : route;
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
      usedPreviousRoute: canPreservePreviousRoute,
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
    occupiedPaths.push(selectedRoute.samples);
    occupiedPathIds.push(edge.id);
    routedById.set(edge.id, {
      path: selectedRoute.path,
      samples: selectedRoute.samples,
      labelPoint: selectedRoute.labelPoint,
      controlPoint: selectedRoute.controlPoint,
      parallelSolverEligible,
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
};

/** Pure Product-owned automatic Relation-label orchestration. App state arrives as snapshots. */
export function deriveAutomaticRelationLabels({
  routedEdges,
  nodes,
  previousPlacements,
  manualAnchors,
  draggedNodeId,
}: AutomaticRelationLabelInput): Map<string, LabelRect> {
  const occupiedLabels: LabelRect[] = [];
  const result = new Map<string, LabelRect>();
  const nodePoints = [...nodes];
  for (const edge of routedEdges) {
    if (!edge.label) continue;
    const otherEdgePaths = routedEdges.filter(({ id }) => id !== edge.id).map(({ samples }) => samples);
    const relationMovesWithDraggedNode = draggedNodeId !== undefined
      && (edge.sourceId === draggedNodeId || edge.targetId === draggedNodeId);
    const automaticPlacement = placeEdgeLabel(
      edge.samples,
      edge.label,
      occupiedLabels,
      nodePoints,
      otherEdgePaths,
      relationMovesWithDraggedNode ? undefined : previousPlacements.get(edge.id),
    );
    const manualAnchor = manualAnchors.get(edge.id);
    const placement = manualAnchor
      ? { ...automaticPlacement, ...reconstructManualRelationLabelTarget(edge.samples, manualAnchor) }
      : automaticPlacement;
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
}: AutomaticNodeLabelInput): Map<string, LabelRect> {
  const occupiedLabels: LabelRect[] = Array.from(occupiedRelationLabels.values());
  const result = new Map<string, LabelRect>();
  const edgePaths = routedEdges.map(({ samples }) => samples).filter(({ length }) => length > 0);
  for (const node of nodes) {
    const position = positions[node.id] ?? node;
    const automaticPlacement = placeNodeLabel(
      position,
      node.label,
      node.description,
      occupiedLabels,
      nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
      edgePaths,
      activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id),
      yieldingRoutes,
    );
    const manualOffset = manualOffsets.get(node.id);
    const placement = manualOffset
      ? { ...automaticPlacement, x: position.x + manualOffset.x, y: position.y + manualOffset.y }
      : automaticPlacement;
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
  activelyDraggedNodeId?: string;
  continuityNodeLabels?: readonly LabelRect[];
  previousContinuityNodeLabels?: ReadonlyMap<string, LabelRect>;
  feedbackEnabled?: boolean;
  routeDecisionSink?: (decision: AutomaticRouteDecision) => void;
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
  activelyDraggedNodeId,
  continuityNodeLabels,
  previousContinuityNodeLabels,
  feedbackEnabled = true,
  routeDecisionSink,
}: BoundedAutomaticPresentationInput): BoundedAutomaticPresentation {
  const nodes = graph.nodes.map((node) => positions[node.id] ?? node);
  // The label-free counterfactual depends only on graph geometry and manual
  // route authority. Reuse it when the bounded feedback pass is repeated;
  // recomputing it for each route-label snapshot adds cost without changing
  // the dependency result.
  const routesWithoutNodeLabels = deriveAutomaticRoutes({
    graph,
    positions,
    edgeCurveOffsets,
    selfLoopOverrides,
    provisionalNodeLabels: [],
    routeDecisionSink,
    routeDecisionPass: "label-free",
  });
  const derivePass = (routeLabels: readonly LabelRect[], routeDecisionPass: AutomaticRouteDecision["pass"]) => {
    const routedEdges = deriveAutomaticRoutes({
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
      routeDecisionSink,
      routeDecisionPass,
    });
    const routeById = new Map(routesWithoutNodeLabels.map((route) => [route.id, route]));
    const yieldingRoutes: RouteYieldPath[] = routedEdges.flatMap((route) => {
      const labelFreeRoute = routeById.get(route.id);
      if (!labelFreeRoute || compareRouteGeometry(route.samples, labelFreeRoute.samples).equivalent) return [];
      const deviation = routeDeviation(route.samples, labelFreeRoute.samples);
      return deviation >= 12 ? [{ samples: labelFreeRoute.samples, deviation }] : [];
    });
    const relationLabels = deriveAutomaticRelationLabels({
      routedEdges,
      nodes,
      previousPlacements: previousRelationLabelPlacements,
      manualAnchors: manualRelationLabelAnchors,
      draggedNodeId,
    });
    const nodeLabels = deriveAutomaticNodeLabels({
      nodes: graph.nodes,
      positions,
      routedEdges,
      occupiedRelationLabels: relationLabels,
      previousPlacements: previousNodeLabelPlacements,
      manualOffsets: manualNodeLabelOffsets,
      activelyDraggedNodeId,
      yieldingRoutes,
    });
    return { routedEdges, relationLabels, nodeLabels };
  };

  const first = derivePass(provisionalNodeLabels, "first");
  const finalRouteLabels = graph.nodes
    .map((node, index) => first.nodeLabels.get(node.id) ?? provisionalNodeLabels[index])
    .filter((label): label is LabelRect => label !== undefined);
  const feedbackApplied = finalRouteLabels.length === graph.nodes.length
    && finalRouteLabels.some((label, index) => labelGeometryMoved(provisionalNodeLabels[index], label));
  const result = feedbackEnabled && feedbackApplied ? derivePass(finalRouteLabels, "feedback") : first;
  return { ...result, feedbackApplied: feedbackEnabled && feedbackApplied };
}
