import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = process.argv[2];
const positionsPath = process.argv[3];
if (!fixturePath) throw new Error("Usage: node progressive-local-repair-diagnostic.mjs <fixture.json> [positions-or-search.json]");

function readJson(path) {
  const bytes = fs.readFileSync(path);
  const utf8 = bytes.toString("utf8").replace(/^\uFEFF/, "");
  try { return JSON.parse(utf8); } catch {
    return JSON.parse(bytes.toString("utf16le").replace(/^\uFEFF/, ""));
  }
}

const dataset = readJson(fixturePath);
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function compareId(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function clonePositions(positions) { return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }])); }
function mapSignatures(values) { return Object.fromEntries([...values.entries()].map(([id, value]) => [id, JSON.stringify(value)])); }
function routeSignatures(routes) { return Object.fromEntries(routes.map((route) => [route.id, JSON.stringify({
  path: route.path,
  samples: route.samples,
  labelPoint: route.labelPoint,
  controlPoint: route.controlPoint,
  sourcePosition: route.sourcePosition,
  targetPosition: route.targetPosition,
  directRecoveryObstacleId: route.directRecoveryObstacleId,
})])); }
function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}
function routeLength(samples) {
  return samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(
    point.x - samples[index].x,
    point.y - samples[index].y,
  ), 0);
}
function segmentCrosses(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}
function crossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (first.samples.some((point, index) => index > 0 && second.samples.some((other, otherIndex) => otherIndex > 0
      && segmentCrosses(first.samples[index - 1], point, second.samples[otherIndex - 1], other)))) count += 1;
  }
  return count;
}
function extractCoordinatePositions(source) {
  const result = {};
  for (const entity of source.entities ?? []) {
    const extensions = entity.extensions ?? {};
    const coordinateExtension = Object.values(extensions).find((value) => value && Array.isArray(value.coordinates));
    const coordinate = coordinateExtension?.coordinates?.find((entry) => entry.values?.x !== undefined && entry.values?.y !== undefined);
    if (coordinate) result[entity.id] = { x: coordinate.values.x, y: coordinate.values.y };
  }
  return result;
}
function fallbackPositions() {
  const columns = Math.max(3, Math.ceil(Math.sqrt(graph.nodes.length)));
  return Object.fromEntries(graph.nodes.map((node, index) => [node.id, {
    x: (index % columns) * 220,
    y: Math.floor(index / columns) * 180,
  }]));
}
function loadPositions() {
  if (positionsPath) {
    const source = readJson(positionsPath);
    const selected = source.selected?.positions ?? source.positions ?? source;
    if (selected && typeof selected === "object") return selected;
  }
  const embedded = extractCoordinatePositions(dataset);
  return Object.keys(embedded).length === graph.nodes.length ? embedded : fallbackPositions();
}
const basePositions = loadPositions();

function render(positions, { replayPrefix } = {}) {
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const decisions = [];
  const passes = [];
  let replayedPrefix = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels,
    ...emptyState,
    routeDecisionSink: (decision) => decisions.push(decision),
    replayPrefix,
    replayPrefixSink: (edgeIds) => { replayedPrefix = edgeIds; },
    presentationPassSink: ({ route, relationLabel, nodeLabel }) => passes.push({
      pass: route.pass,
      routes: routeSignatures(route.routes),
      relationLabels: mapSignatures(relationLabel.labels),
      nodeLabels: mapSignatures(nodeLabel.labels),
    }),
  });
  const nodeLabels = [...presentation.nodeLabels.entries()];
  const labelRects = nodeLabels.map(([, label]) => label);
  const hitRelationIds = presentation.routedEdges
    .filter((route) => routeSamplesHaveLabelCollision(route.samples, labelRects))
    .map((route) => route.id);
  const nearRelationIds = presentation.routedEdges
    .filter((route) => route.samples.some((point) => labelRects.some((label) => distanceToRect(point, label) < 20)))
    .map((route) => route.id);
  const lengths = presentation.routedEdges.map((route) => routeLength(route.samples)).sort((left, right) => left - right);
  const xs = Object.values(positions).map((point) => point.x); const ys = Object.values(positions).map((point) => point.y);
  const metrics = {
    hitRelationIds,
    nearRelationIds,
    crossings: crossingCount(presentation.routedEdges),
    routeMedian: lengths[Math.floor(lengths.length / 2)] ?? 0,
    routeMax: Math.max(...lengths, 0),
    extent: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
    fit: fitGraphView(Object.values(positions), 800, 500).scale,
    feedbackApplied: presentation.feedbackApplied,
  };
  return {
    presentation,
    metrics,
    trace: {
      routes: routeSignatures(presentation.routedEdges),
      relationLabels: mapSignatures(presentation.relationLabels),
      nodeLabels: mapSignatures(presentation.nodeLabels),
      feedbackApplied: presentation.feedbackApplied,
      decisions,
      passes,
      replayedPrefix,
    },
  };
}

function compareMaps(left, right) {
  const ids = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  return [...ids].filter((id) => left?.[id] !== right?.[id]).sort(compareId);
}
function compareRender(full, local) {
  const routeMismatches = compareMaps(full.trace.routes, local.trace.routes);
  const relationLabelMismatches = compareMaps(full.trace.relationLabels, local.trace.relationLabels);
  const nodeLabelMismatches = compareMaps(full.trace.nodeLabels, local.trace.nodeLabels);
  const feedbackMismatch = full.trace.feedbackApplied !== local.trace.feedbackApplied;
  return {
    exact: routeMismatches.length === 0 && relationLabelMismatches.length === 0 && nodeLabelMismatches.length === 0 && !feedbackMismatch,
    routeMismatches,
    relationLabelMismatches,
    nodeLabelMismatches,
    feedbackMismatch,
  };
}
function firstDecisions(trace, pass = "first") {
  return trace.decisions.filter((decision) => decision.pass === pass)
    .sort((left, right) => left.processingIndex - right.processingIndex);
}
function routeOrder(trace) { return firstDecisions(trace).map((decision) => decision.edgeId); }
function incidentEdgeIds(nodeIds) {
  const selected = new Set(nodeIds);
  return edges.filter((edge) => selected.has(edge.sourceId) || selected.has(edge.targetId)).map((edge) => edge.id);
}
function endpointIds(routeIds) {
  const selected = new Set(routeIds);
  return edges.filter((edge) => selected.has(edge.id)).flatMap((edge) => [edge.sourceId, edge.targetId]);
}
function conflictingLabelOwners(rendered, routeIds) {
  const owners = new Set();
  for (const route of rendered.presentation.routedEdges.filter((candidate) => routeIds.includes(candidate.id))) {
    for (const node of graph.nodes) {
      const label = rendered.presentation.nodeLabels.get(node.id);
      if (label && routeSamplesHaveLabelCollision(route.samples, [label])) owners.add(node.id);
    }
  }
  return [...owners];
}
function initialAffectedRegion(rendered) {
  const hitIds = rendered.metrics.hitRelationIds;
  return [...new Set([...endpointIds(hitIds), ...conflictingLabelOwners(rendered, hitIds)])].sort(compareId);
}
function decisionIndexMap(trace) { return new Map(firstDecisions(trace).map((decision) => [decision.edgeId, decision.processingIndex])); }
function routeDecisionCounts(trace) {
  return Object.fromEntries(["label-free", "first", "feedback"].map((pass) => [pass, trace.decisions.filter((decision) => decision.pass === pass).length]));
}
function changedRouteIds(before, after) { return compareMaps(before.trace.routes, after.trace.routes); }
function changedNodeLabelIds(before, after) { return compareMaps(before.trace.nodeLabels, after.trace.nodeLabels); }
function changedRelationLabelIds(before, after) { return compareMaps(before.trace.relationLabels, after.trace.relationLabels); }

function moveForRegionalCare(positions, baseline) {
  const next = clonePositions(positions);
  const route = baseline.presentation.routedEdges.find((candidate) => candidate.id === "r18");
  if (!route || !next["pharmacy-coalition"] || !next["volunteer-coalition"]) return { positions: next, movedNodes: [], strategy: "none" };
  const start = route.samples[0]; const end = route.samples.at(-1);
  const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  for (const id of ["pharmacy-coalition", "volunteer-coalition"]) {
    next[id].x += normal.x * 24;
    next[id].y += normal.y * 24;
  }
  return { positions: next, movedNodes: ["pharmacy-coalition", "volunteer-coalition"], strategy: "r18-owner-normal-24" };
}
function genericLocalMutation(positions, region) {
  const next = clonePositions(positions);
  const id = region[0];
  if (!id || !next[id]) return { positions: next, movedNodes: [], strategy: "none" };
  next[id].x += 24;
  return { positions: next, movedNodes: [id], strategy: "first-region-node-plus-x-24" };
}

const fullBaseline = render(basePositions);
const initialRegion = initialAffectedRegion(fullBaseline);
const mutation = graph.nodes.some((node) => node.id === "pharmacy-coalition")
  ? moveForRegionalCare(basePositions, fullBaseline)
  : genericLocalMutation(basePositions, initialRegion);
const triggered = fullBaseline.metrics.hitRelationIds.length > 0;
const fullRepair = triggered ? render(mutation.positions) : fullBaseline;
const initialEdges = incidentEdgeIds(initialRegion);
const order = routeOrder(fullBaseline.trace);
const indexMap = decisionIndexMap(fullBaseline.trace);
const firstInitialIndex = Math.min(...initialEdges.map((id) => indexMap.get(id) ?? Infinity));
const firstMutatedIndex = Math.min(...changedRouteIds(fullBaseline, fullRepair).map((id) => indexMap.get(id) ?? Infinity));
const firstDirtyIndex = Math.min(firstInitialIndex, firstMutatedIndex);
const prefixForInitialRegion = Number.isFinite(firstDirtyIndex) ? order.slice(0, firstDirtyIndex) : order;
const localInitial = triggered ? render(mutation.positions, {
  replayPrefix: {
    edgeIds: prefixForInitialRegion,
    routes: new Map(fullBaseline.presentation.routedEdges.map((route) => [route.id, route])),
  },
}) : fullBaseline;
const initialEquivalence = compareRender(fullRepair, localInitial);

const expansionSteps = [];
if (!triggered) {
  expansionSteps.push({
    step: 0,
    regionNodes: [],
    regionSize: 0,
    regionEdgeCount: 0,
    firstRegionProcessingIndex: null,
    prefixReplayed: [],
    recomputedFirstPassRoutes: 0,
    estimatedPresentationRouteEvaluations: 0,
    localExactFullEquivalence: true,
    mismatchStage: null,
    escapedDependencyNodes: [],
    escapedRouteIds: [],
    fullChangedRouteIds: [],
    fullChangedRelationLabelIds: [],
    fullChangedNodeLabelIds: [],
  });
} else {
let region = new Set(initialRegion);
let previousRegionSize = 0;
for (let step = 0; step < graph.nodes.length + 2; step += 1) {
  const regionNodes = [...region].sort(compareId);
  const regionEdges = incidentEdgeIds(regionNodes);
  const firstRegionIndex = Math.min(...regionEdges.map((id) => indexMap.get(id) ?? Infinity));
  const prefix = Number.isFinite(firstRegionIndex) ? order.slice(0, firstRegionIndex) : order;
  const local = render(mutation.positions, {
    replayPrefix: {
      edgeIds: prefix,
      routes: new Map(fullBaseline.presentation.routedEdges.map((route) => [route.id, route])),
    },
  });
  const equivalence = compareRender(fullRepair, local);
  const changedRoutes = changedRouteIds(fullBaseline, fullRepair);
  const changedRelations = changedRelationLabelIds(fullBaseline, fullRepair);
  const changedNodes = changedNodeLabelIds(fullBaseline, fullRepair);
  const escapedRoutes = changedRoutes.filter((id) => !regionEdges.includes(id));
  const escapedRouteNodes = endpointIds(escapedRoutes);
  const escapedLabelNodes = [...new Set([...changedNodes, ...endpointIds(changedRelations)])];
  const escaped = [...new Set([...escapedRouteNodes, ...escapedLabelNodes])].filter((id) => !region.has(id));
  expansionSteps.push({
    step,
    regionNodes,
    regionSize: regionNodes.length,
    regionEdgeCount: regionEdges.length,
    firstRegionProcessingIndex: Number.isFinite(firstRegionIndex) ? firstRegionIndex : null,
    prefixReplayed: prefix,
    recomputedFirstPassRoutes: Math.max(0, order.length - prefix.length),
    estimatedPresentationRouteEvaluations: fullWork(local.trace),
    localExactFullEquivalence: equivalence.exact,
    mismatchStage: equivalence.routeMismatches.length > 0 ? "route-geometry" : equivalence.relationLabelMismatches.length > 0 ? "relation-label-geometry" : equivalence.nodeLabelMismatches.length > 0 ? "node-label-geometry" : equivalence.feedbackMismatch ? "feedback-state" : null,
    escapedDependencyNodes: escaped,
    escapedRouteIds: escapedRoutes,
    fullChangedRouteIds: changedRoutes,
    fullChangedRelationLabelIds: changedRelations,
    fullChangedNodeLabelIds: changedNodes,
  });
  if ((equivalence.exact && prefix.length > 0) || escaped.length === 0 || region.size === graph.nodes.length || region.size === previousRegionSize) break;
  previousRegionSize = region.size;
  escaped.forEach((id) => region.add(id));
}
}

function fullWork(trace) {
  const counts = routeDecisionCounts(trace);
  return counts["label-free"] + counts.first + counts.feedback;
}
const finalStep = expansionSteps.at(-1);
const cleanFixtureNoTrigger = fullBaseline.metrics.hitRelationIds.length === 0;
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-PROGRESSIVE-LOCAL-REPAIR-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  fixturePath,
  positionsPath: positionsPath ?? "embedded-or-deterministic-fallback",
  graph: { nodes: graph.nodes.length, edges: edges.length },
  trigger: {
    hardDefectRelationIds: fullBaseline.metrics.hitRelationIds,
    triggered,
    cleanFixtureNoTrigger,
    initialAffectedRegion: initialRegion,
    initialAffectedRegionSize: initialRegion.length,
  },
  repairMutation: {
    strategy: mutation.strategy,
    movedNodes: mutation.movedNodes,
    fullResult: fullRepair.metrics,
    defectRelocation: fullRepair.metrics.hitRelationIds.some((id) => !fullBaseline.metrics.hitRelationIds.includes(id)),
  },
  baseline: fullBaseline.metrics,
  fullRepair: {
    metrics: fullRepair.metrics,
    routeDecisionCounts: routeDecisionCounts(fullRepair.trace),
    totalPresentationRouteEvaluations: fullWork(fullRepair.trace),
    changedRouteIds: changedRouteIds(fullBaseline, fullRepair),
    changedRelationLabelIds: changedRelationLabelIds(fullBaseline, fullRepair),
    changedNodeLabelIds: changedNodeLabelIds(fullBaseline, fullRepair),
    routeOrderChanged: JSON.stringify(routeOrder(fullBaseline.trace)) !== JSON.stringify(routeOrder(fullRepair.trace)),
  },
  initialLocalReplay: {
    prefixReplayed: localInitial.trace.replayedPrefix,
    metrics: localInitial.metrics,
    exactFullEquivalence: initialEquivalence.exact,
    mismatch: initialEquivalence,
    estimatedRouteEvaluations: fullWork(localInitial.trace),
  },
  progressiveExpansion: {
    steps: expansionSteps,
    expansionStepCount: expansionSteps.length,
    finalRegionSize: finalStep?.regionSize ?? initialRegion.length,
    finalExactFullEquivalence: finalStep?.localExactFullEquivalence ?? false,
    finalPrefixReplayedCount: finalStep?.prefixReplayed?.length ?? 0,
    fullRouteEvaluations: fullWork(fullRepair.trace),
    finalEstimatedRouteEvaluations: finalStep?.estimatedPresentationRouteEvaluations ?? null,
  },
  classification: cleanFixtureNoTrigger
    ? "NO_TRIGGER_NO_REPAIR"
    : finalStep?.localExactFullEquivalence && finalStep.estimatedPresentationRouteEvaluations < fullWork(fullRepair.trace)
      && (finalStep.regionSize < graph.nodes.length)
      ? "LOCAL_REPAIR_EXACT_WITHOUT_FULL_REGION"
      : finalStep?.localExactFullEquivalence ? "EXACT_BUT_FULL_WORK_REQUIRED" : "FULL_FALLBACK_REQUIRED_OR_UNRESOLVED",
  state: {
    productSourceChanged: false,
    productAdoption: false,
    governedEvidenceChanged: false,
    historicalEvidenceChanged: false,
  },
}, null, 2));
