export type GraphPoint = { x: number; y: number };
export type GraphBounds = { left: number; right: number; top: number; bottom: number };

export const INITIAL_ENTITY_BODY_HALF_SIZE = 32;
export const INITIAL_ENTITY_SAFETY_MARGIN = 12;
export const INITIAL_ENTITY_CLEARANCE = INITIAL_ENTITY_BODY_HALF_SIZE * 2 + INITIAL_ENTITY_SAFETY_MARGIN;
export const INITIAL_ENTITY_MAX_RING = 8;

function finitePoint(point: GraphPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function overlaps(left: GraphPoint, right: GraphPoint, clearance: number): boolean {
  return Math.abs(left.x - right.x) < clearance && Math.abs(left.y - right.y) < clearance;
}

function withinBounds(point: GraphPoint, bounds: GraphBounds | null, halfExtent: number): boolean {
  if (!bounds) return true;
  return point.x - halfExtent >= bounds.left
    && point.x + halfExtent <= bounds.right
    && point.y - halfExtent >= bounds.top
    && point.y + halfExtent <= bounds.bottom;
}

function isFree(point: GraphPoint, occupied: readonly GraphPoint[], bounds: GraphBounds | null): boolean {
  return withinBounds(point, bounds, INITIAL_ENTITY_BODY_HALF_SIZE)
    && occupied.every((other) => !overlaps(point, other, INITIAL_ENTITY_CLEARANCE));
}

/** Returns a deterministic free graph-space point without mutating occupied positions. */
export function placeInitialEntity(
  desired: GraphPoint,
  occupied: readonly GraphPoint[],
  visibleBounds: GraphBounds | null = null,
): GraphPoint {
  if (!finitePoint(desired) || occupied.some((point) => !finitePoint(point))) return desired;
  if (isFree(desired, occupied, visibleBounds)) return { ...desired };

  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  for (let ring = 1; ring <= INITIAL_ENTITY_MAX_RING; ring += 1) {
    const distance = INITIAL_ENTITY_CLEARANCE * ring;
    for (const direction of directions) {
      const candidate = { x: desired.x + direction.x * distance, y: desired.y + direction.y * distance };
      if (isFree(candidate, occupied, visibleBounds)) return candidate;
    }
  }
  return { ...desired };
}

