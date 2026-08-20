export const MIN_SCALE = 0.1;
export const MAX_SCALE = 2.5;
const RELATION_ROUTE_NODE_INFLUENCE_RADIUS = 60;
const RELATION_LABEL_NODE_RECOVERY_CLEARANCE = 60;
const SELF_LOOP_ORIENTATION_STEP = Math.PI / 18;
const SELF_LOOP_ORIENTATION_PREFERENCE_WEIGHT = 0.05;
const NODE_LABEL_ROUTE_HARD_CLEARANCE = 4;
const NODE_LABEL_ROUTE_HALO_WIDTH = 16;
const NODE_LABEL_ROUTE_HALO_WEIGHT = 8;
const ENTITY_ATTACHMENT_SHAPE: EntityAttachmentShape = {
  kind: "rounded-rectangle",
  halfWidth: 32,
  halfHeight: 32,
  cornerRadius: 12,
};

export function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function zoomScale(current: number, direction: "in" | "out"): number {
  return clampScale(current * (direction === "in" ? 1.1 : 0.9));
}

export function bringToFront(order: string[], id: string): string[] {
  return [...order.filter((candidate) => candidate !== id), id];
}

export function shouldShowNodeLabelConnector(offset: Point): boolean {
  return Math.hypot(offset.x, offset.y) > 46;
}

export function pinchZoomScale(
  initialScale: number,
  initialDistance: number,
  currentDistance: number,
): number {
  if (initialDistance <= 0) return clampScale(initialScale);
  return clampScale(initialScale * currentDistance / initialDistance);
}

export function centeredViewportTransform(
  scale: number,
  pan: { x: number; y: number },
  width: number,
  height: number,
): string {
  const centerX = width / 2;
  const centerY = height / 2;
  return `translate(${centerX + pan.x} ${centerY + pan.y}) scale(${scale}) translate(${-centerX} ${-centerY})`;
}

export type Point = { x: number; y: number };
export type ArrowheadGeometry = { tip: Point; baseA: Point; baseB: Point };
export type EntityAttachmentShape = {
  kind: "rounded-rectangle";
  halfWidth: number;
  halfHeight: number;
  cornerRadius: number;
};
export type EntityAttachment = { point: Point; outwardNormal: Point; distance: number };

function validateAttachmentDirection(direction: Point): Point {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) throw new RangeError("Attachment direction must be finite");
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) throw new RangeError("Attachment direction must be non-zero");
  return { x: direction.x / length, y: direction.y / length };
}

function roundedRectangleBoundaryIntersection(
  center: Point,
  direction: Point,
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
): EntityAttachment {
  if (![center.x, center.y, halfWidth, halfHeight, cornerRadius].every(Number.isFinite)
    || halfWidth <= 0 || halfHeight <= 0 || cornerRadius < 0 || cornerRadius > Math.min(halfWidth, halfHeight)) {
    throw new RangeError("Invalid rounded rectangle attachment shape");
  }
  const unit = validateAttachmentDirection(direction);
  const sx = unit.x < 0 ? -1 : 1;
  const sy = unit.y < 0 ? -1 : 1;
  const ax = Math.abs(unit.x);
  const ay = Math.abs(unit.y);
  const straightWidth = halfWidth - cornerRadius;
  const straightHeight = halfHeight - cornerRadius;
  const candidates: Array<{ distance: number; normal: Point }> = [];
  if (ax > 0) {
    const distance = halfWidth / ax;
    if (distance * ay <= straightHeight + 1e-9) candidates.push({ distance, normal: { x: sx, y: 0 } });
  }
  if (ay > 0) {
    const distance = halfHeight / ay;
    if (distance * ax <= straightWidth + 1e-9) candidates.push({ distance, normal: { x: 0, y: sy } });
  }
  if (cornerRadius > 0) {
    const corner = { x: straightWidth, y: straightHeight };
    const dot = ax * corner.x + ay * corner.y;
    const discriminant = dot * dot - (corner.x * corner.x + corner.y * corner.y - cornerRadius * cornerRadius);
    if (discriminant >= -1e-9) {
      const distance = dot + Math.sqrt(Math.max(0, discriminant));
      const x = distance * ax;
      const y = distance * ay;
      if (x >= straightWidth - 1e-9 && y >= straightHeight - 1e-9) {
        const normalLength = Math.hypot(x - corner.x, y - corner.y);
        candidates.push({ distance, normal: { x: sx * (x - corner.x) / normalLength, y: sy * (y - corner.y) / normalLength } });
      }
    }
  }
  const result = candidates.sort((left, right) => left.distance - right.distance)[0];
  if (!result) throw new RangeError("No rounded rectangle attachment intersection");
  return {
    point: { x: center.x + unit.x * result.distance, y: center.y + unit.y * result.distance },
    outwardNormal: result.normal,
    distance: result.distance,
  };
}

export function getEntityAttachment({
  center,
  direction,
  shape,
}: {
  center: Point;
  direction: Point;
  shape: EntityAttachmentShape;
}): EntityAttachment {
  if (shape.kind !== "rounded-rectangle") throw new RangeError(`Unsupported attachment shape: ${shape.kind}`);
  return roundedRectangleBoundaryIntersection(center, direction, shape.halfWidth, shape.halfHeight, shape.cornerRadius);
}

export function pointAtDistanceFromRouteEnd(samples: Point[], distance: number): Point {
  const end = samples.at(-1) ?? { x: 0, y: 0 };
  if (samples.length === 0 || !Number.isFinite(distance) || distance <= 0) return { ...end };
  let remaining = distance;
  for (let index = samples.length - 1; index > 0; index -= 1) {
    const current = samples[index]!;
    const previous = samples[index - 1]!;
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (segmentLength >= remaining && segmentLength > 0) {
      const ratio = remaining / segmentLength;
      return {
        x: current.x + (previous.x - current.x) * ratio,
        y: current.y + (previous.y - current.y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return { ...(samples[0] ?? end) };
}

export function getArrowheadGeometry(samples: Point[], strokeWidth: number): ArrowheadGeometry {
  const tip = { ...(samples.at(-1) ?? { x: 0, y: 0 }) };
  const length = Math.max(0, strokeWidth) * 8;
  const halfBaseWidth = Math.max(0, strokeWidth) * 3;
  const behindTip = pointAtDistanceFromRouteEnd(samples, length);
  const directionLength = Math.hypot(tip.x - behindTip.x, tip.y - behindTip.y);
  const direction = directionLength > 0
    ? { x: (tip.x - behindTip.x) / directionLength, y: (tip.y - behindTip.y) / directionLength }
    : { x: 1, y: 0 };
  const baseCenter = { x: tip.x - direction.x * length, y: tip.y - direction.y * length };
  const perpendicular = { x: -direction.y, y: direction.x };
  return {
    tip,
    baseA: { x: baseCenter.x + perpendicular.x * halfBaseWidth, y: baseCenter.y + perpendicular.y * halfBaseWidth },
    baseB: { x: baseCenter.x - perpendicular.x * halfBaseWidth, y: baseCenter.y - perpendicular.y * halfBaseWidth },
  };
}
export type LabelRect = Point & { width: number; height: number; directionX: number; directionY: number };

function rectOverlapArea(left: LabelRect, right: LabelRect): number {
  const overlapWidth = Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2)
    - Math.max(left.x - left.width / 2, right.x - right.width / 2));
  const overlapHeight = Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2)
    - Math.max(left.y - left.height / 2, right.y - right.height / 2));
  return overlapWidth * overlapHeight;
}

function pointToRectDistance(point: Point, rect: LabelRect): number {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}

function placementMovementCost(candidate: LabelRect, previous: LabelRect | undefined): number {
  if (!previous) return 0;
  return Math.hypot(candidate.x - previous.x, candidate.y - previous.y) * 4;
}

function minimumNodeClearance(candidate: LabelRect, nodes: Point[]): number {
  if (nodes.length === 0) return Infinity;
  return Math.min(...nodes.map((node) => {
    const nearestX = Math.max(candidate.x - candidate.width / 2, Math.min(node.x, candidate.x + candidate.width / 2));
    const nearestY = Math.max(candidate.y - candidate.height / 2, Math.min(node.y, candidate.y + candidate.height / 2));
    return Math.hypot(node.x - nearestX, node.y - nearestY);
  }));
}

export function placeEdgeLabel(
  samples: Point[],
  label: string,
  occupiedLabels: LabelRect[],
  nodes: Point[],
  otherEdgePaths: Point[][] = [],
  previousPlacement?: LabelRect,
): LabelRect {
  const fallback = samples[Math.floor(samples.length / 2)] ?? { x: 0, y: 0 };
  const width = Math.max(48, Math.min(220, textDisplayWidth(label, 32) + 12));
  const candidateIndexes = [20, 16, 24, 12, 28, 8, 32, 4, 36]
    .map((index) => Math.max(0, Math.min(samples.length - 1, Math.round(index / 40 * (samples.length - 1)))))
    .filter((index, position, indexes) => indexes.indexOf(index) === position);

  const candidates = candidateIndexes.flatMap((sampleIndex, alongPathPreference) => {
    const point = samples[sampleIndex] ?? fallback;
    const previous = samples[Math.max(0, sampleIndex - 1)] ?? point;
    const next = samples[Math.min(samples.length - 1, sampleIndex + 1)] ?? point;
    const tangentLength = Math.max(1, Math.hypot(next.x - previous.x, next.y - previous.y));
    const normalX = -(next.y - previous.y) / tangentLength;
    const normalY = (next.x - previous.x) / tangentLength;
    const normal = {
      x: Math.abs(normalX) < 1e-12 ? 0 : normalX,
      y: Math.abs(normalY) < 1e-12 ? 0 : normalY,
    };
    return [0, -24, 24, -40, 40].map((normalOffset, awayFromPathPreference) => ({
      sampleIndex,
      normalOffset,
      candidate: {
        x: point.x + normal.x * normalOffset,
        y: point.y + normal.y * normalOffset,
        width,
        height: 22,
        directionX: normal.x,
        directionY: normal.y,
      },
      preference: alongPathPreference * 5 + awayFromPathPreference,
    }));
  });

  const scoredCandidates = candidates.map(({ candidate, sampleIndex, normalOffset, preference }) => {
    const labelOverlap = occupiedLabels.reduce((total, occupied) => total + rectOverlapArea(candidate, occupied), 0);
    const nodeOverlap = nodes.reduce((total, node) => {
      const nearestX = Math.max(candidate.x - width / 2, Math.min(node.x, candidate.x + width / 2));
      const nearestY = Math.max(candidate.y - 11, Math.min(node.y, candidate.y + 11));
      return total + (Math.hypot(node.x - nearestX, node.y - nearestY) < 36 ? 1 : 0);
    }, 0);
    const edgeOverlap = otherEdgePaths.reduce((total, path) => total + path.reduce((pathTotal, pathPoint) =>
      pathTotal + (pathPoint.x >= candidate.x - width / 2 - 4
        && pathPoint.x <= candidate.x + width / 2 + 4
        && pathPoint.y >= candidate.y - 15
        && pathPoint.y <= candidate.y + 15 ? 1 : 0), 0), 0);
    return {
      candidate,
      sampleIndex,
      normalOffset,
      labelOverlap,
      nodeOverlap,
      edgeOverlap,
      preference,
      nodeClearance: minimumNodeClearance(candidate, nodes),
      score: labelOverlap * 100
        + nodeOverlap * 10000
        + edgeOverlap * 500
        + preference
        + placementMovementCost(candidate, previousPlacement),
    };
  });
  const stableCandidate = scoredCandidates.reduce((best, current) => current.score < best.score ? current : best);
  const recoveredCandidate = scoredCandidates
    .filter(({ sampleIndex, labelOverlap, nodeOverlap, edgeOverlap }) =>
      sampleIndex === stableCandidate.sampleIndex && labelOverlap === 0 && nodeOverlap === 0 && edgeOverlap === 0)
    .sort((left, right) => Math.abs(left.normalOffset) - Math.abs(right.normalOffset))[0];
  const normalRecoveredCandidate = recoveredCandidate ?? stableCandidate;
  const safeSameNormalCandidates = scoredCandidates
    .filter(({ normalOffset, labelOverlap, nodeOverlap, edgeOverlap }) =>
      normalOffset === normalRecoveredCandidate.normalOffset
      && labelOverlap === 0 && nodeOverlap === 0 && edgeOverlap === 0)
    .sort((left, right) => left.preference - right.preference);
  const anchorCandidate = safeSameNormalCandidates[0];
  const selected = anchorCandidate && anchorCandidate.nodeClearance < RELATION_LABEL_NODE_RECOVERY_CLEARANCE
    ? safeSameNormalCandidates
      .slice()
      .sort((left, right) => right.nodeClearance - left.nodeClearance || left.preference - right.preference)[0]
    : (anchorCandidate ?? normalRecoveredCandidate);
  return selected.candidate;
}

function textDisplayWidth(value: string, maxLength: number): number {
  return Array.from(value.trim().replace(/\s+/gu, " ")).slice(0, maxLength).reduce(
    (width, character) => width + (labelCharacterWidth(character) === 2 ? 10 : 6.5),
    0,
  );
}

export function placeNodeLabel(
  node: Point,
  name: string,
  description: string,
  occupiedLabels: LabelRect[],
  otherNodes: Point[],
  edgePaths: Point[][],
  previousPlacement?: LabelRect,
): LabelRect {
  const descriptionLines = description.trim()
    ? wrapNodeLabel(truncateNodeText(description, 28), 20)
    : [];
  const width = Math.max(48, Math.min(180, Math.max(
    textDisplayWidth(name, 22),
    ...descriptionLines.map((line) => textDisplayWidth(line, 20)),
  ) + 12));
  const height = descriptionLines.length === 0 ? 20 : descriptionLines.length === 1 ? 34 : 48;
  const angles = Array.from({ length: 32 }, (_, index) => Math.PI / 2 + index * Math.PI / 16);

  return angles.map((angle, index) => {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const distance = 40 + Math.abs(directionX) * width / 2 + Math.abs(directionY) * height / 2;
    const candidate: LabelRect = {
      x: node.x + directionX * distance,
      y: node.y + directionY * distance,
      width,
      height,
      directionX,
      directionY,
    };
    const left = candidate.x - width / 2;
    const right = candidate.x + width / 2;
    const top = candidate.y - height / 2;
    const bottom = candidate.y + height / 2;
    const modulo = index % 8;
    const cardinalDistanceSteps = Math.min(modulo, 8 - modulo);
    const cardinalPreferencePenalty = cardinalDistanceSteps * 0.5;
    let score = index * 0.01 + cardinalPreferencePenalty;

    for (const occupied of occupiedLabels) {
      const overlapArea = rectOverlapArea(candidate, occupied);
      if (overlapArea > 0) score += 10000 + overlapArea;
    }
    for (const otherNode of otherNodes) {
      const nearestX = Math.max(left, Math.min(otherNode.x, right));
      const nearestY = Math.max(top, Math.min(otherNode.y, bottom));
      if (Math.hypot(otherNode.x - nearestX, otherNode.y - nearestY) < 36) score += 8000;
    }
    for (const path of edgePaths) {
      for (const point of path) {
        const routeDistance = pointToRectDistance(point, candidate);
        if (routeDistance <= NODE_LABEL_ROUTE_HARD_CLEARANCE) {
          score += 80;
        } else if (routeDistance < NODE_LABEL_ROUTE_HARD_CLEARANCE + NODE_LABEL_ROUTE_HALO_WIDTH) {
          const normalized = (NODE_LABEL_ROUTE_HARD_CLEARANCE + NODE_LABEL_ROUTE_HALO_WIDTH - routeDistance)
            / NODE_LABEL_ROUTE_HALO_WIDTH;
          score += NODE_LABEL_ROUTE_HALO_WEIGHT * normalized ** 2;
        }
      }
    }
    return { candidate, score: score + placementMovementCost(candidate, previousPlacement) };
  }).reduce((best, current) => current.score < best.score ? current : best).candidate;
}

export function fitGraphView(
  points: Point[],
  width: number,
  height: number,
  padding = 96,
): { scale: number; pan: Point } {
  if (points.length === 0) return { scale: 1, pan: { x: 0, y: 0 } };

  const minX = Math.min(...points.map(({ x }) => x)) - 32;
  const maxX = Math.max(...points.map(({ x }) => x)) + 32;
  const minY = Math.min(...points.map(({ y }) => y)) - 32;
  const maxY = Math.max(...points.map(({ y }) => y)) + 32;
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const scale = clampScale(Math.min(
    1,
    Math.max(1, width - padding * 2) / boundsWidth,
    Math.max(1, height - padding * 2) / boundsHeight,
  ));
  const graphCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const viewportCenter = { x: width / 2, y: height / 2 };

  return {
    scale,
    pan: {
      x: scale * (viewportCenter.x - graphCenter.x),
      y: scale * (viewportCenter.y - graphCenter.y),
    },
  };
}

export function graphEdgePath(
  source: Point,
  target: Point,
  parallelIndex: number,
  parallelCount: number,
  obstacles: Point[] = [],
  occupiedPaths: Point[][] = [],
  selfRelation = source.x === target.x && source.y === target.y,
  overlapIndex = occupiedPaths.length,
): string {
  return routeGraphEdge(source, target, parallelIndex, parallelCount, obstacles, occupiedPaths, selfRelation, overlapIndex).path;
}

function sampleCubicCurve(start: Point, control1: Point, control2: Point, end: Point): Point[] {
  return Array.from({ length: 41 }, (_, step) => {
    const t = step / 40;
    const inverseT = 1 - t;
    return {
      x: inverseT ** 3 * start.x + 3 * inverseT ** 2 * t * control1.x + 3 * inverseT * t ** 2 * control2.x + t ** 3 * end.x,
      y: inverseT ** 3 * start.y + 3 * inverseT ** 2 * t * control1.y + 3 * inverseT * t ** 2 * control2.y + t ** 3 * end.y,
    };
  });
}

export function routeGraphEdge(
  source: Point,
  target: Point,
  parallelIndex: number,
  parallelCount: number,
  obstacles: Point[] = [],
  occupiedPaths: Point[][] = [],
  selfRelation = source.x === target.x && source.y === target.y,
  overlapIndex = occupiedPaths.length,
  manualOffset?: number,
  manualSelfLoop?: { orientation: number; radius: number },
): { path: string; samples: Point[]; labelPoint: Point; controlPoint: Point } {
  if (source.x === target.x && source.y === target.y && selfRelation) {
    if (manualSelfLoop === undefined) return selectAutomaticSelfLoopGeometry(source, parallelIndex, obstacles);
    const orientation = manualSelfLoop?.orientation ?? -Math.PI / 2 + parallelIndex % 3 * Math.PI * 2 / 3;
    const direction = { x: Math.cos(orientation), y: Math.sin(orientation) };
    const perpendicular = { x: -direction.y, y: direction.x };
    const spread = Math.PI / 4;
    const outwardDistance = Math.cos(spread) * 32;
    const sidewaysDistance = Math.sin(spread) * 32;
    const radius = manualSelfLoop?.radius ?? 38 + Math.floor(parallelIndex / 3) * 14;
    const centerDistance = outwardDistance + Math.sqrt(Math.max(1, radius * radius - sidewaysDistance * sidewaysDistance));
    const provisionalStart = {
      x: direction.x * outwardDistance + perpendicular.x * sidewaysDistance,
      y: direction.y * outwardDistance + perpendicular.y * sidewaysDistance,
    };
    const provisionalEnd = {
      x: direction.x * outwardDistance - perpendicular.x * sidewaysDistance,
      y: direction.y * outwardDistance - perpendicular.y * sidewaysDistance,
    };
    const startAttachment = getEntityAttachment({
      center: source,
      direction: provisionalStart,
      shape: ENTITY_ATTACHMENT_SHAPE,
    });
    const endAttachment = getEntityAttachment({
      center: source,
      direction: provisionalEnd,
      shape: ENTITY_ATTACHMENT_SHAPE,
    });
    const start = startAttachment.point;
    const end = endAttachment.point;
    const chordX = end.x - start.x;
    const chordY = end.y - start.y;
    const chordLength = Math.hypot(chordX, chordY);
    if (chordLength > radius * 2) throw new RangeError("Self-loop radius cannot contain attachment chord");
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const centerOffset = Math.sqrt(Math.max(0, radius * radius - chordLength * chordLength / 4));
    const normal = { x: -chordY / Math.max(1, chordLength), y: chordX / Math.max(1, chordLength) };
    const candidateCenters = [
      { x: midpoint.x + normal.x * centerOffset, y: midpoint.y + normal.y * centerOffset },
      { x: midpoint.x - normal.x * centerOffset, y: midpoint.y - normal.y * centerOffset },
    ];
    const preferredCenter = { x: source.x + direction.x * centerDistance, y: source.y + direction.y * centerDistance };
    const center = candidateCenters.sort((left, right) =>
      Math.hypot(left.x - preferredCenter.x, left.y - preferredCenter.y) - Math.hypot(right.x - preferredCenter.x, right.y - preferredCenter.y))[0]!;
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    while (endAngle >= startAngle) endAngle -= Math.PI * 2;
    const samples = Array.from({ length: 41 }, (_, step) => {
      const angle = startAngle + step / 40 * (endAngle - startAngle);
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    });
    return {
      path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 0 ${end.x} ${end.y}`,
      samples,
      labelPoint: { x: center.x + direction.x * radius, y: center.y + direction.y * radius },
      controlPoint: { x: center.x + direction.x * radius, y: center.y + direction.y * radius },
    };
  }
  if (source.x === target.x && source.y === target.y) {
    const direction = overlapIndex % 2 === 0 ? -1 : 1;
    const radius = 48 + Math.floor(overlapIndex / 2) * 16;
    const edgeY = source.y + direction * 22;
    const controlY = source.y + direction * radius;
    const start = { x: source.x + 22, y: edgeY };
    const control1 = { x: source.x + radius, y: controlY };
    const control2 = { x: source.x - radius, y: controlY };
    const end = { x: source.x - 22, y: edgeY };
    const samples = sampleCubicCurve(start, control1, control2, end);
    return {
      path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
      samples,
      labelPoint: samples[20]!,
      controlPoint: { x: source.x, y: controlY },
    };
  }

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / length;
  const unitY = dy / length;
  const direction = parallelIndex % 2 === 0 ? 1 : -1;
  const rank = Math.floor(parallelIndex / 2) + 1;
  const baseOffset = parallelCount === 1 ? 0 : direction * (40 + (rank - 1) * 24);
  // Callers exclude the source and target by identity. Keep unrelated nodes
  // even when they have been dragged onto an endpoint's coordinates.
  const routeObstacles = obstacles;
  const offsets = [baseOffset];
  for (let step = 1; step <= 16; step += 1) {
    const magnitude = Math.abs(baseOffset) + step * 12;
    offsets.push(direction * magnitude, -direction * magnitude);
  }

  function geometryForOffset(offset: number) {
    const control = {
      x: (source.x + target.x) / 2 - unitY * offset,
      y: (source.y + target.y) / 2 + unitX * offset,
    };
    const sourceAttachment = getEntityAttachment({
      center: source,
      direction: { x: control.x - source.x, y: control.y - source.y },
      shape: ENTITY_ATTACHMENT_SHAPE,
    });
    const targetAttachment = getEntityAttachment({
      center: target,
      direction: { x: control.x - target.x, y: control.y - target.y },
      shape: ENTITY_ATTACHMENT_SHAPE,
    });
    let start = sourceAttachment.point;
    let end = targetAttachment.point;
    // Pathological short edges must not emit an inverted segment.
    if ((end.x - start.x) * unitX + (end.y - start.y) * unitY <= 0) {
      const fallbackInset = length * 0.3;
      const sourceLength = Math.max(1, Math.hypot(control.x - source.x, control.y - source.y));
      const targetLength = Math.max(1, Math.hypot(target.x - control.x, target.y - control.y));
      start = { x: source.x + (control.x - source.x) / sourceLength * fallbackInset, y: source.y + (control.y - source.y) / sourceLength * fallbackInset };
      end = { x: target.x - (target.x - control.x) / targetLength * fallbackInset, y: target.y - (target.y - control.y) / targetLength * fallbackInset };
    }
    const samples = Array.from({ length: 41 }, (_, step) => {
      const t = step / 40;
      if (offset === 0) {
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
      }
      const inverseT = 1 - t;
      return {
        x: inverseT * inverseT * start.x + 2 * inverseT * t * control.x + t * t * end.x,
        y: inverseT * inverseT * start.y + 2 * inverseT * t * control.y + t * t * end.y,
      };
    });
    return {
      path: offset === 0
        ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      samples,
      labelPoint: samples[20]!,
      controlPoint: control,
    };
  }

  if (manualOffset !== undefined) return geometryForOffset(manualOffset);

  let bestGeometry: ReturnType<typeof geometryForOffset> | null = null;
  let bestScore = Infinity;
  for (const candidateOffset of offsets) {
    const geometry = geometryForOffset(candidateOffset);
    const { samples } = geometry;
    const nodeOverlapScore = routeObstacles.reduce((total, obstacle) => total + samples.reduce((sampleTotal, point) => {
      const penetration = Math.max(0, RELATION_ROUTE_NODE_INFLUENCE_RADIUS - Math.hypot(point.x - obstacle.x, point.y - obstacle.y));
      return sampleTotal + penetration * penetration;
    }, 0), 0);
    const innerSamples = samples.slice(5, -5);
    const overlapsEdge = occupiedPaths.some((occupiedPath) => {
      const occupiedInnerSamples = occupiedPath.slice(5, -5);
      let consecutiveNearDistance = 0;
      let previousPoint: Point | null = null;
      for (const point of innerSamples) {
        const isNear = occupiedInnerSamples.some((occupiedPoint) =>
          Math.hypot(point.x - occupiedPoint.x, point.y - occupiedPoint.y) < 8);
        consecutiveNearDistance = isNear && previousPoint
          ? consecutiveNearDistance + Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y)
          : 0;
        previousPoint = isNear ? point : null;
        if (consecutiveNearDistance >= 24) return true;
      }
      return false;
    });
    const score = nodeOverlapScore * 100 + (overlapsEdge ? 10000 : 0) + Math.abs(candidateOffset) * .01;
    if (score < bestScore) {
      bestGeometry = geometry;
      bestScore = score;
    }
    if (score === 0) break;
  }
  return bestGeometry ?? geometryForOffset(baseOffset);
}

function shortestAngularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function normalizeAngle(angle: number): number {
  const normalized = angle % (Math.PI * 2);
  return normalized < 0 ? normalized + Math.PI * 2 : normalized;
}

function automaticSelfLoopGeometry(source: Point, orientation: number, radius: number): { path: string; samples: Point[]; labelPoint: Point; controlPoint: Point } {
  const direction = { x: Math.cos(orientation), y: Math.sin(orientation) };
  const perpendicular = { x: -direction.y, y: direction.x };
  const spread = Math.PI / 4;
  const outwardDistance = Math.cos(spread) * 32;
  const sidewaysDistance = Math.sin(spread) * 32;
  const centerDistance = outwardDistance + Math.sqrt(Math.max(1, radius * radius - sidewaysDistance * sidewaysDistance));
  const provisionalStart = { x: direction.x * outwardDistance + perpendicular.x * sidewaysDistance, y: direction.y * outwardDistance + perpendicular.y * sidewaysDistance };
  const provisionalEnd = { x: direction.x * outwardDistance - perpendicular.x * sidewaysDistance, y: direction.y * outwardDistance - perpendicular.y * sidewaysDistance };
  const start = getEntityAttachment({ center: source, direction: provisionalStart, shape: ENTITY_ATTACHMENT_SHAPE }).point;
  const end = getEntityAttachment({ center: source, direction: provisionalEnd, shape: ENTITY_ATTACHMENT_SHAPE }).point;
  const chordX = end.x - start.x;
  const chordY = end.y - start.y;
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength > radius * 2) throw new RangeError("Self-loop radius cannot contain attachment chord");
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const centerOffset = Math.sqrt(Math.max(0, radius * radius - chordLength * chordLength / 4));
  const normal = { x: -chordY / Math.max(1, chordLength), y: chordX / Math.max(1, chordLength) };
  const centers = [
    { x: midpoint.x + normal.x * centerOffset, y: midpoint.y + normal.y * centerOffset },
    { x: midpoint.x - normal.x * centerOffset, y: midpoint.y - normal.y * centerOffset },
  ];
  const preferredCenter = { x: source.x + direction.x * centerDistance, y: source.y + direction.y * centerDistance };
  const center = centers.sort((left, right) => Math.hypot(left.x - preferredCenter.x, left.y - preferredCenter.y) - Math.hypot(right.x - preferredCenter.x, right.y - preferredCenter.y))[0]!;
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  while (endAngle >= startAngle) endAngle -= Math.PI * 2;
  const samples = Array.from({ length: 41 }, (_, step) => {
    const angle = startAngle + step / 40 * (endAngle - startAngle);
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  return {
    path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 0 ${end.x} ${end.y}`,
    samples,
    labelPoint: { x: center.x + direction.x * radius, y: center.y + direction.y * radius },
    controlPoint: { x: center.x + direction.x * radius, y: center.y + direction.y * radius },
  };
}

function selectAutomaticSelfLoopGeometry(source: Point, parallelIndex: number, obstacles: Point[]): ReturnType<typeof automaticSelfLoopGeometry> {
  const preferred = -Math.PI / 2 + parallelIndex % 3 * Math.PI * 2 / 3;
  const radius = 38 + Math.floor(parallelIndex / 3) * 14;
  const candidates = Array.from({ length: 36 }, (_, index) => preferred + (index <= 18 ? index : index - 36) * SELF_LOOP_ORIENTATION_STEP);
  let best: { geometry: ReturnType<typeof automaticSelfLoopGeometry>; score: number; delta: number; angle: number } | null = null;
  for (const orientation of candidates) {
    const geometry = automaticSelfLoopGeometry(source, orientation, radius);
    const nodePressure = obstacles.reduce((total, obstacle) => total + geometry.samples.reduce((sampleTotal, sample) => {
      const penetration = Math.max(0, (RELATION_ROUTE_NODE_INFLUENCE_RADIUS - Math.hypot(sample.x - obstacle.x, sample.y - obstacle.y)) / RELATION_ROUTE_NODE_INFLUENCE_RADIUS);
      return sampleTotal + penetration * penetration;
    }, 0), 0) / geometry.samples.length;
    const delta = shortestAngularDistance(orientation, preferred);
    const score = nodePressure + SELF_LOOP_ORIENTATION_PREFERENCE_WEIGHT * (delta / Math.PI) ** 2;
    const angle = normalizeAngle(orientation);
    if (!best || score < best.score - 1e-12 || (Math.abs(score - best.score) <= 1e-12 && (delta < best.delta - 1e-12 || (Math.abs(delta - best.delta) <= 1e-12 && angle < best.angle)))) {
      best = { geometry, score, delta, angle };
    }
  }
  return best!.geometry;
}

function labelCharacterWidth(character: string): number {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character) ? 2 : 1;
}

export function truncateNodeText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  return `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

export function wrapNodeLabel(label: string, maxLineWidth = 10): string[] {
  let remaining = Array.from(label.trim());
  if (remaining.length === 0) return [""];
  const lines: string[] = [];

  while (remaining.length > 0 && lines.length < 2) {
    let width = 0;
    let limit = 0;
    while (limit < remaining.length) {
      const nextWidth = width + labelCharacterWidth(remaining[limit]!);
      if (nextWidth > maxLineWidth) break;
      width = nextWidth;
      limit += 1;
    }

    if (limit === remaining.length) {
      lines.push(remaining.join("").trim());
      remaining = [];
      break;
    }

    const nextCharacterIsSpace = /\s/u.test(remaining[limit] ?? "");
    let lastSpace = -1;
    for (let index = 0; index < limit; index += 1) {
      if (/\s/u.test(remaining[index]!)) lastSpace = index;
    }
    const breakAt = nextCharacterIsSpace ? limit : (lastSpace > 0 ? lastSpace : limit);
    lines.push(remaining.slice(0, breakAt).join("").trim());
    remaining = remaining.slice(nextCharacterIsSpace ? limit + 1 : (lastSpace > 0 ? lastSpace + 1 : limit));
    while (remaining[0] && /\s/u.test(remaining[0])) remaining.shift();
  }

  if (remaining.length > 0) {
    lines[1] = `${lines[1]?.replace(/[\s…]+$/u, "") ?? ""}…`;
  }
  return lines;
}
