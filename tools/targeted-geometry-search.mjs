import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const dataset = JSON.parse(fs.readFileSync("experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json", "utf8"));
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
const localSearch = {
  armstrong: { x: 31.342, y: 373.958 }, aldrin: { x: 222.011, y: 508.891 }, collins: { x: -42.185, y: 159 },
  nasa: { x: 167.263, y: 316.949 }, columbia: { x: 172.797, y: 73.267 }, eagle: { x: 359.027, y: 191.533 },
  "saturn-v": { x: 11.156, y: -25.818 }, moon: { x: 380.534, y: -64.622 }, hornet: { x: 156.701, y: -168.251 },
};

function rectDistance(point, rect) {
  return Math.hypot(Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0), Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0));
}

function presentationMetrics(positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), []));
  const p = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
  });
  const lengths = p.routedEdges.map((route) => route.samples.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0)).sort((a, b) => a - b);
  const labels = [...p.nodeLabels.values()];
  const routeRows = p.routedEdges.map((route) => {
    const label = p.relationLabels.get(route.id);
    if (!label) return null;
    const competing = p.routedEdges.filter((other) => other.id !== route.id).map((other) => ({ id: other.id, distance: Math.min(...other.samples.map((point) => rectDistance(point, label))) })).sort((a, b) => a.distance - b.distance);
    return { id: route.id, ownerDistance: Math.min(...route.samples.map((point) => rectDistance(point, label))), competingDistance: competing[0]?.distance ?? Infinity, competingId: competing[0]?.id ?? null };
  }).filter(Boolean);
  const entity1 = routeRows.find((row) => row.id === "entity-1");
  const representative = routeRows.filter((row) => ["entity-1", "entity-3", "entity-6", "entity-8", "entity-10"].includes(row.id));
  const labelRouteHits = p.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).length;
  let crossingCount = 0;
  const orientation = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let left = 0; left < p.routedEdges.length; left += 1) for (let right = left + 1; right < p.routedEdges.length; right += 1) {
    const first = p.routedEdges[left], second = p.routedEdges[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let hit = false;
    for (let a = 1; a < first.samples.length && !hit; a += 1) for (let b = 1; b < second.samples.length; b += 1) {
      const p1 = first.samples[a - 1], p2 = first.samples[a], q1 = second.samples[b - 1], q2 = second.samples[b];
      const ab1 = orientation(p1, p2, q1), ab2 = orientation(p1, p2, q2), cd1 = orientation(q1, q2, p1), cd2 = orientation(q1, q2, p2);
      if (((ab1 > 0 && ab2 < 0) || (ab1 < 0 && ab2 > 0)) && ((cd1 > 0 && cd2 < 0) || (cd1 < 0 && cd2 > 0))) hit = true;
    }
    if (hit) crossingCount += 1;
  }
  const x = Object.values(positions).map((point) => point.x), y = Object.values(positions).map((point) => point.y);
  const crowdedRepresentative = representative.filter((row) => row.competingDistance < 20).length;
  const preserved = new Map([["entity-3", 7.3], ["entity-6", 8.9], ["entity-8", 15.3], ["entity-10", 19.4]]);
  const regressionPenalty = representative.reduce((total, row) => total + Math.max(0, (preserved.get(row.id) ?? 0) - row.competingDistance) * 3000, 0);
  const score = (entity1.competingDistance < 20 ? (20 - entity1.competingDistance) * 1200 : 0)
    + regressionPenalty
    + (entity1.ownerDistance > 12 ? (entity1.ownerDistance - 12) * 300 : 0)
    + crowdedRepresentative * 350
    + labelRouteHits * 6000 + crossingCount * 2500 + lengths[Math.floor(lengths.length / 2)] * 1.5 + Math.max(...lengths) * 0.5
    + (Math.max(...x) - Math.min(...x) + Math.max(...y) - Math.min(...y)) * 0.25;
  return { score, extent: [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)], routeMedian: lengths[Math.floor(lengths.length / 2)], routeMax: Math.max(...lengths), crossings: crossingCount, labelRouteHits, crowdedRepresentative, entity1, representative };
}

function random(seed) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; }; }
function clone(positions) { return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }])); }
function improve(start, next, rounds = 100) {
  let current = clone(start), metrics = presentationMetrics(current);
  const targets = ["armstrong", "nasa", "eagle"];
  for (let round = 0; round < rounds; round += 1) {
    const id = targets[Math.floor(next() * targets.length)];
    const candidate = clone(current);
    const amplitude = 70 - round * 0.4;
    candidate[id] = { x: candidate[id].x + (next() - 0.5) * amplitude, y: candidate[id].y + (next() - 0.5) * amplitude };
    const candidateMetrics = presentationMetrics(candidate);
    if (candidateMetrics.score < metrics.score || next() < 0.035) { current = candidate; metrics = candidateMetrics; }
  }
  return { positions: current, metrics };
}

function improveWithScore(start, next, targetIds, scoreOf, rounds = 100) {
  let current = clone(start), metrics = presentationMetrics(current);
  for (let round = 0; round < rounds; round += 1) {
    const id = targetIds[Math.floor(next() * targetIds.length)];
    const candidate = clone(current);
    const amplitude = 120 - round * 0.6;
    candidate[id] = { x: candidate[id].x + (next() - 0.5) * amplitude, y: candidate[id].y + (next() - 0.5) * amplitude };
    const candidateMetrics = presentationMetrics(candidate);
    if (scoreOf(candidateMetrics) < scoreOf(metrics) || next() < 0.025) { current = candidate; metrics = candidateMetrics; }
  }
  return { positions: current, metrics };
}

const startLocalPlus = {
  armstrong: { x: 31.342, y: 373.958 }, aldrin: { x: 222.011, y: 508.891 }, collins: { x: -42.185, y: 159 },
  nasa: { x: 167.263, y: 316.949 }, columbia: { x: 172.797, y: 73.267 }, eagle: { x: 359.027, y: 191.533 },
  "saturn-v": { x: 11.156, y: -25.818 }, moon: { x: 380.534, y: -64.622 }, hornet: { x: 156.701, y: -168.251 },
};
const localPlus = {
  armstrong: { x: -59.717, y: 357.208 }, aldrin: { x: 222.011, y: 508.891 }, collins: { x: -42.185, y: 159 },
  nasa: { x: 145.196, y: 337.480 }, columbia: { x: 172.797, y: 73.267 }, eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 11.156, y: -25.818 }, moon: { x: 380.534, y: -64.622 }, hornet: { x: 156.701, y: -168.251 },
};
const crossingScore = (metrics) => metrics.crossings * 12000 + metrics.labelRouteHits * 6000 + metrics.crowdedRepresentative * 500
  + metrics.routeMedian * 1.5 + metrics.routeMax * 0.5 + (metrics.extent[0] + metrics.extent[1]) * 0.25;
const baselineRepresentative = new Map([["entity-3", 8.2], ["entity-6", 13.9], ["entity-8", 19.6], ["entity-10", 24.8]]);
const labelAccommodationScore = (metrics) => {
  const representativeRegression = metrics.representative.reduce((total, row) => total + Math.max(0, (baselineRepresentative.get(row.id) ?? 0) - row.competingDistance) * 2500, 0);
  return (metrics.entity1.competingDistance < 20 ? (20 - metrics.entity1.competingDistance) * 1400 : 0)
    + representativeRegression + metrics.crowdedRepresentative * 1600 + metrics.labelRouteHits * 8000
    + metrics.crossings * 3500 + metrics.routeMedian * 1.2 + metrics.routeMax * 0.4 + (metrics.extent[0] + metrics.extent[1]) * 0.2;
};
const crossing = improveWithScore(startLocalPlus, random(98127), graph.nodes.map(({ id }) => id), crossingScore, 100);
const accommodation = improveWithScore(localPlus, random(98128), ["armstrong", "nasa", "eagle"], labelAccommodationScore, 100);
console.log(JSON.stringify({
  localPlus: { metrics: presentationMetrics(localPlus) },
  crossingAware: crossing,
  labelAccommodationAware: accommodation,
}, null, 2));
