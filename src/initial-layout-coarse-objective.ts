import type { LayoutPoint } from "./auto-layout.ts";

export type CoarseObjectiveEntity = { id: string; label: string; description?: string };
export type CoarseObjectiveRelation = { id: string; sourceId: string; targetId: string; label?: string };
export type CoarseObjectiveInput = {
  entities: readonly CoarseObjectiveEntity[];
  relations: readonly CoarseObjectiveRelation[];
  positions: Readonly<Record<string, LayoutPoint>>;
};

export type CoarseObjectiveMetrics = {
  nodeBodyOverlaps: number;
  nodeLabelOverlaps: number;
  straightEdgeCrossings: number;
  longEdges: number;
  parallelBundlePressure: number;
  relationLabelCorridorPressure: number;
  score: number;
};

const BODY_CLEARANCE = 76;
const BODY_HALF = 32;

function width(text: string): number { return Math.max(48, Math.min(180, Array.from(text).length * 6.5 + 12)); }
function height(entity: CoarseObjectiveEntity): number { return entity.description?.trim() ? 48 : 20; }
function labelBox(entity: CoarseObjectiveEntity, point: LayoutPoint) { const w = width(entity.label); const h = entity.description?.trim() ? 48 : 20; return { left: point.x - w / 2, right: point.x + w / 2, top: point.y + BODY_HALF, bottom: point.y + BODY_HALF + h }; }
function overlap(a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>): boolean { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
function orientation(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function crosses(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint): boolean { const ab = orientation(a, b, c); const ab2 = orientation(a, b, d); const cd = orientation(c, d, a); const cd2 = orientation(c, d, b); return ((ab > 0 && ab2 < 0) || (ab < 0 && ab2 > 0)) && ((cd > 0 && cd2 < 0) || (cd < 0 && cd2 > 0)); }
function midpointDistance(point: LayoutPoint, a: LayoutPoint, b: LayoutPoint): number { const dx = b.x - a.x; const dy = b.y - a.y; const length2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)); return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)); }
function segmentDistance(point: LayoutPoint, a: LayoutPoint, b: LayoutPoint): number { return midpointDistance(point, a, b); }

/**
 * Cheap, presentation-informed geometry proxy. It deliberately uses straight
 * chords and estimated text envelopes; it never calls routing or label
 * placement authority and is diagnostic-only until separately adopted.
 */
export function scoreCoarseInitialLayout(input: CoarseObjectiveInput): CoarseObjectiveMetrics {
  // Self-loops have no meaningful straight chord. Their angle/radius and
  // label behavior belong to routing/presentation authority, so they must not
  // enter ordinary edge length, corridor, crossing, or parallel proxies.
  const edgeRelations = input.relations.filter((relation) => relation.sourceId !== relation.targetId && input.positions[relation.sourceId] && input.positions[relation.targetId]);
  let nodeBodyOverlaps = 0; let nodeLabelOverlaps = 0; let straightEdgeCrossings = 0; let longEdges = 0; let relationLabelCorridorPressure = 0;
  for (let left = 0; left < input.entities.length; left += 1) for (let right = left + 1; right < input.entities.length; right += 1) {
    const first = input.positions[input.entities[left]!.id]; const second = input.positions[input.entities[right]!.id]; if (!first || !second) continue;
    if (Math.abs(first.x - second.x) < BODY_CLEARANCE && Math.abs(first.y - second.y) < BODY_CLEARANCE) nodeBodyOverlaps += 1;
    if (overlap(labelBox(input.entities[left]!, first), labelBox(input.entities[right]!, second))) nodeLabelOverlaps += 1;
  }
  for (let left = 0; left < edgeRelations.length; left += 1) {
    const first = edgeRelations[left]!; const firstSource = input.positions[first.sourceId]!; const firstTarget = input.positions[first.targetId]!; const firstLength = Math.hypot(firstSource.x - firstTarget.x, firstSource.y - firstTarget.y); if (firstLength > 480) longEdges += 1;
    const firstMid = { x: (firstSource.x + firstTarget.x) / 2, y: (firstSource.y + firstTarget.y) / 2 };
    const firstLabelHalfWidth = width(first.label ?? first.id) / 2;
    for (const entity of input.entities) if (entity.id !== first.sourceId && entity.id !== first.targetId) {
      const point = input.positions[entity.id]; if (!point) continue;
      const clearance = Math.hypot(point.x - firstMid.x, point.y - firstMid.y) - BODY_HALF - Math.max(height(entity), 20) / 2;
      relationLabelCorridorPressure += Math.max(0, firstLabelHalfWidth + 24 - clearance) / 100;
    }
    for (let right = left + 1; right < edgeRelations.length; right += 1) {
      const second = edgeRelations[right]!; const secondSource = input.positions[second.sourceId]!; const secondTarget = input.positions[second.targetId]!;
      if (![first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId) && crosses(firstSource, firstTarget, secondSource, secondTarget)) straightEdgeCrossings += 1;
      if (![first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) {
        const secondMid = { x: (secondSource.x + secondTarget.x) / 2, y: (secondSource.y + secondTarget.y) / 2 };
        relationLabelCorridorPressure += Math.max(0, firstLabelHalfWidth + width(second.label ?? second.id) / 2 + 24 - segmentDistance(firstMid, secondSource, secondTarget)) / 100;
        relationLabelCorridorPressure += Math.max(0, width(second.label ?? second.id) / 2 + firstLabelHalfWidth + 24 - segmentDistance(secondMid, firstSource, firstTarget)) / 100;
      }
    }
  }
  const parallelGroups = new Map<string, CoarseObjectiveRelation[]>();
  for (const relation of edgeRelations) { const key = [relation.sourceId, relation.targetId].sort().join("\0"); const group = parallelGroups.get(key) ?? []; group.push(relation); parallelGroups.set(key, group); }
  let parallelBundlePressure = 0;
  for (const group of parallelGroups.values()) if (group.length > 1) { const first = group[0]!; const source = input.positions[first.sourceId]!; const target = input.positions[first.targetId]!; const chord = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y)); parallelBundlePressure += (group.length - 1) * Math.max(0, 180 - chord) / 180; }
  const score = nodeBodyOverlaps * 1000000 + nodeLabelOverlaps * 10000 + straightEdgeCrossings * 100000 + longEdges * 2500 + parallelBundlePressure * 800 + relationLabelCorridorPressure * 500;
  return { nodeBodyOverlaps, nodeLabelOverlaps, straightEdgeCrossings, longEdges, parallelBundlePressure, relationLabelCorridorPressure, score };
}
