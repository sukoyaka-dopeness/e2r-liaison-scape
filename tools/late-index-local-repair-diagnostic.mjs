import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = process.argv[2] ?? "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
const positionsPath = process.argv[3] ?? `${process.env.TEMP}\\e2r-generic-search-apollo-v2.json`;
function readJson(path) {
  const bytes = fs.readFileSync(path);
  const utf8 = bytes.toString("utf8").replace(/^\uFEFF/, "");
  try { return JSON.parse(utf8); } catch {
    return JSON.parse(bytes.toString("utf16le").replace(/^\uFEFF/, ""));
  }
}
const dataset = readJson(fixturePath);
const sourcePositions = readJson(positionsPath);
const basePositions = sourcePositions.selected?.positions ?? sourcePositions.positions ?? sourcePositions;
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};
const compareId = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const clonePositions = (positions) => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
const mapSignatures = (values) => Object.fromEntries([...values.entries()].map(([id, value]) => [id, JSON.stringify(value)]));
const routeSignatures = (routes) => Object.fromEntries(routes.map((route) => [route.id, JSON.stringify({ path: route.path, samples: route.samples, labelPoint: route.labelPoint, controlPoint: route.controlPoint, sourcePosition: route.sourcePosition, targetPosition: route.targetPosition, directRecoveryObstacleId: route.directRecoveryObstacleId })]));
function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}
function routeLength(samples) { return samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - samples[index].x, point.y - samples[index].y), 0); }
function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function segmentsCross(a, b, c, d) { return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0; }
function crossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (first.samples.some((point, index) => index > 0 && second.samples.some((other, otherIndex) => otherIndex > 0 && segmentsCross(first.samples[index - 1], point, second.samples[otherIndex - 1], other)))) count += 1;
  }
  return count;
}
function nodeClear(positions) {
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    if (Math.abs(first.x - second.x) < 76 && Math.abs(first.y - second.y) < 76) return false;
  }
  return true;
}
function render(positions, replayPrefix) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), []));
  const decisions = []; const passes = []; let replayedPrefix = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, ...emptyState,
    routeDecisionSink: (decision) => decisions.push(decision),
    replayPrefix,
    replayPrefixSink: (ids) => { replayedPrefix = ids; },
    presentationPassSink: (pass, routes, relationLabels, nodeLabels) => passes.push({ pass, routes: routeSignatures(routes), relationLabels: mapSignatures(relationLabels), nodeLabels: mapSignatures(nodeLabels) }),
  });
  const labels = [...presentation.nodeLabels.values()];
  const lengths = presentation.routedEdges.map((route) => routeLength(route.samples)).sort((left, right) => left - right);
  const xs = Object.values(positions).map((point) => point.x); const ys = Object.values(positions).map((point) => point.y);
  return {
    presentation,
    trace: { routes: routeSignatures(presentation.routedEdges), relationLabels: mapSignatures(presentation.relationLabels), nodeLabels: mapSignatures(presentation.nodeLabels), feedbackApplied: presentation.feedbackApplied, decisions, passes, replayedPrefix },
    metrics: {
      hitRelationIds: presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).map((route) => route.id),
      nearRelationIds: presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).map((route) => route.id),
      crossings: crossingCount(presentation.routedEdges),
      routeMedian: lengths[Math.floor(lengths.length / 2)] ?? 0,
      routeMax: Math.max(...lengths, 0),
      extent: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
      fit: fitGraphView(Object.values(positions), 800, 500).scale,
      feedbackApplied: presentation.feedbackApplied,
    },
  };
}
function firstDecisions(rendered, pass = "first") { return rendered.trace.decisions.filter((decision) => decision.pass === pass).sort((left, right) => left.processingIndex - right.processingIndex); }
function routeOrder(rendered) { return firstDecisions(rendered).map((decision) => decision.edgeId); }
function routeIndexMap(rendered) { return new Map(firstDecisions(rendered).map((decision) => [decision.edgeId, decision.processingIndex])); }
function compareMaps(left, right) { const ids = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]); return [...ids].filter((id) => left?.[id] !== right?.[id]).sort(compareId); }
function endpointIds(routeIds) { const selected = new Set(routeIds); return edges.filter((edge) => selected.has(edge.id)).flatMap((edge) => [edge.sourceId, edge.targetId]); }
function incidentEdgeIds(nodeIds) { const selected = new Set(nodeIds); return edges.filter((edge) => selected.has(edge.sourceId) || selected.has(edge.targetId)).map((edge) => edge.id); }
function conflictOwners(rendered, routeIds) {
  const owners = new Set();
  for (const route of rendered.presentation.routedEdges.filter((candidate) => routeIds.includes(candidate.id))) for (const node of graph.nodes) {
    const label = rendered.presentation.nodeLabels.get(node.id);
    if (label && routeSamplesHaveLabelCollision(route.samples, [label])) owners.add(node.id);
  }
  return [...owners];
}
function regionFromHits(rendered) { return [...new Set([...endpointIds(rendered.metrics.hitRelationIds), ...conflictOwners(rendered, rendered.metrics.hitRelationIds)])].sort(compareId); }
function routeDecisionCounts(rendered) { return Object.fromEntries(["label-free", "first", "feedback"].map((pass) => [pass, rendered.trace.decisions.filter((decision) => decision.pass === pass).length])); }
function work(rendered) { const counts = routeDecisionCounts(rendered); return counts["label-free"] + counts.first + counts.feedback; }
function changedIds(before, after, key) { return compareMaps(before.trace[key], after.trace[key]); }
function changedRoutes(before, after) { return changedIds(before, after, "routes"); }
function chooseLateDefect() {
  const clean = render(basePositions);
  if (clean.metrics.hitRelationIds.length > 0) throw new Error("Expected the supplied positions to be hard-clean");
  const candidates = [];
  const offsets = [];
  for (let dx = -240; dx <= 240; dx += 48) for (let dy = -240; dy <= 240; dy += 48) if (dx !== 0 || dy !== 0) offsets.push({ dx, dy });
  for (const node of graph.nodes) for (const offset of offsets) {
    const positions = clonePositions(basePositions); positions[node.id].x += offset.dx; positions[node.id].y += offset.dy;
    if (!nodeClear(positions)) continue;
    const rendered = render(positions);
    if (rendered.metrics.hitRelationIds.length !== 1) continue;
    const index = routeIndexMap(rendered).get(rendered.metrics.hitRelationIds[0]);
    if (!Number.isFinite(index)) continue;
    candidates.push({ nodeId: node.id, offset, positions, rendered, index });
  }
  candidates.sort((left, right) => right.index - left.index || Math.hypot(left.offset.dx, left.offset.dy) - Math.hypot(right.offset.dx, right.offset.dy) || compareId(left.nodeId, right.nodeId));
  for (const defect of candidates) {
    const directions = [{ x: 24, y: 0 }, { x: -24, y: 0 }, { x: 0, y: 24 }, { x: 0, y: -24 }, { x: 24, y: 24 }, { x: -24, y: 24 }, { x: 24, y: -24 }, { x: -24, y: -24 }];
    const repairs = directions.map((delta) => {
      const positions = clonePositions(defect.positions); positions[defect.nodeId].x += delta.x; positions[defect.nodeId].y += delta.y;
      return { delta, positions, rendered: nodeClear(positions) ? render(positions) : null };
    }).filter((candidate) => candidate.rendered && candidate.rendered.metrics.hitRelationIds.length <= defect.rendered.metrics.hitRelationIds.length);
    repairs.sort((left, right) => left.rendered.metrics.hitRelationIds.length - right.rendered.metrics.hitRelationIds.length || left.rendered.metrics.crossings - right.rendered.metrics.crossings);
    if (repairs[0]) return { clean, defect, repair: repairs[0], searchedCandidates: candidates.length };
  }
  throw new Error(`No late-index single-hit diagnostic mutation found after ${candidates.length} candidates`);
}
const scenario = chooseLateDefect();
const defect = scenario.defect.rendered; const fullRepair = scenario.repair.rendered;
const defectRegion = regionFromHits(defect);
const defectOrder = routeOrder(defect); const defectIndexMap = routeIndexMap(defect);
const initialEdges = incidentEdgeIds(defectRegion);
const firstRegionIndex = Math.min(...initialEdges.map((id) => defectIndexMap.get(id) ?? Infinity));
const initialPrefix = Number.isFinite(firstRegionIndex) ? defectOrder.slice(0, firstRegionIndex) : defectOrder;
const localInitial = render(scenario.repair.positions, {
  edgeIds: initialPrefix,
  routes: new Map(defect.presentation.routedEdges.map((route) => [route.id, route])),
});
const compare = (full, local) => ({
  exact: compareMaps(full.trace.routes, local.trace.routes).length === 0
    && compareMaps(full.trace.relationLabels, local.trace.relationLabels).length === 0
    && compareMaps(full.trace.nodeLabels, local.trace.nodeLabels).length === 0
    && full.trace.feedbackApplied === local.trace.feedbackApplied,
  routeMismatches: compareMaps(full.trace.routes, local.trace.routes),
  relationLabelMismatches: compareMaps(full.trace.relationLabels, local.trace.relationLabels),
  nodeLabelMismatches: compareMaps(full.trace.nodeLabels, local.trace.nodeLabels),
  feedbackMismatch: full.trace.feedbackApplied !== local.trace.feedbackApplied,
});
const equivalence = compare(fullRepair, localInitial);
const changedRouteIds = changedRoutes(defect, fullRepair);
const changedRelationLabelIds = changedIds(defect, fullRepair, "relationLabels");
const changedNodeLabelIds = changedIds(defect, fullRepair, "nodeLabels");
const initialRegionEdges = incidentEdgeIds(defectRegion);
const initialEscapedNodes = [...new Set([...endpointIds(changedRouteIds), ...endpointIds(changedRelationLabelIds), ...changedNodeLabelIds])].filter((id) => !defectRegion.includes(id)).sort(compareId);
const fullChangedNodes = [...new Set([...endpointIds(changedRouteIds), ...endpointIds(changedRelationLabelIds), ...changedNodeLabelIds])].sort(compareId);
const fullRegion = [...new Set([...defectRegion, ...fullChangedNodes])].sort(compareId);
const fullRegionEdges = incidentEdgeIds(fullRegion);
const fullRegionFirstIndex = Math.min(...fullRegionEdges.map((id) => defectIndexMap.get(id) ?? Infinity));
const fullRegionPrefix = Number.isFinite(fullRegionFirstIndex) ? defectOrder.slice(0, fullRegionFirstIndex) : defectOrder;
const localExpanded = render(scenario.repair.positions, { edgeIds: fullRegionPrefix, routes: new Map(defect.presentation.routedEdges.map((route) => [route.id, route])) });
const expandedEquivalence = compare(fullRepair, localExpanded);
const defectRelocation = fullRepair.metrics.hitRelationIds.some((id) => !defect.metrics.hitRelationIds.includes(id));
const repairDirection = scenario.repair.delta;
const clean = scenario.clean;
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-LATE-INDEX-LOCAL-REPAIR-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  fixturePath,
  positionsPath,
  graph: { nodes: graph.nodes.length, edges: edges.length },
  cleanBaseline: { metrics: clean.metrics, repairTriggered: false },
  lateIndexCase: {
    mutatedNodeId: scenario.defect.nodeId,
    defectOffset: scenario.defect.offset,
    repairDelta: repairDirection,
    hardDefectRelationIds: defect.metrics.hitRelationIds,
    defectProcessingIndex: scenario.defect.index,
    defectMetrics: defect.metrics,
    repairMetrics: fullRepair.metrics,
    defectRelocation,
    initialAffectedRegion: defectRegion,
    initialAffectedRegionSize: defectRegion.length,
    initialAffectedEdgeCount: initialRegionEdges.length,
    expandedAffectedRegion: fullRegion,
    expandedAffectedRegionSize: fullRegion.length,
    initialEscapedDependencyNodes: initialEscapedNodes,
    changedRouteIds,
    changedRelationLabelIds,
    changedNodeLabelIds,
    feedbackChanged: defect.trace.feedbackApplied !== fullRepair.trace.feedbackApplied,
    routeOrderChanged: JSON.stringify(defectOrder) !== JSON.stringify(routeOrder(fullRepair)),
  },
  locality: {
    firstDirtyProcessingIndex: firstRegionIndex,
    initialPrefixReplayed: localInitial.trace.replayedPrefix,
    initialRecomputedFirstPassRoutes: defectOrder.length - initialPrefix.length,
    initialFullEquivalence: equivalence,
    expandedPrefixReplayed: localExpanded.trace.replayedPrefix,
    expandedRecomputedFirstPassRoutes: defectOrder.length - fullRegionPrefix.length,
    expandedFullEquivalence: expandedEquivalence,
    expansionSteps: 1,
  },
  work: {
    defectStateRouteDecisionCounts: routeDecisionCounts(defect),
    fullAuthorityRouteDecisionCounts: routeDecisionCounts(fullRepair),
    fullAuthorityTotal: work(fullRepair),
    progressiveInitialTotal: work(localInitial),
    progressiveExpandedTotal: work(localExpanded),
    savingsInitial: work(fullRepair) - work(localInitial),
    savingsExpanded: work(fullRepair) - work(localExpanded),
    savingsInitialPercent: Number(((work(fullRepair) - work(localInitial)) / Math.max(1, work(fullRepair)) * 100).toFixed(1)),
    savingsExpandedPercent: Number(((work(fullRepair) - work(localExpanded)) / Math.max(1, work(fullRepair)) * 100).toFixed(1)),
    passSavings: {
      labelFree: routeDecisionCounts(fullRepair)["label-free"] - routeDecisionCounts(localInitial)["label-free"],
      first: routeDecisionCounts(fullRepair).first - routeDecisionCounts(localInitial).first,
      feedback: routeDecisionCounts(fullRepair).feedback - routeDecisionCounts(localInitial).feedback,
    },
  },
  search: { lateCandidatesConsidered: scenario.searchedCandidates, selection: "latest single hard-hit relation with a bounded one-Node repair direction" },
  classification: equivalence.exact && work(localInitial) < work(fullRepair) && !defectRelocation
    ? "A_LATE_INDEX_EXACT_LOCAL_SAVINGS"
    : equivalence.exact && work(localInitial) < work(fullRepair)
      ? "B_SAVINGS_BUT_DEFECT_RELOCATION"
      : expandedEquivalence.exact && work(localInitial) < work(fullRepair)
        ? "C_E_PREFIX_SAVINGS_ERASED_BY_ESCAPED_DEPENDENCY"
        : equivalence.exact ? "C_OR_D_GLOBAL_STAGES_OR_ORDER_ERASE_SAVINGS" : "E_LOCALITY_NOT_EXACT",
  state: { productSourceChanged: false, productAdoption: false, governedEvidenceChanged: false, historicalEvidenceChanged: false },
}, null, 2));
