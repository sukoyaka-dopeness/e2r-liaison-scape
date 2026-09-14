import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { settleInitialPlacement } from "../src/auto-layout.ts";
import { placeNodeLabel, routeSamplesHaveLabelCollision, routeSamplesHaveNodeInfluence, routeSamplesHaveOccupiedPathConflict, fitGraphView } from "../src/viewport.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";

const ROOT = "../e2r-spec/examples";
const REPEATS = 3;
const VIEWPORT = { width: 800, height: 500 };

function entity(id, name, description = "") { return { id, name, description }; }
function relation(id, sourceId, targetId, name = "connected") { return { id, sourceId, targetId, name }; }
function dataset(entities, relations) { return { version: "1.0", entities, events: [], relations }; }

function syntheticBipartite(leftSize, rightSize, minusOne = false) {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  const relations = left.flatMap((sourceId) => right.map((targetId) => relation(`${sourceId}-${targetId}`, sourceId, targetId)));
  return dataset([...left, ...right].map((id) => entity(id, id.replace("-", " "))), minusOne ? relations.slice(1) : relations);
}

function symmetricRing() {
  const ids = Array.from({ length: 8 }, (_, index) => `ring-${index + 1}`);
  const relations = ids.map((id, index) => relation(`ring-edge-${index + 1}`, id, ids[(index + 1) % ids.length], "ring"));
  return dataset(ids.map((id) => entity(id, id)), relations);
}

function articulationBlocks() {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const edges = [["a", "b"], ["b", "c"], ["c", "a"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "d"], ["f", "g"]];
  return dataset(ids.map((id) => entity(id, `block ${id}`)), edges.map(([sourceId, targetId], index) => relation(`block-${index + 1}`, sourceId, targetId, "block")));
}

function parallelBundle(locale) {
  const long = locale === "ja" ? "非常に長い関係ラベルの確認用テキスト" : "a deliberately long relation label for bundle capacity";
  const entities = ["source", "target", "north", "south", "outer"].map((id) => entity(id, id));
  const relations = [
    relation("bundle-1", "source", "target", long), relation("bundle-2", "source", "target", long),
    relation("bundle-3", "source", "target", long), relation("bundle-4", "source", "target", long),
    relation("bundle-north", "source", "north", "north"), relation("bundle-south", "target", "south", "south"),
    relation("bundle-outer", "source", "outer", "outer ordinary"),
  ];
  return dataset(entities, relations);
}

function denseIncident(locale) {
  const center = entity("center", locale === "ja" ? "中心ノード" : "center");
  const others = Array.from({ length: 8 }, (_, index) => entity(`incident-${index + 1}`, locale === "ja" ? `接続先${index + 1}` : `incident ${index + 1}`));
  const relations = others.map((node, index) => relation(`incident-edge-${index + 1}`, "center", node.id, locale === "ja" ? `長い接続ラベル${index + 1}` : `incident relation ${index + 1}`));
  relations.push(relation("incident-parallel-a", "center", "incident-1", "parallel A"), relation("incident-parallel-b", "center", "incident-1", "parallel B"));
  return dataset([center, ...others], relations);
}

function selfLoopCase(locale) {
  const entities = [entity("center", locale === "ja" ? "自己関係中心" : "self-loop center"), entity("near", locale === "ja" ? "近接ノード" : "near node"), entity("far", locale === "ja" ? "遠方ノード" : "far node")];
  const relations = [
    relation("self-1", "center", "center", locale === "ja" ? "監視する自己関係" : "monitor self relation"),
    relation("self-2", "center", "center", locale === "ja" ? "調整する自己関係" : "calibrate self relation"),
    relation("self-3", "center", "center", locale === "ja" ? "長い自己関係ラベル" : "a long self-loop relation label"),
    relation("self-near", "center", "near", "near ordinary"), relation("self-far", "center", "far", "far ordinary"),
  ];
  return dataset([entities[0], entities[1], entities[2]], relations);
}

function longLabelPressure(locale) {
  const text = locale === "ja" ? "これは日本語の長いRelationラベル表示とNode label圧力を確認するための説明文です" : "This is a long English Relation label and Node-label pressure description for baseline measurement";
  const entities = [entity("one", text, text), entity("two", locale === "ja" ? "第二ノード" : "second node", text), entity("three", locale === "ja" ? "第三ノード" : "third node", text), entity("four", locale === "ja" ? "第四ノード" : "fourth node")];
  return dataset(entities, [relation("long-1", "one", "two", text), relation("long-2", "two", "three", text), relation("long-3", "three", "four", text), relation("long-4", "one", "four", text)]);
}

function loadCanonical(name, locale) {
  return JSON.parse(fs.readFileSync(`${ROOT}/${name}.${locale}.e2r.json`, "utf8"));
}

function cases() {
  const result = [];
  for (const name of ["lighthouse-restoration-demo", "apollo-11-mission", "titanic-final-voyage"]) {
    for (const locale of ["en", "ja"]) result.push({ id: `${name}/${locale}`, category: "canonical", locale, dataset: loadCanonical(name, locale) });
  }
  for (const [name, value] of [["k7-7", syntheticBipartite(7, 7)], ["k6-8", syntheticBipartite(6, 8)], ["k8-8", syntheticBipartite(8, 8)], ["k5-9", syntheticBipartite(5, 9)], ["k7-7-minus-one", syntheticBipartite(7, 7, true)]]) {
    result.push({ id: `dense/${name}`, category: "dense", locale: "en", dataset: value });
  }
  result.push({ id: "symmetric/symmetric-ring", category: "symmetry", locale: "en", dataset: symmetricRing() });
  result.push({ id: "decomposition/articulation-blocks", category: "decomposition-sensitive", locale: "en", dataset: articulationBlocks() });
  for (const locale of ["en", "ja"]) {
    result.push({ id: `presentation/parallel-bundle/${locale}`, category: "presentation-sensitive", locale, dataset: parallelBundle(locale) });
    result.push({ id: `presentation/dense-incident/${locale}`, category: "presentation-sensitive", locale, dataset: denseIncident(locale) });
    result.push({ id: `presentation/self-loop/${locale}`, category: "presentation-sensitive", locale, dataset: selfLoopCase(locale) });
    result.push({ id: `presentation/long-label/${locale}`, category: "presentation-sensitive", locale, dataset: longLabelPressure(locale) });
  }
  return result;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function positionKey(positions) { return Object.entries(positions).sort(([a], [b]) => a.localeCompare(b)).map(([id, point]) => `${id}:${point.x.toFixed(6)},${point.y.toFixed(6)}`).join("|"); }
function extent(positions) {
  const points = Object.values(positions); const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
function nodeMetrics(graph, positions) {
  let overlapPairs = 0; let minimumSeparation = Infinity;
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    minimumSeparation = Math.min(minimumSeparation, distance(first, second));
    if (Math.abs(first.x - second.x) < 76 && Math.abs(first.y - second.y) < 76) overlapPairs += 1;
  }
  const bounds = extent(positions);
  return { overlapPairs, minimumSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : null, extent: bounds, aspectRatio: bounds.width / Math.max(1, bounds.height) };
}
function orientation(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function straightCrossings(graph, positions) {
  let count = 0;
  for (let left = 0; left < graph.edges.length; left += 1) for (let right = left + 1; right < graph.edges.length; right += 1) {
    const first = graph.edges[left]; const second = graph.edges[right];
    if (first.sourceId === first.targetId || second.sourceId === second.targetId) continue;
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    const a = positions[first.sourceId]; const b = positions[first.targetId]; const c = positions[second.sourceId]; const d = positions[second.targetId];
    if (orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0) count += 1;
  }
  return count;
}
function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x; const ry = b.y - a.y; const sx = d.x - c.x; const sy = d.y - c.y; const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return false;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator; const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}
function routeCrossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (first.samples.some((point, index) => index > 0 && second.samples.some((other, otherIndex) => otherIndex > 0 && segmentIntersection(first.samples[index - 1], point, second.samples[otherIndex - 1], other)))) count += 1;
  }
  return count;
}
function rectGap(left, right) {
  return Math.hypot(Math.max(Math.abs(left.x - right.x) - (left.width + right.width) / 2, 0), Math.max(Math.abs(left.y - right.y) - (left.height + right.height) / 2, 0));
}
function minimumRouteDistance(first, second) {
  let minimum = Infinity;
  for (const left of first.samples) for (const right of second.samples) minimum = Math.min(minimum, distance(left, right));
  return Number.isFinite(minimum) ? minimum : null;
}
function presentationMetrics(graph, positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), []));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: graph.sourceRelations.get(edge.id) ?? "" })) },
    positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
  });
  const routes = presentation.routedEdges; const relationLabels = [...presentation.relationLabels.values()]; const nodeLabels = [...presentation.nodeLabels.values()];
  const labelRouteHits = routes.filter((route) => routeSamplesHaveLabelCollision(route.samples, nodeLabels)).length;
  const labelNodeMinimum = relationLabels.length && nodeLabels.length ? Math.min(...relationLabels.flatMap((label) => nodeLabels.map((nodeLabel) => rectGap(label, nodeLabel)))) : null;
  const nodeLabelMinimum = nodeLabels.length > 1 ? Math.min(...nodeLabels.flatMap((left, index) => nodeLabels.slice(index + 1).map((right) => rectGap(left, right)))) : null;
  const routeNodeInfluenceCount = routes.filter((route) => routeSamplesHaveNodeInfluence(route.samples, graph.nodes.map((node) => positions[node.id]))).length;
  const groups = new Map();
  for (const route of routes) {
    const key = [route.sourceId, route.targetId].sort().join("\0");
    if ((graph.edgeGroups.get(key) ?? 0) > 1) (groups.get(key) ?? groups.set(key, []).get(key)).push(route);
  }
  const parallel = [...groups.values()].flatMap((group) => group.length < 2 ? [] : group.slice(0, -1).flatMap((route, index) => group.slice(index + 1).map((other) => minimumRouteDistance(route, other))));
  const selfLoops = routes.filter((route) => route.sourceId === route.targetId);
  const ordinaryRoutes = routes.filter((route) => route.sourceId !== route.targetId);
  const selfLoopOrdinaryDistances = selfLoops.flatMap((loop) => ordinaryRoutes.map((route) => minimumRouteDistance(loop, route))).filter(Number.isFinite);
  const selfLoopMinimumOrdinaryClearance = selfLoopOrdinaryDistances.length ? Math.min(...selfLoopOrdinaryDistances) : null;
  const selfLoopRouteConflicts = selfLoops.filter((loop) => routes.some((other) => other.id !== loop.id && routeSamplesHaveOccupiedPathConflict(loop.samples, [other.samples]))).length;
  const selfLoopNearOrdinaryConflicts = selfLoops.filter((loop) => ordinaryRoutes.some((route) => minimumRouteDistance(loop, route) < 8)).length;
  const selfLoopLabelRouteHits = selfLoops.filter((loop) => routeSamplesHaveLabelCollision(loop.samples, relationLabels)).length;
  const viewport = fitGraphView(Object.values(positions), VIEWPORT.width, VIEWPORT.height);
  const outside = Object.values(positions).filter((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)).length;
  const routeLengths = routes.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + distance(point, route.samples[index]), 0));
  const parallelLaneMinimum = parallel.length ? Math.min(...parallel) : null;
  const relationLabelOwnershipMissing = graph.edges.filter((edge) => (graph.sourceRelations.get(edge.id) ?? "") && !presentation.relationLabels.has(edge.id)).length;
  return {
    routeCrossings: routeCrossingCount(routes), relationLabelCount: relationLabels.length, nodeLabelCount: nodeLabels.length,
    relationLabelRouteHits: labelRouteHits, relationLabelNodeMinimumClearance: labelNodeMinimum, nodeLabelMinimumClearance: nodeLabelMinimum,
    relationLabelOwnershipMissing, parallelGroupCount: groups.size, parallelLaneMinimum, selfLoopCount: selfLoops.length,
    selfLoopRouteConflicts, selfLoopNearOrdinaryConflicts, selfLoopMinimumOrdinaryClearance, selfLoopLabelRouteHits,
    routeNodeInfluenceCount, viewportScale: viewport.scale, viewportOutsideCount: outside,
    ordinaryRouteCount: ordinaryRoutes.length, routeMedian: [...routeLengths].sort((a, b) => a - b)[Math.floor(routeLengths.length / 2)] ?? 0,
    routeMax: Math.max(...routeLengths, 0), feedbackApplied: presentation.feedbackApplied,
  };
}

function prepareCase(item) {
  const graph = buildEntityGraph(item.dataset);
  graph.sourceRelations = new Map(item.dataset.relations.map((edge) => [edge.id, typeof edge.name === "string" ? edge.name : ""]));
  graph.edgeGroups = new Map();
  for (const edge of graph.edges) { const key = [edge.sourceId, edge.targetId].sort().join("\0"); graph.edgeGroups.set(key, (graph.edgeGroups.get(key) ?? 0) + 1); }
  return graph;
}

function measure(item) {
  const graph = prepareCase(item); const initialInput = { entities: graph.nodes.map(({ id }) => ({ id })), relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) };
  const placementRuns = []; const presentationRuns = []; let firstPositions;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const placementStartedAt = performance.now(); const positions = settleInitialPlacement(initialInput); const placementElapsedMs = performance.now() - placementStartedAt;
    firstPositions ??= positions; placementRuns.push({ elapsedMs: placementElapsedMs, positions });
    const presentationStartedAt = performance.now(); const metrics = presentationMetrics(graph, positions); const presentationElapsedMs = performance.now() - presentationStartedAt;
    presentationRuns.push({ elapsedMs: presentationElapsedMs, metrics });
  }
  const positions = firstPositions; const placement = nodeMetrics(graph, positions); const positionKeys = placementRuns.map(({ positions: value }) => positionKey(value));
  const presentation = presentationRuns[0].metrics; const stable = positionKeys.every((key) => key === positionKeys[0]);
  const placementTimes = placementRuns.map(({ elapsedMs }) => elapsedMs).sort((a, b) => a - b); const presentationTimes = presentationRuns.map(({ elapsedMs }) => elapsedMs).sort((a, b) => a - b);
  return {
    id: item.id, category: item.category, locale: item.locale, graph: { nodes: graph.nodes.length, edges: graph.edges.length, components: buildComponentCount(graph) },
    placement: { ...placement, straightCrossings: straightCrossings(graph, positions), deterministic: stable, repeats: REPEATS, medianMs: placementTimes[1], p95Ms: placementTimes[placementTimes.length - 1], bounded: true, bound: "one deterministic 3-iteration Product current placement" },
    presentation: { ...presentation, medianMs: presentationTimes[1], p95Ms: presentationTimes[presentationTimes.length - 1], totalMedianMs: placementTimes[1] + presentationTimes[1], authority: "Product-authoritative routing / Relation-label / Node-label / viewport pipeline" },
  };
}
function buildComponentCount(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) if (edge.sourceId !== edge.targetId) { adjacency.get(edge.sourceId)?.push(edge.targetId); adjacency.get(edge.targetId)?.push(edge.sourceId); }
  const seen = new Set(); let count = 0;
  for (const node of graph.nodes) { if (seen.has(node.id)) continue; count += 1; const queue = [node.id]; seen.add(node.id); while (queue.length) for (const next of adjacency.get(queue.shift()) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); } }
  return count;
}

const results = cases().map(measure);
const artifact = {
  contract: "RESPONSIBILITY-SEPARATED-INITIAL-LAYOUT-REBASELINE-v1",
  diagnosticOnly: true,
  baseline: "current Product initial placement via settleInitialPlacement / current-product path; no rejected solver or new provider",
  repeats: REPEATS,
  authority: {
    placement: "derived Node geometry only",
    routing: "Product-owned automatic routing and occupied-path arbitration",
    parallelIncident: "existing Product authority",
    relationLabel: "Product-owned final Relation-label placement",
    nodeLabel: "Product-owned final Node-label placement",
    selfLoop: "existing Self-loop routing branch",
    endpointPlan: "existing authoritative capacity evaluation",
    viewport: "Product fit boundary",
  },
  metricSeparation: {
    placementOwned: ["node overlap", "minimum Node separation", "straight structural crossings", "extent/aspect", "determinism", "placement runtime", "component count", "bounded search"],
    productAuthoritative: ["actual route crossings", "Relation-label ownership/clearance", "Node-label clearance", "parallel lane separation", "Self-loop conflicts", "viewport scale/outside", "route influence", "presentation runtime"],
    attributionRule: "downstream failures are not relabeled as placement failures; placement contribution is reported separately",
  },
  cases: results,
  summary: {
    resultCount: results.length,
    categoryCounts: Object.fromEntries([...new Set(results.map(({ category }) => category))].map((category) => [category, results.filter((result) => result.category === category).length])),
    deterministicFailures: results.filter((result) => !result.placement.deterministic).length,
    placementOverlapCases: results.filter((result) => result.placement.overlapPairs > 0).length,
    presentationCrossingCases: results.filter((result) => result.presentation.routeCrossings > 0).length,
    selfLoopConflictCases: results.filter((result) => result.presentation.selfLoopRouteConflicts > 0).length,
  },
};
fs.mkdirSync("experimental/initial-layout-responsibility-rebaseline", { recursive: true });
fs.writeFileSync("experimental/initial-layout-responsibility-rebaseline/audit.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ summary: artifact.summary, results: results.map(({ id, category, graph, placement, presentation }) => ({ id, category, graph, placement: { overlapPairs: placement.overlapPairs, minimumSeparation: placement.minimumSeparation, straightCrossings: placement.straightCrossings, extent: placement.extent, deterministic: placement.deterministic, medianMs: placement.medianMs, p95Ms: placement.p95Ms }, presentation: { routeCrossings: presentation.routeCrossings, relationLabelRouteHits: presentation.relationLabelRouteHits, relationLabelNodeMinimumClearance: presentation.relationLabelNodeMinimumClearance, nodeLabelMinimumClearance: presentation.nodeLabelMinimumClearance, parallelGroupCount: presentation.parallelGroupCount, parallelLaneMinimum: presentation.parallelLaneMinimum, selfLoopCount: presentation.selfLoopCount, selfLoopRouteConflicts: presentation.selfLoopRouteConflicts, viewportScale: presentation.viewportScale, medianMs: presentation.medianMs, totalMedianMs: presentation.totalMedianMs } })) }, null, 2));
