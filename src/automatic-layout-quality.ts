import type { BoundedAutomaticPresentation, RoutingGraphEdge } from "./graph-presentation.ts";
import { fitGraphView, routeSamplesHaveLabelCollision, type LabelRect } from "./viewport.ts";
import { INITIAL_ENTITY_CLEARANCE } from "./initial-entity-placement.ts";

type Point = Readonly<{ x: number; y: number }>;
type QualityNode = Readonly<{ id: string }>;

export type AutomaticLayoutQualityMetrics = Readonly<{
  score: number;
  overlapPairs: number;
  minimumSeparation: number;
  extent: readonly [number, number];
  aspectRatio: number;
  fitScale: number;
  routeMedian: number;
  routeMax: number;
  crossings: number;
  crossingRelationLabelNear: number;
  labelRouteHits: number;
  labelNear20: number;
  labelOverlap: number;
  labelCorridorDeficit: number;
  labelCorridorConflictPairs: number;
  labelCorridorMinimumClearance: number | null;
  labelCorridorMaximumIntrusion: number;
  usableSpanPenalty: number;
  shortHopCount: number;
  feedbackApplied: boolean;
}>;

function distanceToRect(point: Point, rect: LabelRect): number {
  return Math.hypot(
    Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0),
    Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0),
  );
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
}

/**
 * Pure quality aggregation extracted from the bounded HQ-layout research scorer.
 * Presentation remains Product-owned; this function neither routes nor places labels.
 */
export function deriveAutomaticLayoutQualityMetrics(input: Readonly<{
  nodes: readonly QualityNode[];
  edges: readonly RoutingGraphEdge[];
  positions: Readonly<Record<string, Point>>;
  presentation: BoundedAutomaticPresentation;
  labelCorridorMargin?: number;
}>): AutomaticLayoutQualityMetrics {
  const { nodes, edges, positions, presentation } = input;
  const labelCorridorMargin = input.labelCorridorMargin ?? 48;
  const nodeLabels = [...presentation.nodeLabels.values()];
  const relationLabels = [...presentation.relationLabels.values()];
  const routeLengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index]!.x, point.y - route.samples[index]!.y), 0)).sort((a, b) => a - b);
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, nodeLabels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => nodeLabels.some((label) => distanceToRect(point, label) < 20))).length;
  let labelOverlap = 0;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) {
    if (Math.abs(nodeLabels[left]!.x - nodeLabels[right]!.x) < (nodeLabels[left]!.width + nodeLabels[right]!.width) / 2
      && Math.abs(nodeLabels[left]!.y - nodeLabels[right]!.y) < (nodeLabels[left]!.height + nodeLabels[right]!.height) / 2) labelOverlap += 1;
  }
  let crossings = 0; let crossingRelationLabelNear = 0;
  for (let left = 0; left < presentation.routedEdges.length; left += 1) for (let right = left + 1; right < presentation.routedEdges.length; right += 1) {
    const first = presentation.routedEdges[left]!; const second = presentation.routedEdges[right]!;
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let hit: Point | null = null;
    for (let a = 1; a < first.samples.length && !hit; a += 1) for (let b = 1; b < second.samples.length && !hit; b += 1) hit = segmentIntersection(first.samples[a - 1]!, first.samples[a]!, second.samples[b - 1]!, second.samples[b]!);
    if (hit) { crossings += 1; if (relationLabels.some((label) => distanceToRect(hit!, label) < 24)) crossingRelationLabelNear += 1; }
  }
  let labelCorridorDeficit = 0; let labelCorridorConflictPairs = 0; let labelCorridorMinimumClearance = Infinity; let labelCorridorMaximumIntrusion = 0;
  for (const route of presentation.routedEdges) for (const label of nodeLabels) {
    const samples = route.samples.length > 8 ? route.samples.slice(4, -4) : route.samples;
    const distance = samples.length ? Math.min(...samples.map((point) => distanceToRect(point, label))) : Infinity;
    labelCorridorMinimumClearance = Math.min(labelCorridorMinimumClearance, distance);
    if (distance < labelCorridorMargin) { const intrusion = labelCorridorMargin - distance; labelCorridorDeficit += intrusion; labelCorridorConflictPairs += 1; labelCorridorMaximumIntrusion = Math.max(labelCorridorMaximumIntrusion, intrusion); }
  }
  const routeSupports = presentation.routedEdges.map((route) => {
    const width = presentation.relationLabels.get(route.id)?.width ?? 48;
    const length = route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index]!.x, point.y - route.samples[index]!.y), 0);
    const first = route.samples[0]!; const last = route.samples.at(-1) ?? first; const direct = Math.hypot(last.x - first.x, last.y - first.y);
    const horizontalSpan = Math.abs(last.x - first.x); const shallow = horizontalSpan / Math.max(1, direct) >= 0.55;
    return shallow ? Math.max(0, width + 48 - horizontalSpan * direct / Math.max(1, length)) : 0;
  });
  const usableSpanPenalty = routeSupports.reduce((sum, shortfall) => sum + (shortfall / 18) ** 2 * 160, 0);
  let overlapPairs = 0; let minimumSeparation = Infinity;
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    const first = positions[nodes[left]!.id]!; const second = positions[nodes[right]!.id]!; minimumSeparation = Math.min(minimumSeparation, Math.hypot(first.x - second.x, first.y - second.y));
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId]!.x - positions[edge.targetId]!.x, positions[edge.sourceId]!.y - positions[edge.targetId]!.y)).sort((a, b) => a - b);
  const shortHopCount = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.45).length;
  const xs = Object.values(positions).map((point) => point.x); const ys = Object.values(positions).map((point) => point.y);
  const extent: [number, number] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const routeMedian = routeLengths[Math.floor(routeLengths.length / 2)] ?? 0; const routeMax = Math.max(...routeLengths, 0);
  const score = crossings * 100000 + crossingRelationLabelNear * 15000 + labelRouteHits * 30000 + labelNear20 * 5000 + labelOverlap * 10000 + usableSpanPenalty * 4 + shortHopCount * 5000 + routeMedian * 2 + routeMax + (extent[0] + extent[1]) * 0.25;
  return { score, overlapPairs, minimumSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : 0, extent, aspectRatio: extent[0] / Math.max(1, extent[1]), fitScale: fitGraphView(Object.values(positions), 800, 500).scale, routeMedian, routeMax, crossings, crossingRelationLabelNear, labelRouteHits, labelNear20, labelOverlap, labelCorridorDeficit, labelCorridorConflictPairs, labelCorridorMinimumClearance: Number.isFinite(labelCorridorMinimumClearance) ? labelCorridorMinimumClearance : null, labelCorridorMaximumIntrusion, usableSpanPenalty, shortHopCount, feedbackApplied: presentation.feedbackApplied };
}
