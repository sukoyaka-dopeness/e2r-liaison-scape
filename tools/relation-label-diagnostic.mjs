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

function overlap(left, right) {
  return Math.abs(left.x - right.x) < (left.width + right.width) / 2
    && Math.abs(left.y - right.y) < (left.height + right.height) / 2;
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
    return {
      id: route.id,
      relation: relationById.get(route.id)?.name,
      owner: `${route.sourceId} -> ${route.targetId}`,
      label: { x: +label.x.toFixed(1), y: +label.y.toFixed(1), width: label.width, height: label.height },
      ownerRouteDistance: +ownerDistance.toFixed(1),
      nearestCompetingRoute: competing[0],
      competingRoutesUnder20: competing.filter(({ distance }) => distance < 20).map(({ id }) => id),
      overlappingRelationLabels: labelPeers,
      nearestUnrelatedNodeDistance: +nodeDistance.toFixed(1),
    };
  }).filter(Boolean);
  console.log(JSON.stringify({ name, feedback: presentation.feedbackApplied, rows }, null, 2));
}

inspect("current", getStoredCoordinates(dataset));
inspect("local-search-v1", localSearch);
