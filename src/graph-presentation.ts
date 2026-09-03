import type { GraphEdge, GraphNode } from "./dataset.ts";
import { reconstructManualRelationLabelTarget, type ManualNodeLabelOffset, type ManualRelationLabelAnchor } from "./relation-label-presentation.ts";
import { compareRouteGeometry, placeEdgeLabel, placeNodeLabel, routeGraphEdge, type LabelRect, type Point } from "./viewport.ts";

export type RoutingGraphEdge = GraphEdge & { label: string };
export type SelfLoopOverride = { orientation: number; radius: number };

export type AutomaticRoutingInput = {
  graph: { nodes: readonly GraphNode[]; edges: readonly RoutingGraphEdge[] };
  positions: Readonly<Record<string, Point>>;
  edgeCurveOffsets: Readonly<Record<string, number>>;
  selfLoopOverrides: Readonly<Record<string, SelfLoopOverride>>;
  provisionalNodeLabels: readonly LabelRect[];
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
}: AutomaticRoutingInput): DerivedAutomaticRoute[] {
  const occupiedPaths: Array<Array<Point>> = [];
  const overlapCounts = new Map<string, number>();
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const routeLabelRects = [...provisionalNodeLabels];
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
  for (const edge of [...fixedEdges, ...automaticOrdinaryEdges]) {
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
      routeLabelRects,
      canonicalPhysicalSideSign,
    );
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
      : compareRouteGeometry(routeWithoutObstacles.samples, route.samples);
    const occupiedPathComparison = routeWithoutObstacles === null || routeWithoutObstaclesOrOccupiedPaths === null
      ? null
      : compareRouteGeometry(routeWithoutObstaclesOrOccupiedPaths.samples, routeWithoutObstacles.samples);
    const parallelSolverEligible = edge.parallelCount > 1
      && edge.sourceId !== edge.targetId
      && !isOverlappingPair
      && obstacleComparison?.equivalent === true
      && occupiedPathComparison?.equivalent === true;
    occupiedPaths.push(route.samples);
    routedById.set(edge.id, {
      path: route.path,
      samples: route.samples,
      labelPoint: route.labelPoint,
      controlPoint: route.controlPoint,
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
