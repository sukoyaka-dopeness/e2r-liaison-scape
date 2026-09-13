export type CapacityNeighbor = {
  id: string;
  angleRadians: number;
  radius: number;
};

export type CapacityPlacementRequest = {
  endpointId: string;
  bundleAngleRadians: number;
  requiredHalfSectorDegrees: number;
  incidentNeighbors: readonly CapacityNeighbor[];
};

export type PlacementSafety = {
  maxNodeSeparationLossRatio: number;
  maxExtentGrowthRatio: number;
};

export type CapacityPlacementResult = {
  status: "applied" | "rejected";
  reason: "capacity-relieved" | "no-neighbors" | "no-relief-needed" | "unsafe-node-separation" | "unsafe-extent";
  positions: Readonly<Record<string, { x: number; y: number }>>;
  movedNeighborIds: readonly string[];
  beforeMinimumSeparation: number;
  afterMinimumSeparation: number;
  beforeExtent: number;
  afterExtent: number;
};

const TAU = Math.PI * 2;
const normalizeAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;
const signedAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const extent = (positions: Readonly<Record<string, { x: number; y: number }>>) => {
  const points = Object.values(positions);
  if (points.length === 0) return 0;
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const minimumSeparation = (positions: Readonly<Record<string, { x: number; y: number }>>) => {
  const points = Object.values(positions);
  let minimum = Infinity;
  for (let left = 0; left < points.length; left += 1) for (let right = left + 1; right < points.length; right += 1) {
    minimum = Math.min(minimum, Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y));
  }
  return Number.isFinite(minimum) ? minimum : 0;
};

/**
 * Apply only a routing-issued angular-capacity request. The correction is
 * endpoint-local, preserves each neighbor radius, and fails closed when the
 * whole placement safety guards are exceeded. It does not choose a fixed
 * angle, write Dataset coordinates, or know fixture identities.
 */
export function applyCapacityNegotiatedPlacement(
  positions: Readonly<Record<string, { x: number; y: number }>>,
  request: CapacityPlacementRequest,
  safety: PlacementSafety = { maxNodeSeparationLossRatio: 0.12, maxExtentGrowthRatio: 0.25 },
): CapacityPlacementResult {
  const beforeMinimumSeparation = minimumSeparation(positions);
  const beforeExtent = extent(positions);
  if (request.incidentNeighbors.length === 0) {
    return { status: "rejected", reason: "no-neighbors", positions, movedNeighborIds: [], beforeMinimumSeparation, afterMinimumSeparation: beforeMinimumSeparation, beforeExtent, afterExtent: beforeExtent };
  }
  const required = request.requiredHalfSectorDegrees * Math.PI / 180;
  const adjusted = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
  const ordered = [...request.incidentNeighbors].sort((left, right) => left.id.localeCompare(right.id));
  const movedNeighborIds: string[] = [];
  for (const neighbor of ordered) {
    const delta = signedAngle(neighbor.angleRadians - request.bundleAngleRadians);
    if (Math.abs(delta) >= required) continue;
    const side = delta === 0 ? (neighbor.id.localeCompare(request.endpointId) < 0 ? -1 : 1) : Math.sign(delta);
    const targetAngle = normalizeAngle(request.bundleAngleRadians + side * required);
    const endpoint = adjusted[request.endpointId];
    if (!endpoint || !Number.isFinite(neighbor.radius)) continue;
    adjusted[neighbor.id] = { x: endpoint.x + Math.cos(targetAngle) * neighbor.radius, y: endpoint.y + Math.sin(targetAngle) * neighbor.radius };
    movedNeighborIds.push(neighbor.id);
  }
  if (movedNeighborIds.length === 0) {
    return { status: "rejected", reason: "no-relief-needed", positions, movedNeighborIds: [], beforeMinimumSeparation, afterMinimumSeparation: beforeMinimumSeparation, beforeExtent, afterExtent: beforeExtent };
  }
  const afterMinimumSeparation = minimumSeparation(adjusted);
  const afterExtent = extent(adjusted);
  const separationSafe = beforeMinimumSeparation === 0 || afterMinimumSeparation >= beforeMinimumSeparation * (1 - safety.maxNodeSeparationLossRatio);
  const extentSafe = beforeExtent === 0 || afterExtent <= beforeExtent * (1 + safety.maxExtentGrowthRatio);
  if (!separationSafe) return { status: "rejected", reason: "unsafe-node-separation", positions, movedNeighborIds, beforeMinimumSeparation, afterMinimumSeparation, beforeExtent, afterExtent };
  if (!extentSafe) return { status: "rejected", reason: "unsafe-extent", positions, movedNeighborIds, beforeMinimumSeparation, afterMinimumSeparation, beforeExtent, afterExtent };
  return { status: "applied", reason: "capacity-relieved", positions: adjusted, movedNeighborIds, beforeMinimumSeparation, afterMinimumSeparation, beforeExtent, afterExtent };
}
