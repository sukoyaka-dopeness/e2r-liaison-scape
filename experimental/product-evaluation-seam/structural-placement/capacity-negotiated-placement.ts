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
  minimumAngularSeparationDegrees?: number;
};

export type PlacementSafety = {
  maxNodeSeparationLossRatio: number;
  maxExtentGrowthRatio: number;
  maxFitScaleLossRatio?: number;
  viewport?: { width: number; height: number; padding: number };
  maxMovedNeighborDisplacement?: number;
};

export type CapacityPlacementResult = {
  status: "applied" | "rejected";
  reason: "capacity-relieved" | "no-neighbors" | "no-relief-needed" | "unsafe-node-separation" | "unsafe-extent" | "unsafe-fit-scale" | "unsafe-displacement";
  positions: Readonly<Record<string, { x: number; y: number }>>;
  movedNeighborIds: readonly string[];
  beforeMinimumSeparation: number;
  afterMinimumSeparation: number;
  beforeExtent: number;
  afterExtent: number;
  beforeFitScale: number | null;
  afterFitScale: number | null;
  maxMovedNeighborDisplacement: number;
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
const fitScale = (
  positions: Readonly<Record<string, { x: number; y: number }>>,
  viewport?: { width: number; height: number; padding: number },
) => {
  if (!viewport) return null;
  const points = Object.values(positions);
  if (points.length === 0) return 1;
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const availableWidth = Math.max(1, viewport.width - viewport.padding * 2);
  const availableHeight = Math.max(1, viewport.height - viewport.padding * 2);
  return Math.min(
    availableWidth / Math.max(1, Math.max(...xs) - Math.min(...xs)),
    availableHeight / Math.max(1, Math.max(...ys) - Math.min(...ys)),
  );
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
  safety: PlacementSafety = {
    maxNodeSeparationLossRatio: 0.12,
    maxExtentGrowthRatio: 0.25,
    maxFitScaleLossRatio: 0.1,
    maxMovedNeighborDisplacement: Infinity,
  },
): CapacityPlacementResult {
  const beforeMinimumSeparation = minimumSeparation(positions);
  const beforeExtent = extent(positions);
  const beforeFitScale = fitScale(positions, safety.viewport);
  const unchanged = (reason: CapacityPlacementResult["reason"], movedNeighborIds: readonly string[] = []) => ({
    status: "rejected" as const, reason, positions, movedNeighborIds,
    beforeMinimumSeparation, afterMinimumSeparation: beforeMinimumSeparation,
    beforeExtent, afterExtent: beforeExtent, beforeFitScale, afterFitScale: beforeFitScale,
    maxMovedNeighborDisplacement: 0,
  });
  if (request.incidentNeighbors.length === 0) {
    return unchanged("no-neighbors");
  }
  const required = request.requiredHalfSectorDegrees * Math.PI / 180;
  const minimumAngularSeparation = (request.minimumAngularSeparationDegrees ?? Math.max(
    1,
    request.requiredHalfSectorDegrees / Math.max(2, request.incidentNeighbors.length + 1),
  )) * Math.PI / 180;
  const adjusted = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
  const ordered = [...request.incidentNeighbors].sort((left, right) => {
    const leftDelta = signedAngle(left.angleRadians - request.bundleAngleRadians);
    const rightDelta = signedAngle(right.angleRadians - request.bundleAngleRadians);
    const leftSide = leftDelta === 0 ? 0 : Math.sign(leftDelta);
    const rightSide = rightDelta === 0 ? 0 : Math.sign(rightDelta);
    return leftSide - rightSide || Math.abs(leftDelta) - Math.abs(rightDelta) || left.id.localeCompare(right.id);
  });
  const movedNeighborIds: string[] = [];
  const sideCounts = new Map<number, number>();
  for (const neighbor of ordered) {
    const delta = signedAngle(neighbor.angleRadians - request.bundleAngleRadians);
    const side = delta === 0 ? (neighbor.id.localeCompare(request.endpointId) < 0 ? -1 : 1) : Math.sign(delta);
    if (Math.abs(delta) >= required) continue;
    const sideIndex = sideCounts.get(side) ?? 0;
    sideCounts.set(side, sideIndex + 1);
    const targetMagnitude = Math.max(required, Math.abs(delta)) + sideIndex * minimumAngularSeparation;
    const targetAngle = normalizeAngle(request.bundleAngleRadians + side * targetMagnitude);
    const endpoint = adjusted[request.endpointId];
    if (!endpoint || !Number.isFinite(neighbor.radius)) continue;
    adjusted[neighbor.id] = { x: endpoint.x + Math.cos(targetAngle) * neighbor.radius, y: endpoint.y + Math.sin(targetAngle) * neighbor.radius };
    movedNeighborIds.push(neighbor.id);
  }
  if (movedNeighborIds.length === 0) {
    return unchanged("no-relief-needed");
  }
  const afterMinimumSeparation = minimumSeparation(adjusted);
  const afterExtent = extent(adjusted);
  const afterFitScale = fitScale(adjusted, safety.viewport);
  const maxMovedNeighborDisplacement = Math.max(...movedNeighborIds.map((id) => {
    const before = positions[id];
    const after = adjusted[id];
    return before && after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
  }), 0);
  const separationSafe = beforeMinimumSeparation === 0 || afterMinimumSeparation >= beforeMinimumSeparation * (1 - safety.maxNodeSeparationLossRatio);
  const extentSafe = beforeExtent === 0 || afterExtent <= beforeExtent * (1 + safety.maxExtentGrowthRatio);
  const fitSafe = beforeFitScale === null || afterFitScale === null || afterFitScale >= beforeFitScale * (1 - (safety.maxFitScaleLossRatio ?? 0));
  const displacementSafe = maxMovedNeighborDisplacement <= (safety.maxMovedNeighborDisplacement ?? Infinity);
  if (!separationSafe) return { ...unchanged("unsafe-node-separation", movedNeighborIds), afterMinimumSeparation, afterExtent, afterFitScale, maxMovedNeighborDisplacement };
  if (!extentSafe) return { ...unchanged("unsafe-extent", movedNeighborIds), afterMinimumSeparation, afterExtent, afterFitScale, maxMovedNeighborDisplacement };
  if (!fitSafe) return { ...unchanged("unsafe-fit-scale", movedNeighborIds), afterMinimumSeparation, afterExtent, afterFitScale, maxMovedNeighborDisplacement };
  if (!displacementSafe) return { ...unchanged("unsafe-displacement", movedNeighborIds), afterMinimumSeparation, afterExtent, afterFitScale, maxMovedNeighborDisplacement };
  return { status: "applied", reason: "capacity-relieved", positions: adjusted, movedNeighborIds, beforeMinimumSeparation, afterMinimumSeparation, beforeExtent, afterExtent, beforeFitScale, afterFitScale, maxMovedNeighborDisplacement };
}
