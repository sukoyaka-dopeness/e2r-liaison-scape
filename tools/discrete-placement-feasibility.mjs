// Bounded feasibility-first placement experiment. It allocates discrete cells
// for a topology-derived order; Product presentation remains the authority.
import { structuralFormulations } from "./structural-formulation.mjs";

const MAX_NODES = 64;
const MAX_EDGES = 256;
const MAX_STATES = 25_000;
const MAX_SOLUTIONS = 2;
const MIN_ANGLE = 8;

function slots(count, variant) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / columns);
  const spacing = variant === "wide" ? 170 : 155;
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns), col = i % columns;
    values.push({ x: (col - (columns - 1) / 2) * spacing + (variant === "staggered" && row % 2 ? spacing / 2 : 0), y: (row - (rows - 1) / 2) * spacing });
  }
  const cx = values.reduce((s, p) => s + p.x, 0) / Math.max(1, count);
  const cy = values.reduce((s, p) => s + p.y, 0) / Math.max(1, count);
  return values.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

function angleGap(position, neighbors) {
  if (neighbors.length < 2) return 360;
  const angles = neighbors.map((other) => Math.atan2(other.y - position.y, other.x - position.x)).sort((a, b) => a - b);
  let gap = Math.PI * 2;
  for (let i = 0; i < angles.length; i += 1) gap = Math.min(gap, (angles[(i + 1) % angles.length] - angles[i] + Math.PI * 2) % (Math.PI * 2));
  return gap * 180 / Math.PI;
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function discretePlacementAudit(nodes, edges) {
  const ids = nodes.map(({ id }) => id).sort();
  if (ids.length > MAX_NODES || edges.length > MAX_EDGES || new Set(ids).size !== ids.length) throw new Error("discrete placement input bound");
  const index = new Map(ids.map((id, i) => [id, i]));
  const adjacency = ids.map(() => new Set());
  const pairs = [];
  const demands = new Map();
  for (const edge of edges) {
    const a = index.get(edge.sourceId), b = index.get(edge.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const left = Math.min(a, b), right = Math.max(a, b), key = `${left}:${right}`;
    adjacency[a].add(b); adjacency[b].add(a);
    demands.set(key, Math.max(demands.get(key) ?? 0, String(edge.label ?? "").length * 8));
  }
  for (const [key, demand] of demands) { const [a, b] = key.split(":").map(Number); pairs.push({ a, b, demand }); }
  const neighbors = adjacency.map((set) => [...set].sort((a, b) => a - b));
  const sources = structuralFormulations(nodes, edges).filter(({ family }) => /^(crossing-ring|ordered-stress|twin-spokes)/.test(family));
  const results = [];
  for (const source of sources) for (const variant of ["wide", "staggered"]) {
    const cell = slots(ids.length, variant);
    const order = ids.map((id, i) => i).sort((a, b) => {
      const pa = source.positions[ids[a]], pb = source.positions[ids[b]];
      return pa.y - pb.y || pa.x - pb.x || a - b;
    });
    const anchors = order.map((node) => source.positions[ids[node]]);
    const cellOrder = cell.map((_, i) => i).sort((a, b) => {
      const pa = cell[a], pb = cell[b];
      return pa.y - pb.y || pa.x - pb.x || a - b;
    });
    let states = 0, prunedSector = 0, prunedCorridor = 0, prunedSymmetry = 0;
    const assigned = new Map(), used = new Set(), solutions = [];
    const partialSafe = () => {
      for (const node of assigned.keys()) {
        const point = assigned.get(node);
        const incident = neighbors[node].filter((other) => assigned.has(other)).map((other) => assigned.get(other));
        if (angleGap(point, incident) < MIN_ANGLE) { prunedSector += 1; return false; }
      }
      for (const { a, b, demand } of pairs) if (assigned.has(a) && assigned.has(b)) {
        const first = assigned.get(a), second = assigned.get(b);
        for (const node of assigned.keys()) if (node !== a && node !== b && segmentDistance(assigned.get(node), first, second) < 20 + Math.min(32, demand / 4)) { prunedCorridor += 1; return false; }
      }
      return true;
    };
    const visit = (depth) => {
      if (states >= MAX_STATES || solutions.length >= MAX_SOLUTIONS) return;
      states += 1;
      if (depth === order.length) {
        solutions.push(Object.fromEntries(ids.map((id, i) => [id, { ...assigned.get(i) }])));
        return;
      }
      const node = order[depth], anchor = anchors[depth];
      const candidates = cellOrder.filter((slot) => !used.has(slot)).sort((left, right) => {
        const dl = Math.hypot(cell[left].x - anchor.x, cell[left].y - anchor.y);
        const dr = Math.hypot(cell[right].x - anchor.x, cell[right].y - anchor.y);
        return dl - dr || left - right;
      });
      const boundedCandidates = depth === 0 ? candidates.slice(0, 2) : candidates.slice(0, 8);
      for (const slot of boundedCandidates) {
        if (states >= MAX_STATES || solutions.length >= MAX_SOLUTIONS) break;
        assigned.set(node, cell[slot]); used.add(slot);
        if (partialSafe()) visit(depth + 1);
        assigned.delete(node); used.delete(slot);
      }
    };
    visit(0);
    results.push({ family: `discrete-${source.family}-${variant}`, positions: solutions[0] ?? null, cheap: { states, stateLimit: MAX_STATES, solutions: solutions.length, prunedSector, prunedCorridor, prunedSymmetry, sourceFamily: source.family, candidateCellCount: cell.length, orderLength: order.length }, allSolutions: solutions });
  }
  return results;
}

export function discretePlacementPlans(nodes, edges) {
  return discretePlacementAudit(nodes, edges).filter((result) => result.positions);
}
