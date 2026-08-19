import type { LabelRect } from "./viewport";

export type RelationLabelVisualState = {
  current: LabelRect;
  target: LabelRect;
};

export type ManualRelationLabelAnchor = {
  fraction: number;
  tangentOffset: number;
  normalOffset: number;
};

export type ManualNodeLabelOffset = { x: number; y: number };

export function deriveManualNodeLabelOffset(node: Point, label: Point): ManualNodeLabelOffset {
  return { x: label.x - node.x, y: label.y - node.y };
}

export function reconstructManualNodeLabelPosition(node: Point, offset: ManualNodeLabelOffset): Point {
  return { x: node.x + offset.x, y: node.y + offset.y };
}

type Point = { x: number; y: number };

function routeFrameAtFraction(samples: Point[], fraction: number): { point: Point; tangent: Point } {
  if (samples.length < 2) return { point: samples[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  const lengths = samples.slice(1).map((point, index) => Math.hypot(point.x - samples[index]!.x, point.y - samples[index]!.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const start = samples[index]!;
      const end = samples[index + 1]!;
      const tangentLength = Math.max(1, length);
      return {
        point: { x: start.x + (end.x - start.x) * (length === 0 ? 0 : remaining / length), y: start.y + (end.y - start.y) * (length === 0 ? 0 : remaining / length) },
        tangent: { x: (end.x - start.x) / tangentLength, y: (end.y - start.y) / tangentLength },
      };
    }
    remaining -= length;
  }
  return { point: samples[samples.length - 1]!, tangent: { x: 1, y: 0 } };
}

export function deriveManualRelationLabelAnchor(samples: Point[], label: Point): ManualRelationLabelAnchor {
  if (samples.length < 2) return { fraction: 0, tangentOffset: label.x - (samples[0]?.x ?? 0), normalOffset: label.y - (samples[0]?.y ?? 0) };
  let best = { distance: Infinity, fraction: 0, point: samples[0]!, tangent: { x: 1, y: 0 } };
  const lengths = samples.slice(1).map((point, index) => Math.hypot(point.x - samples[index]!.x, point.y - samples[index]!.y));
  const total = Math.max(1, lengths.reduce((sum, length) => sum + length, 0));
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const start = samples[index]!;
    const end = samples[index + 1]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((label.x - start.x) * dx + (label.y - start.y) * dy) / lengthSquared));
    const point = { x: start.x + dx * projection, y: start.y + dy * projection };
    const distance = Math.hypot(label.x - point.x, label.y - point.y);
    if (distance < best.distance) best = { distance, fraction: (travelled + lengths[index]! * projection) / total, point, tangent: { x: dx / Math.max(1, Math.sqrt(lengthSquared)), y: dy / Math.max(1, Math.sqrt(lengthSquared)) } };
    travelled += lengths[index]!;
  }
  const normal = { x: -best.tangent.y, y: best.tangent.x };
  const delta = { x: label.x - best.point.x, y: label.y - best.point.y };
  return { fraction: best.fraction, tangentOffset: delta.x * best.tangent.x + delta.y * best.tangent.y, normalOffset: delta.x * normal.x + delta.y * normal.y };
}

export function reconstructManualRelationLabelTarget(samples: Point[], anchor: ManualRelationLabelAnchor): Point {
  const frame = routeFrameAtFraction(samples, anchor.fraction);
  const normal = { x: -frame.tangent.y, y: frame.tangent.x };
  return { x: frame.point.x + frame.tangent.x * anchor.tangentOffset + normal.x * anchor.normalOffset, y: frame.point.y + frame.tangent.y * anchor.tangentOffset + normal.y * anchor.normalOffset };
}

export function reconcileRelationLabelVisualState(
  previous: RelationLabelVisualState | undefined,
  target: LabelRect,
  followTargetImmediately: boolean,
): RelationLabelVisualState {
  if (!previous || followTargetImmediately) return { current: target, target };
  return { current: previous.current, target };
}

export function interpolateLabelRect(start: LabelRect, end: LabelRect, fraction: number): LabelRect {
  const t = Math.max(0, Math.min(1, fraction));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    width: start.width + (end.width - start.width) * t,
    height: start.height + (end.height - start.height) * t,
    directionX: t === 0 ? start.directionX : end.directionX,
    directionY: t === 0 ? start.directionY : end.directionY,
  };
}

function overlaps(left: LabelRect, right: LabelRect): boolean {
  return Math.min(left.x + left.width / 2, right.x + right.width / 2)
    > Math.max(left.x - left.width / 2, right.x - right.width / 2)
    && Math.min(left.y + left.height / 2, right.y + right.height / 2)
    > Math.max(left.y - left.height / 2, right.y - right.height / 2);
}

function pathIntersects(rect: LabelRect, path: Array<{ x: number; y: number }>): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    const first = path[index]!;
    const second = path[index + 1]!;
    for (let sample = 0; sample <= 10; sample += 1) {
      const fraction = sample / 10;
      const point = {
        x: first.x + (second.x - first.x) * fraction,
        y: first.y + (second.y - first.y) * fraction,
      };
      if (point.x >= rect.x - rect.width / 2 - 4
        && point.x <= rect.x + rect.width / 2 + 4
        && point.y >= rect.y - rect.height / 2 - 4
        && point.y <= rect.y + rect.height / 2 + 4) return true;
    }
  }
  return path.length === 1 && pathIntersects(rect, [path[0]!, path[0]!]);
}

export function isLabelTransitionPathSafe(
  start: LabelRect,
  end: LabelRect,
  obstacles: { nodes?: Array<{ x: number; y: number }>; labels?: LabelRect[]; paths?: Array<Array<{ x: number; y: number }>> },
  samples = 20,
): boolean {
  for (let index = 0; index <= samples; index += 1) {
    const rect = interpolateLabelRect(start, end, index / Math.max(1, samples));
    if (obstacles.nodes?.some((node) => {
      const nearestX = Math.max(rect.x - rect.width / 2, Math.min(node.x, rect.x + rect.width / 2));
      const nearestY = Math.max(rect.y - rect.height / 2, Math.min(node.y, rect.y + rect.height / 2));
      return Math.hypot(node.x - nearestX, node.y - nearestY) < 36;
    })) return false;
    if (obstacles.labels?.some((label) => overlaps(rect, label))) return false;
    if (obstacles.paths?.some((path) => pathIntersects(rect, path))) return false;
  }
  return true;
}
