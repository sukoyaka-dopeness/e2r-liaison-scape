import fs from "node:fs";
import { buildEntityGraph, getStoredCoordinates } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel } from "../src/viewport.ts";

const dataset = JSON.parse(fs.readFileSync("experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json", "utf8"));
const graph = buildEntityGraph(dataset);
const relationById = new Map(dataset.relations.map((relation) => [relation.id, relation]));
const edges = graph.edges.map((edge) => ({ ...edge, label: relationById.get(edge.id)?.name ?? "" }));
const localSearch = {
  armstrong: { x: 31.342, y: 373.958 }, aldrin: { x: 222.011, y: 508.891 }, collins: { x: -42.185, y: 159 },
  nasa: { x: 167.263, y: 316.949 }, columbia: { x: 172.797, y: 73.267 }, eagle: { x: 359.027, y: 191.533 },
  "saturn-v": { x: 11.156, y: -25.818 }, moon: { x: 380.534, y: -64.622 }, hornet: { x: 156.701, y: -168.251 },
};

function rectDistance(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}

function pathDistance(rect, samples) {
  return Math.min(...samples.map((point) => rectDistance(point, rect)));
}

function boundedAlternateCandidates(route, positions, otherRoutes) {
  const candidates = [];
  for (const sampleIndex of [8, 12, 16, 20, 24, 28, 32]) {
    const point = route.samples[sampleIndex];
    const previous = route.samples[sampleIndex - 1] ?? point;
    const next = route.samples[sampleIndex + 1] ?? point;
    const tangentLength = Math.max(1, Math.hypot(next.x - previous.x, next.y - previous.y));
    const normal = { x: -(next.y - previous.y) / tangentLength, y: (next.x - previous.x) / tangentLength };
    for (const normalOffset of [-40, -24, 0, 24, 40]) {
      const label = { x: point.x + normal.x * normalOffset, y: point.y + normal.y * normalOffset, width: 135.5, height: 22 };
      const nodeClearance = Math.min(...Object.values(positions).map((node) => rectDistance(node, label)));
      const competing = otherRoutes.map((other) => ({ id: other.id, distance: pathDistance(label, other.samples) })).sort((a, b) => a.distance - b.distance);
      candidates.push({ fraction: +(sampleIndex / 40).toFixed(2), normalOffset, ownerRouteDistance: +pathDistance(label, route.samples).toFixed(1), nodeClearance: +nodeClearance.toFixed(1), nearestCompetingRoute: competing[0], score: Math.round(nodeClearance + Math.min(100, competing[0].distance) * 2 - Math.abs(sampleIndex - 20) * 0.2) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

function overlap(left, right) {
  return Math.abs(left.x - right.x) < (left.width + right.width) / 2
    && Math.abs(left.y - right.y) < (left.height + right.height) / 2;
}

function candidateDiagnostics(route, nodes, otherRoutes) {
  const width = 135.5;
  const candidateIndexes = [20, 16, 24, 12, 28, 8, 32, 4, 36];
  const candidates = candidateIndexes.flatMap((sampleIndex, alongPathPreference) => {
    const point = route.samples[sampleIndex];
    const previous = route.samples[sampleIndex - 1] ?? point;
    const next = route.samples[sampleIndex + 1] ?? point;
    const tangentLength = Math.max(1, Math.hypot(next.x - previous.x, next.y - previous.y));
    const normal = { x: -(next.y - previous.y) / tangentLength, y: (next.x - previous.x) / tangentLength };
    return [0, -24, 24, -40, 40].map((normalOffset, awayFromPathPreference) => {
      const candidate = { x: point.x + normal.x * normalOffset, y: point.y + normal.y * normalOffset, width, height: 22 };
      const nodeOverlapIds = nodes.filter((node) => {
        const nearestX = Math.max(candidate.x - width / 2, Math.min(node.x, candidate.x + width / 2));
        const nearestY = Math.max(candidate.y - 11, Math.min(node.y, candidate.y + 11));
        return Math.hypot(node.x - nearestX, node.y - nearestY) < 36;
      }).map((node) => node.id);
      const edgeOverlapIds = otherRoutes.filter((other) => other.samples.some((sample) =>
        sample.x >= candidate.x - width / 2 - 4 && sample.x <= candidate.x + width / 2 + 4
        && sample.y >= candidate.y - 15 && sample.y <= candidate.y + 15)).map((other) => other.id);
      const nearestNode = Math.min(...nodes.map((node) => {
        const nearestX = Math.max(candidate.x - width / 2, Math.min(node.x, candidate.x + width / 2));
        const nearestY = Math.max(candidate.y - 11, Math.min(node.y, candidate.y + 11));
        return Math.hypot(node.x - nearestX, node.y - nearestY);
      }));
      return { sampleIndex, fraction: +(sampleIndex / 40).toFixed(2), normalOffset, nodeOverlap: nodeOverlapIds.length, nodeOverlapIds, edgeOverlap: edgeOverlapIds.length, edgeOverlapIds, nearestNodeClearance: +nearestNode.toFixed(1), preference: alongPathPreference * 5 + awayFromPathPreference, score: nodeOverlapIds.length * 10000 + edgeOverlapIds.length * 500 + alongPathPreference * 5 + awayFromPathPreference };
    });
  });
  return candidates.sort((a, b) => a.score - b.score || a.sampleIndex - b.sampleIndex || a.normalOffset - b.normalOffset).slice(0, 8);
}

function inspect(name, positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
  });
  const rows = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id);
    if (!label) return null;
    const ownerDistance = pathDistance(label, route.samples);
    const competing = presentation.routedEdges.filter((other) => other.id !== route.id).map((other) => ({ id: other.id, distance: pathDistance(label, other.samples) })).sort((a, b) => a.distance - b.distance);
    const labelPeers = [...presentation.relationLabels.entries()].filter(([id, other]) => id !== route.id && overlap(label, other)).map(([id]) => id);
    const nodeDistance = Math.min(...graph.nodes.filter((node) => node.id !== route.sourceId && node.id !== route.targetId).map((node) => rectDistance(positions[node.id], label)));
    const nearestSample = route.samples.map((point, index) => ({ point, index, distance: Math.hypot(point.x - label.x, point.y - label.y) })).sort((a, b) => a.distance - b.distance)[0];
    const tangentStart = route.samples[Math.max(0, nearestSample.index - 1)];
    const tangentEnd = route.samples[Math.min(route.samples.length - 1, nearestSample.index + 1)];
    const tangentLength = Math.max(1, Math.hypot(tangentEnd.x - tangentStart.x, tangentEnd.y - tangentStart.y));
    const normalOffset = ((label.x - nearestSample.point.x) * -(tangentEnd.y - tangentStart.y) + (label.y - nearestSample.point.y) * (tangentEnd.x - tangentStart.x)) / tangentLength;
    return {
      id: route.id,
      relation: relationById.get(route.id)?.name,
      owner: `${route.sourceId} -> ${route.targetId}`,
      label: { x: +label.x.toFixed(1), y: +label.y.toFixed(1), width: label.width, height: label.height },
      ownerRouteDistance: +ownerDistance.toFixed(1),
      labelFraction: +(nearestSample.index / Math.max(1, route.samples.length - 1)).toFixed(2),
      labelNormalOffset: +normalOffset.toFixed(1),
      nearestCompetingRoute: competing[0],
      competingRoutesUnder20: competing.filter(({ distance }) => distance < 20).map(({ id }) => id),
      overlappingRelationLabels: labelPeers,
      nearestUnrelatedNodeDistance: +nodeDistance.toFixed(1),
      candidateDiagnostics: route.id === "entity-1" ? candidateDiagnostics(route, graph.nodes.map((node) => ({ ...positions[node.id], id: node.id })), presentation.routedEdges.filter((other) => other.id !== route.id)) : undefined,
      boundedAlternateCandidates: route.id === "entity-1" ? boundedAlternateCandidates(route, positions, presentation.routedEdges.filter((other) => other.id !== route.id)) : undefined,
    };
  }).filter(Boolean);
  console.log(JSON.stringify({ name, feedback: presentation.feedbackApplied, rows }, null, 2));
}

inspect("current", getStoredCoordinates(dataset));
inspect("local-search-v1", localSearch);
