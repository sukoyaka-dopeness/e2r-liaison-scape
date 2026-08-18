export const MIN_SCALE = 0.1;
export const MAX_SCALE = 2.5;

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

type Point = { x: number; y: number };
export type LabelRect = Point & { width: number; height: number; directionX: number; directionY: number };

function rectOverlapArea(left: LabelRect, right: LabelRect): number {
  const overlapWidth = Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2)
    - Math.max(left.x - left.width / 2, right.x - right.width / 2));
  const overlapHeight = Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2)
    - Math.max(left.y - left.height / 2, right.y - right.height / 2));
  return overlapWidth * overlapHeight;
}

function placementMovementCost(candidate: LabelRect, previous: LabelRect | undefined): number {
  if (!previous) return 0;
  return Math.hypot(candidate.x - previous.x, candidate.y - previous.y) * 4;
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

  return candidates.map(({ candidate, preference }) => {
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
      score: labelOverlap * 100
        + nodeOverlap * 10000
        + edgeOverlap * 500
        + preference
        + placementMovementCost(candidate, previousPlacement),
    };
  }).reduce((best, current) => current.score < best.score ? current : best).candidate;
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
  const width = Math.max(48, Math.min(180, Math.max(
    textDisplayWidth(name, 22),
    textDisplayWidth(description, 28),
  ) + 12));
  const height = description.trim() ? 34 : 20;
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
    let score = index * 0.01;

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
        if (point.x >= left - 4 && point.x <= right + 4 && point.y >= top - 4 && point.y <= bottom + 4) score += 80;
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
    const orientation = manualSelfLoop?.orientation ?? -Math.PI / 2 + parallelIndex % 3 * Math.PI * 2 / 3;
    const direction = { x: Math.cos(orientation), y: Math.sin(orientation) };
    const perpendicular = { x: -direction.y, y: direction.x };
    const spread = Math.PI / 4;
    const outwardDistance = Math.cos(spread) * 32;
    const sidewaysDistance = Math.sin(spread) * 32;
    const radius = manualSelfLoop?.radius ?? 38 + Math.floor(parallelIndex / 3) * 14;
    const centerDistance = outwardDistance + Math.sqrt(Math.max(1, radius * radius - sidewaysDistance * sidewaysDistance));
    const center = { x: source.x + direction.x * centerDistance, y: source.y + direction.y * centerDistance };
    const start = {
      x: source.x + direction.x * outwardDistance + perpendicular.x * sidewaysDistance,
      y: source.y + direction.y * outwardDistance + perpendicular.y * sidewaysDistance,
    };
    const end = {
      x: source.x + direction.x * outwardDistance - perpendicular.x * sidewaysDistance,
      y: source.y + direction.y * outwardDistance - perpendicular.y * sidewaysDistance,
    };
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
  const sourceInset = Math.min(32, length * 0.3);
  const targetInset = Math.min(38, length * 0.3);
  const direction = parallelIndex % 2 === 0 ? 1 : -1;
  const rank = Math.floor(parallelIndex / 2) + 1;
  const baseOffset = parallelCount === 1 ? 0 : direction * (40 + (rank - 1) * 24);
  // Callers exclude the source and target by identity. Keep unrelated nodes
  // even when they have been dragged onto an endpoint's coordinates.
  const routeObstacles = obstacles;
  const offsets = [baseOffset];
  for (let step = 1; step <= 8; step += 1) {
    const magnitude = Math.abs(baseOffset) + step * 24;
    offsets.push(direction * magnitude, -direction * magnitude);
  }

  function geometryForOffset(offset: number) {
    const control = {
      x: (source.x + target.x) / 2 - unitY * offset,
      y: (source.y + target.y) / 2 + unitX * offset,
    };
    const sourceTangentLength = Math.max(1, Math.hypot(control.x - source.x, control.y - source.y));
    const targetTangentLength = Math.max(1, Math.hypot(target.x - control.x, target.y - control.y));
    const start = {
      x: source.x + (control.x - source.x) / sourceTangentLength * sourceInset,
      y: source.y + (control.y - source.y) / sourceTangentLength * sourceInset,
    };
    const end = {
      x: target.x - (target.x - control.x) / targetTangentLength * targetInset,
      y: target.y - (target.y - control.y) / targetTangentLength * targetInset,
    };
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
      const penetration = Math.max(0, 42 - Math.hypot(point.x - obstacle.x, point.y - obstacle.y));
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
