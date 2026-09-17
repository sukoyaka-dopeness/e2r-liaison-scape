import type { FixedAnchor, Point, PinnedFrontierGraph } from "../pinned-frontier-feasibility1/core.ts";

export type SeparationPolicy = "current-fixed" | "larger-fixed" | "density-adaptive";
export type DensityProfile = {
  graphDensity: number;
  degreeById: Record<string, number>;
  localNeighborCountById: Record<string, number>;
  pressureById: Record<string, number>;
  targetGapById: Record<string, number>;
};

const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const clone = (positions: Record<string, Point>) => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x, y: point.y }])) as Record<string, Point>;

function centerOf(positions: Record<string, Point>) {
  const points = Object.values(positions);
  return { x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length), y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length) };
}

function lockAnchors(positions: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>) {
  for (const [id, anchor] of Object.entries(anchors)) positions[id] = { x: anchor.x, y: anchor.y };
}

/**
 * Diagnostic density signal only. It measures topology degree and nearby
 * Graph-space occupancy; it is not a viewport or screen-fit requirement.
 */
export function deriveDensityProfile(graph: PinnedFrontierGraph, positions: Record<string, Point>): DensityProfile {
  const ids = graph.nodes.map(({ id }) => id).sort(compareId);
  const degreeById = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const edge of graph.edges) {
    if (edge.sourceId !== edge.targetId) {
      degreeById[edge.sourceId] = (degreeById[edge.sourceId] ?? 0) + 1;
      degreeById[edge.targetId] = (degreeById[edge.targetId] ?? 0) + 1;
    }
  }
  const localNeighborCountById = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) {
    const first = positions[ids[left]!]!; const second = positions[ids[right]!]!;
    if (Math.hypot(first.x - second.x, first.y - second.y) < 260) {
      localNeighborCountById[ids[left]!] = (localNeighborCountById[ids[left]!] ?? 0) + 1;
      localNeighborCountById[ids[right]!] = (localNeighborCountById[ids[right]!] ?? 0) + 1;
    }
  }
  const maxDegree = Math.max(1, ...Object.values(degreeById));
  const maxLocal = Math.max(1, ...Object.values(localNeighborCountById));
  const pressureById = Object.fromEntries(ids.map((id) => [id, 0.55 * (degreeById[id]! / maxDegree) + 0.45 * (localNeighborCountById[id]! / maxLocal)]));
  const targetGapById = Object.fromEntries(ids.map((id) => [id, 150 + pressureById[id]! * 150]));
  return { graphDensity: graph.edges.length / Math.max(1, ids.length * (ids.length - 1) / 2), degreeById, localNeighborCountById, pressureById, targetGapById };
}

function constrainedGlobalExpansion(base: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>, factor: number) {
  const center = centerOf(Object.keys(anchors).length > 0 ? Object.fromEntries(Object.entries(anchors).map(([id, anchor]) => [id, anchor])) : base);
  const next = Object.fromEntries(Object.entries(base).map(([id, point]) => [id, { x: center.x + (point.x - center.x) * factor, y: center.y + (point.y - center.y) * factor }])) as Record<string, Point>;
  lockAnchors(next, anchors);
  return next;
}

function adaptiveExpansion(graph: PinnedFrontierGraph, base: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>, rounds: number) {
  const ids = graph.nodes.map(({ id }) => id).sort(compareId);
  const movable = ids.filter((id) => !anchors[id]);
  const next = clone(base);
  lockAnchors(next, anchors);
  for (let round = 0; round < rounds; round += 1) {
    const profile = deriveDensityProfile(graph, next);
    const updated = clone(next);
    for (const id of movable) {
      const point = next[id]!;
      let dx = 0; let dy = 0;
      for (const otherId of ids) {
        if (otherId === id) continue;
        const other = next[otherId]!; const deltaX = point.x - other.x; const deltaY = point.y - other.y; const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        const desired = (profile.targetGapById[id]! + profile.targetGapById[otherId]!) / 2;
        if (distance < desired) {
          const pressure = (desired - distance) / desired;
          dx += deltaX / distance * pressure * (7 + profile.pressureById[id]! * 8);
          dy += deltaY / distance * pressure * (7 + profile.pressureById[id]! * 8);
        }
      }
      const degreeBias = profile.pressureById[id]! * 2;
      dx += Math.cos((round + 1) * 0.41 + id.length) * degreeBias;
      dy += Math.sin((round + 1) * 0.37 + id.length) * degreeBias;
      updated[id] = { x: point.x + Math.max(-22, Math.min(22, dx)), y: point.y + Math.max(-22, Math.min(22, dy)) };
    }
    lockAnchors(updated, anchors);
    Object.assign(next, updated);
  }
  return next;
}

/** Creates a policy candidate with anchors locked during construction. */
export function generateSeparatedPositions(
  graph: PinnedFrontierGraph,
  basePositions: Record<string, Point>,
  anchors: Readonly<Record<string, FixedAnchor>>,
  policy: SeparationPolicy,
  options: { largerFactor?: number; adaptiveRounds?: number } = {},
) {
  const base = clone(basePositions);
  lockAnchors(base, anchors);
  const positions = policy === "current-fixed"
    ? base
    : policy === "larger-fixed"
      ? constrainedGlobalExpansion(base, anchors, options.largerFactor ?? 1.18)
      : adaptiveExpansion(graph, base, anchors, options.adaptiveRounds ?? 10);
  return { positions, density: deriveDensityProfile(graph, positions), fixedAnchorsPreserved: Object.entries(anchors).every(([id, anchor]) => positions[id]?.x === anchor.x && positions[id]?.y === anchor.y) };
}
