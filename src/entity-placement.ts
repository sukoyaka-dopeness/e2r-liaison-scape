import type { GraphEdge, GraphNode } from "./dataset";

export type PlacementPoint = { x: number; y: number };
export type PlacementBounds = { left: number; right: number; top: number; bottom: number };
const BODY = 32;
const CLEARANCE = 76;
const RINGS = 8;
const DIRECTIONS = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }];

function finite(point: PlacementPoint | undefined): point is PlacementPoint { return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y); }
function labelWidth(node: GraphNode) { return Math.max(48, Math.min(180, Array.from(node.label).length * 6.5 + 12)); }
function labelHeight(node: GraphNode) { return node.description.trim() ? 48 : 20; }
function labelEnvelope(node: GraphNode, point: PlacementPoint) {
  return { left: point.x - labelWidth(node) / 2, right: point.x + labelWidth(node) / 2, top: point.y + 32, bottom: point.y + 32 + labelHeight(node) };
}
function bodyOverlap(a: PlacementPoint, b: PlacementPoint) { return Math.abs(a.x - b.x) < CLEARANCE && Math.abs(a.y - b.y) < CLEARANCE; }
function rectOverlap(a: ReturnType<typeof labelEnvelope>, b: ReturnType<typeof labelEnvelope>) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
function inBounds(point: PlacementPoint, bounds?: PlacementBounds) { return !bounds || (point.x - BODY >= bounds.left && point.x + BODY <= bounds.right && point.y - BODY >= bounds.top && point.y + BODY <= bounds.bottom); }

export function placeInitialEntities(nodes: readonly GraphNode[], edges: readonly GraphEdge[], stored: Record<string, PlacementPoint>, bounds?: PlacementBounds): Record<string, PlacementPoint> {
  const result: Record<string, PlacementPoint> = {};
  for (const node of nodes) if (finite(stored[node.id])) result[node.id] = { ...stored[node.id] };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ordered = nodes.filter(node => !result[node.id]).slice().sort((a, b) => a.id.localeCompare(b.id));
  const neighbors = (id: string) => edges.flatMap(edge => edge.sourceId === id ? [edge.targetId] : edge.targetId === id ? [edge.sourceId] : []).filter(value => byId.has(value));
  const occupied = () => Object.values(result);
  const candidatePositions = (anchor: PlacementPoint) => [anchor, ...Array.from({ length: RINGS }, (_, ring) => DIRECTIONS.map(direction => ({ x: anchor.x + direction.x * CLEARANCE * (ring + 1), y: anchor.y + direction.y * CLEARANCE * (ring + 1) }))).flat()];
  for (const [index, node] of ordered.entries()) {
    const positionedNeighbors = neighbors(node.id).map(id => result[id]).filter((point): point is PlacementPoint => point !== undefined);
    const anchor = positionedNeighbors.length
      ? positionedNeighbors.reduce((sum, point) => ({ x: sum.x + point.x / positionedNeighbors.length, y: sum.y + point.y / positionedNeighbors.length }), { x: 0, y: 0 })
      : { x: 150 + (index % 4) * 240, y: 130 + Math.floor(index / 4) * 180 };
    const existingLabels = Object.entries(result).map(([id, point]) => labelEnvelope(byId.get(id)!, point));
    const selected = candidatePositions(anchor).map((point, candidateIndex) => {
      const bodies = occupied();
      const envelope = labelEnvelope(node, point);
      const bodyPenalty = bodies.reduce((sum, other) => sum + (bodyOverlap(point, other) ? 100000 : 0), 0);
      const labelPenalty = existingLabels.reduce((sum, other) => sum + (rectOverlap(envelope, other) ? 10000 : 0), 0);
      const clearance = bodies.reduce((minimum, other) => Math.min(minimum, Math.hypot(point.x - other.x, point.y - other.y)), Infinity);
      return { point, score: bodyPenalty + labelPenalty - Math.min(clearance, CLEARANCE) + candidateIndex * 0.001 };
    }).filter(candidate => inBounds(candidate.point, bounds)).sort((a, b) => a.score - b.score || a.point.x - b.point.x || a.point.y - b.point.y)[0];
    result[node.id] = selected?.point ?? anchor;
  }
  return result;
}
