import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";
import { INITIAL_ENTITY_CLEARANCE } from "../src/initial-entity-placement.ts";

const fixturePath = "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
const dataset = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const start = {
  armstrong: { x: -59.717, y: 357.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159 },
  nasa: { x: 145.196, y: 337.480 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
}

function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}

function segmentCrosses(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = orient(a, b, c); const abD = orient(a, b, d);
  const cdA = orient(c, d, a); const cdB = orient(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function crossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let hit = false;
    for (let a = 1; a < first.samples.length && !hit; a += 1) for (let b = 1; b < second.samples.length; b += 1) {
      if (segmentCrosses(first.samples[a - 1], first.samples[a], second.samples[b - 1], second.samples[b])) hit = true;
    }
    if (hit) count += 1;
  }
  return count;
}

function nodeFeasibility(positions) {
  let overlapPairs = 0;
  let minimumSeparation = Infinity;
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    const separation = Math.hypot(first.x - second.x, first.y - second.y);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  return { overlapPairs, minimumSeparation };
}

function presentationMetrics(positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {},
    provisionalNodeLabels: provisional, ...emptyState,
  });
  const lengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce(
    (total, point, index) => total + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0,
  )).sort((a, b) => a - b);
  const labels = [...presentation.nodeLabels.values()];
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).length;
  let labelOverlap = 0;
  for (let left = 0; left < labels.length; left += 1) for (let right = left + 1; right < labels.length; right += 1) {
    if (Math.abs(labels[left].x - labels[right].x) < (labels[left].width + labels[right].width) / 2
      && Math.abs(labels[left].y - labels[right].y) < (labels[left].height + labels[right].height) / 2) labelOverlap += 1;
  }
  const x = Object.values(positions).map((point) => point.x); const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const feasibility = nodeFeasibility(positions);
  const crossings = crossingCount(presentation.routedEdges);
  const routeMedian = lengths[Math.floor(lengths.length / 2)]; const routeMax = Math.max(...lengths);
  const score = crossings * 9000 + labelRouteHits * 6000 + labelNear20 * 700 + labelOverlap * 3000
    + routeMedian * 1.5 + routeMax * 0.5 + (extent[0] + extent[1]) * 0.35;
  return { score, ...feasibility, extent, routeMedian, routeMax, crossings, labelRouteHits, labelNear20, labelOverlap };
}

const baselineAdjacency = new Map(graph.edges.map((edge) => {
  const source = start[edge.sourceId]; const target = start[edge.targetId];
  return [edge.id, Math.hypot(source.x - target.x, source.y - target.y)];
}));
const ADJACENCY_BAND_PENALTY = 500;

function adjacencyMetrics(positions) {
  const rows = graph.edges.map((edge) => {
    const source = positions[edge.sourceId]; const target = positions[edge.targetId];
    const distance = Math.hypot(source.x - target.x, source.y - target.y);
    const baseline = baselineAdjacency.get(edge.id);
    const lower = Math.max(INITIAL_ENTITY_CLEARANCE, baseline * 0.8);
    const upper = baseline * 1.1;
    return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, distance, baseline, lower, upper };
  });
  const outsideBand = rows.filter((row) => row.distance < row.lower || row.distance > row.upper);
  const stretch = rows.filter((row) => row.distance > row.upper);
  const penalty = rows.reduce((total, row) => {
    const excess = row.distance < row.lower ? row.lower - row.distance : Math.max(0, row.distance - row.upper);
    return total + (excess / 24) ** 2 * (row.distance > row.upper ? 2.5 : 1.5) * ADJACENCY_BAND_PENALTY;
  }, 0);
  const distances = rows.map((row) => row.distance).sort((a, b) => a - b);
  return {
    rows,
    outsideBand: outsideBand.length,
    stretched: stretch.length,
    median: distances[Math.floor(distances.length / 2)],
    minimum: Math.min(...distances),
    maximum: Math.max(...distances),
    penalty,
  };
}

function topologyScore(metrics, positions) {
  return metrics.score + adjacencyMetrics(positions).penalty;
}

function improve(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [24, 12, 6];
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (const node of graph.nodes) {
      for (const step of steps) for (const direction of directions) {
        const candidate = clonePositions(current);
        candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
        const feasibility = nodeFeasibility(candidate);
        if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
        const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
        if (candidateMetrics.score < metrics.score) { current = candidate; metrics = candidateMetrics; accepted += 1; }
      }
    }
  }
  return { positions: current, metrics, evaluations, rejectedInfeasible, accepted, sweeps: 2, steps, directionCount: directions.length };
}

function improveTopology(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [24, 12, 6];
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (const node of graph.nodes) {
      for (const step of steps) for (const direction of directions) {
        const candidate = clonePositions(current);
        candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
        const feasibility = nodeFeasibility(candidate);
        if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
        const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
        if (topologyScore(candidateMetrics, candidate) < topologyScore(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
      }
    }
  }
  return { positions: current, metrics, adjacency: adjacencyMetrics(current), evaluations, rejectedInfeasible, accepted, sweeps: 2, steps, directionCount: directions.length };
}

const baseline = presentationMetrics(start);
const baselineWithAdjacency = { metrics: baseline, adjacency: adjacencyMetrics(start) };
const result = improve(start);
const topologyAware = improveTopology(start);
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-PRESENTATION-TOPOLOGY-RELAXATION-v1",
  diagnosticOnly: true,
  hardBoundary: { rule: "INITIAL_ENTITY_CLEARANCE", value: INITIAL_ENTITY_CLEARANCE, overlapRejected: true },
  adjacencyRegularization: {
    reference: "local-search-v1-plus",
    preferredBand: { lowerRatio: 0.8, upperRatio: 1.1, minimumAbsolute: INITIAL_ENTITY_CLEARANCE },
    penaltyWeight: ADJACENCY_BAND_PENALTY,
    purpose: "diagnostic bounded stretch control; not a Product threshold",
  },
  baseline: { positions: start, ...baselineWithAdjacency },
  presentationAware: result,
  topologyAware,
}, null, 2));
