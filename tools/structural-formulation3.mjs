// Browser-compatible constrained structural placement research.
// Product routing, labels, and endpoint planning remain external authorities.
import { structuralFormulations } from "./structural-formulation.mjs";

const MIN_SEPARATION = 145;
const MAX_NODES = 64;
const MAX_EDGES = 256;

function metrics(points, neighbors, edges) {
  let minimumSeparation = Infinity;
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
  }
  let minimumAngularGap = Math.PI * 2;
  for (let node = 0; node < neighbors.length; node += 1) {
    if (neighbors[node].length < 2) continue;
    const angles = neighbors[node].map((other) => Math.atan2(points[other].y - points[node].y, points[other].x - points[node].x)).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i += 1) minimumAngularGap = Math.min(minimumAngularGap, (angles[(i + 1) % angles.length] - angles[i] + Math.PI * 2) % (Math.PI * 2));
  }
  let coarseCorridorDeficit = 0;
  for (const [a, b, labelDemand] of edges) {
    const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
    const length = Math.hypot(dx, dy) || 1;
    for (let node = 0; node < points.length; node += 1) if (node !== a && node !== b) {
      const t = Math.max(0, Math.min(1, ((points[node].x - points[a].x) * dx + (points[node].y - points[a].y) * dy) / (length * length)));
      const distance = Math.hypot(points[node].x - (points[a].x + dx * t), points[node].y - (points[a].y + dy * t));
      coarseCorridorDeficit += Math.max(0, 52 + Math.min(48, labelDemand / 4) - distance);
    }
  }
  return { minimumSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : null, minimumAngularGapDegrees: minimumAngularGap * 180 / Math.PI, coarseCorridorDeficit };
}

function project(source, ids, neighbors, edgeTriples, width, height) {
  if (ids.length === 0) return { positions: {}, cheap: { minimumSeparation: null, minimumAngularGapDegrees: 360, coarseCorridorDeficit: 0 } };
  const raw = ids.map((id) => source[id]);
  const xs = raw.map(({ x }) => x), ys = raw.map(({ y }) => y);
  const center = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  const scale = Math.min(width / Math.max(1, Math.max(...xs) - Math.min(...xs)), height / Math.max(1, Math.max(...ys) - Math.min(...ys)));
  const anchors = raw.map((p) => ({ x: (p.x - center.x) * scale, y: (p.y - center.y) * scale }));
  let points = anchors.map((p) => ({ ...p }));
  for (let step = 0; step < 180; step += 1) {
    for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
      let dx = points[b].x - points[a].x, dy = points[b].y - points[a].y, distance = Math.hypot(dx, dy);
      if (distance < 1e-8) { const angle = ((a + 1) * 37 + (b + 1) * 61) % 360 * Math.PI / 180; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
      if (distance >= MIN_SEPARATION) continue;
      const push = (MIN_SEPARATION - distance) * 0.505;
      points[a].x -= dx / distance * push; points[a].y -= dy / distance * push;
      points[b].x += dx / distance * push; points[b].y += dy / distance * push;
    }
    points = points.map((p, i) => ({
      x: Math.max(-width / 2, Math.min(width / 2, p.x + (anchors[i].x - p.x) * 0.002)),
      y: Math.max(-height / 2, Math.min(height / 2, p.y + (anchors[i].y - p.y) * 0.002)),
    }));
  }
  const cheap = metrics(points, neighbors, edgeTriples);
  return { positions: Object.fromEntries(ids.map((id, i) => [id, points[i]])), cheap };
}

export function structuralFormulations3(nodes, edges) {
  const ids = nodes.map(({ id }) => id).sort();
  if (ids.length > MAX_NODES || edges.length > MAX_EDGES || new Set(ids).size !== ids.length) throw new Error("structural research input bound");
  const index = new Map(ids.map((id, i) => [id, i]));
  const neighborSets = ids.map(() => new Set());
  const edgeDemand = new Map();
  for (const edge of edges) {
    const a = index.get(edge.sourceId), b = index.get(edge.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    neighborSets[a].add(b); neighborSets[b].add(a);
    edgeDemand.set(key, Math.max(edgeDemand.get(key) ?? 0, String(edge.label ?? "").length * 8));
  }
  const edgeTriples = [...edgeDemand].map(([key, demand]) => [...key.split(":").map(Number), demand]);
  edgeTriples.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  const neighbors = neighborSets.map((set) => [...set].sort((a, b) => a - b));
  const sources = structuralFormulations(nodes, edges).filter(({ family }) => /^(crossing-ring|ordered-stress|twin-spokes)/.test(family));
  const results = [];
  for (const source of sources) for (const [shape, width, height] of [["wide", 900, 600], ["balanced", 750, 650]]) {
    const candidate = project(source.positions, ids, neighbors, edgeTriples, width, height);
    if (candidate.cheap.minimumSeparation !== null && candidate.cheap.minimumSeparation < MIN_SEPARATION - 0.5) continue;
    results.push({ family: `joint-constrained-${source.family}-${shape}`, ...candidate });
  }
  return results;
}
