import fs from "node:fs";
import { buildEntityGraph, getStoredCoordinates } from "../src/dataset.ts";
import { solveAutoLayout } from "../src/auto-layout.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
const dataset = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const graph = buildEntityGraph(dataset);
const stored = getStoredCoordinates(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const input = {
  entities: graph.nodes.map(({ id }) => ({ id })),
  relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
};

const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function distanceToRect(point, rect) {
  const left = rect.x - rect.width / 2;
  const right = rect.x + rect.width / 2;
  const top = rect.y - rect.height / 2;
  const bottom = rect.y + rect.height / 2;
  const dx = Math.max(left - point.x, 0, point.x - right);
  const dy = Math.max(top - point.y, 0, point.y - bottom);
  return Math.hypot(dx, dy);
}

function segmentCrosses(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function crossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) {
    for (let right = left + 1; right < routes.length; right += 1) {
      const first = routes[left];
      const second = routes[right];
      if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
      let crosses = false;
      for (let a = 1; a < first.samples.length && !crosses; a += 1) {
        for (let b = 1; b < second.samples.length; b += 1) {
          if (segmentCrosses(first.samples[a - 1], first.samples[a], second.samples[b - 1], second.samples[b])) {
            crosses = true;
            break;
          }
        }
      }
      if (crosses) count += 1;
    }
  }
  return count;
}

function presentationMetrics(positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id] ?? node,
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id] ?? other),
    [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisional,
    ...emptyState,
  });
  const lengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce(
    (total, point, index) => total + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y),
    0,
  )).sort((a, b) => a - b);
  const labels = [...presentation.nodeLabels.values()];
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).length;
  let nodeOverlap = 0;
  for (let left = 0; left < graph.nodes.length; left += 1) {
    for (let right = left + 1; right < graph.nodes.length; right += 1) {
      if (Math.hypot(positions[graph.nodes[left].id].x - positions[graph.nodes[right].id].x, positions[graph.nodes[left].id].y - positions[graph.nodes[right].id].y) < 96) nodeOverlap += 1;
    }
  }
  let labelOverlap = 0;
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      if (Math.abs(labels[left].x - labels[right].x) < (labels[left].width + labels[right].width) / 2
        && Math.abs(labels[left].y - labels[right].y) < (labels[left].height + labels[right].height) / 2) labelOverlap += 1;
    }
  }
  const x = Object.values(positions).map((point) => point.x);
  const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const crossings = crossingCount(presentation.routedEdges);
  const routeMedian = lengths[Math.floor(lengths.length / 2)];
  const routeMax = Math.max(...lengths);
  const score = crossings * 9000 + labelRouteHits * 6000 + labelNear20 * 700 + nodeOverlap * 10000 + labelOverlap * 3000
    + routeMedian * 1.5 + routeMax * 0.5 + (extent[0] + extent[1]) * 0.35;
  return { score, extent, routeMedian, routeMax, crossings, labelRouteHits, labelNear20, nodeOverlap, labelOverlap, feedback: presentation.feedbackApplied };
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
}

function randomStart(next, width = 600, height = 600) {
  const positions = {};
  for (const node of graph.nodes) positions[node.id] = { x: next() * width, y: next() * height };
  return positions;
}

function improve(start, next, rounds = 100) {
  let current = clonePositions(start);
  let currentMetrics = presentationMetrics(current);
  for (let round = 0; round < rounds; round += 1) {
    const id = graph.nodes[Math.floor(next() * graph.nodes.length)].id;
    const candidate = clonePositions(current);
    candidate[id] = { x: candidate[id].x + (next() - 0.5) * 90, y: candidate[id].y + (next() - 0.5) * 90 };
    const candidateMetrics = presentationMetrics(candidate);
    if (candidateMetrics.score < currentMetrics.score || next() < Math.max(0.002, 0.08 * (1 - round / rounds))) {
      current = candidate;
      currentMetrics = candidateMetrics;
    }
  }
  return { positions: current, metrics: currentMetrics };
}

const seeds = [["stored", stored]];

const results = seeds.map(([name, positions], index) => ({ name, ...improve(positions, random((index + 11) * 1777), 100) }));
results.sort((left, right) => left.metrics.score - right.metrics.score);
console.log(JSON.stringify(results.slice(0, 5), null, 2));
