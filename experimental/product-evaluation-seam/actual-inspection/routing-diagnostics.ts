import { compareRouteGeometry, curveOffsetFromControlPoint, minimumPathToLabelRectDistance, routeGraphEdge, routeSamplesHaveNodeInfluence, type LabelRect, type Point } from "../../../src/viewport.ts";
import type { PresentationDiagnosticSnapshot } from "../../../src/presentation-diagnostics.ts";

type RouteGeometry = ReturnType<typeof routeGraphEdge>;

export type RouteVariantDiagnostic = {
  name: "current" | "straight" | "without-provisional-labels" | "without-occupied-paths" | "without-node-influence";
  geometry: RouteGeometry;
  offset: number | null;
  length: number;
  nearestProvisionalLabel: { id: string; distance: number } | null;
  nearestFinalLabel: { id: string; distance: number } | null;
  nodeInfluence: boolean;
  matchesCurrent: boolean;
};

export type RouteCrossing = { relationId: string; point: Point };

export type RouteDiagnostic = {
  routeId: string;
  sourceLabel: string;
  targetLabel: string;
  relationLabel: string;
  automaticOrdinary: boolean;
  parallelCount: number;
  variants: RouteVariantDiagnostic[];
  provisionalFinalMoves: Array<{ id: string; distance: number }>;
  crossings: RouteCrossing[];
  reasons: string[];
};

function routeLength(samples: readonly Point[]): number {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - samples[index]!.x, point.y - samples[index]!.y), 0);
}

function nearestLabel(samples: readonly Point[], labels: readonly [string, LabelRect][]): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const [id, label] of labels) {
    const distance = minimumPathToLabelRectDistance([...samples], label);
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best;
}

function routeIntersection(start: Point, end: Point, otherStart: Point, otherEnd: Point): Point | null {
  const denominator = (end.x - start.x) * (otherEnd.y - otherStart.y) - (end.y - start.y) * (otherEnd.x - otherStart.x);
  if (Math.abs(denominator) < 1e-9) return null;
  const leftX = otherStart.x - start.x;
  const leftY = otherStart.y - start.y;
  const t = (leftX * (otherEnd.y - otherStart.y) - leftY * (otherEnd.x - otherStart.x)) / denominator;
  const u = (leftX * (end.y - start.y) - leftY * (end.x - start.x)) / denominator;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

function crossingsFor(routeId: string, snapshot: PresentationDiagnosticSnapshot): RouteCrossing[] {
  const routes = new Map(snapshot.routedEdges.map((route) => [route.id, route]));
  const current = routes.get(routeId);
  if (!current) return [];
  const result: RouteCrossing[] = [];
  for (const other of snapshot.routedEdges) {
    if (other.id === routeId || other.sourceId === current.sourceId || other.sourceId === current.targetId || other.targetId === current.sourceId || other.targetId === current.targetId) continue;
    let point: Point | null = null;
    for (let index = 1; index < current.samples.length && !point; index += 1) {
      for (let otherIndex = 1; otherIndex < other.samples.length && !point; otherIndex += 1) {
        point = routeIntersection(current.samples[index - 1]!, current.samples[index]!, other.samples[otherIndex - 1]!, other.samples[otherIndex]!);
      }
    }
    if (point) result.push({ relationId: other.id, point });
  }
  return result;
}

function routingOrder(snapshot: PresentationDiagnosticSnapshot) {
  const positions = snapshot.positions;
  const compare = (left: typeof snapshot.edges[number], right: typeof snapshot.edges[number]) =>
    left.sourceId.localeCompare(right.sourceId) || left.targetId.localeCompare(right.targetId) || left.id.localeCompare(right.id);
  const fixed = snapshot.edges.filter((edge) => {
    const source = positions[edge.sourceId]!;
    const target = positions[edge.targetId]!;
    return snapshot.edgeCurveOffsets[edge.id] !== undefined
      || edge.sourceId === edge.targetId
      || (source.x === target.x && source.y === target.y);
  }).sort(compare);
  return [...fixed, ...snapshot.edges.filter((edge) => !fixed.some(({ id }) => id === edge.id)).sort(compare)];
}

/**
 * Derives counterfactuals from the same Product route primitive and current
 * App snapshot. The variants isolate one routing input at a time; they are
 * explanations, never Product geometry or candidate-selection commands.
 */
export function diagnoseRoute(snapshot: PresentationDiagnosticSnapshot, routeId: string): RouteDiagnostic | null {
  const edge = snapshot.edges.find(({ id }) => id === routeId);
  const current = snapshot.routedEdges.find(({ id }) => id === routeId);
  if (!edge || !current) return null;
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const source = snapshot.positions[edge.sourceId] ?? nodes.get(edge.sourceId);
  const target = snapshot.positions[edge.targetId] ?? nodes.get(edge.targetId);
  if (!source || !target) return null;
  const overlapCounts = new Map<string, number>();
  const occupiedPaths: Point[][] = [];
  let overlapIndex = 0;
  for (const candidate of routingOrder(snapshot)) {
    const candidateSource = snapshot.positions[candidate.sourceId] ?? nodes.get(candidate.sourceId)!;
    const candidateTarget = snapshot.positions[candidate.targetId] ?? nodes.get(candidate.targetId)!;
    const overlapping = candidate.sourceId !== candidate.targetId
      && candidateSource.x === candidateTarget.x && candidateSource.y === candidateTarget.y;
    const key = `${candidateSource.x}\u0000${candidateSource.y}`;
    const candidateOverlapIndex = overlapping ? (overlapCounts.get(key) ?? 0) : 0;
    if (overlapping) overlapCounts.set(key, candidateOverlapIndex + 1);
    if (candidate.id === routeId) { overlapIndex = candidateOverlapIndex; break; }
    const existing = snapshot.routedEdges.find(({ id }) => id === candidate.id);
    if (existing) occupiedPaths.push(existing.samples);
  }
  const obstacles = snapshot.nodes
    .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
    .map((node) => snapshot.positions[node.id] ?? node);
  const provisional = snapshot.provisionalNodeLabels.map((label, index) => [snapshot.nodes[index]!.id, label] as [string, LabelRect]);
  const final = snapshot.nodeLabels;
  const side = edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1;
  const routeFor = (options: { labels: readonly LabelRect[]; occupied: Point[][]; routeObstacles: Point[]; manualOffset?: number }) =>
    routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, options.routeObstacles, options.occupied, edge.sourceId === edge.targetId, overlapIndex, options.manualOffset ?? snapshot.edgeCurveOffsets[edge.id], snapshot.selfLoopOverrides[edge.id], [...options.labels], side);
  const variantGeometry: Array<[RouteVariantDiagnostic["name"], RouteGeometry]> = [
    ["current", current],
    ["straight", routeFor({ labels: [], occupied: [], routeObstacles: [], manualOffset: 0 })],
    ["without-provisional-labels", routeFor({ labels: [], occupied: occupiedPaths, routeObstacles: obstacles })],
    ["without-occupied-paths", routeFor({ labels: snapshot.provisionalNodeLabels, occupied: [], routeObstacles: obstacles })],
    ["without-node-influence", routeFor({ labels: snapshot.provisionalNodeLabels, occupied: occupiedPaths, routeObstacles: [] })],
  ];
  const variants = variantGeometry.map(([name, geometry]) => ({
    name,
    geometry,
    offset: curveOffsetFromControlPoint(source, target, geometry.controlPoint),
    length: routeLength(geometry.samples),
    nearestProvisionalLabel: nearestLabel(geometry.samples, provisional),
    nearestFinalLabel: nearestLabel(geometry.samples, final),
    nodeInfluence: routeSamplesHaveNodeInfluence(geometry.samples, obstacles),
    matchesCurrent: compareRouteGeometry(current.samples, geometry.samples).equivalent,
  }));
  const byName = new Map(variants.map((variant) => [variant.name, variant]));
  const withoutLabels = byName.get("without-provisional-labels")!;
  const withoutOccupied = byName.get("without-occupied-paths")!;
  const withoutNodes = byName.get("without-node-influence")!;
  const reasons: string[] = [];
  if (!withoutLabels.matchesCurrent) reasons.push("Provisional node-label bounds change the selected route.");
  if (!withoutOccupied.matchesCurrent) reasons.push("Earlier occupied paths change the selected route.");
  if (!withoutNodes.matchesCurrent) reasons.push("Unrelated node influence changes the selected route.");
  if (edge.parallelCount > 1) reasons.push("Parallel-side constraints set a non-zero base offset before obstacle scoring.");
  if (edge.sourceId === edge.targetId) reasons.push("Self-loop orientation is handled by the self-loop branch, not ordinary route arbitration.");
  if (reasons.length === 0 && Math.abs(byName.get("current")!.offset ?? 0) > 1e-6) reasons.push("The ordinary route remains offset under these one-input counterfactuals; inspect the combined candidate score and route order.");
  const finalById = new Map(snapshot.nodeLabels);
  const provisionalFinalMoves = provisional.map(([id, label]) => {
    const finalLabel = finalById.get(id)!;
    return { id, distance: Math.hypot(finalLabel.x - label.x, finalLabel.y - label.y) };
  }).filter(({ distance }) => distance > 1e-6).sort((left, right) => right.distance - left.distance);
  return {
    routeId,
    sourceLabel: nodes.get(edge.sourceId)?.label ?? edge.sourceId,
    targetLabel: nodes.get(edge.targetId)?.label ?? edge.targetId,
    relationLabel: edge.label,
    automaticOrdinary: snapshot.edgeCurveOffsets[edge.id] === undefined && edge.sourceId !== edge.targetId && !(source.x === target.x && source.y === target.y),
    parallelCount: edge.parallelCount,
    variants,
    provisionalFinalMoves,
    crossings: crossingsFor(routeId, snapshot),
    reasons,
  };
}
