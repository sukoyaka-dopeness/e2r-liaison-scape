import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:").replaceAll("/", "\\");
const repo = root.endsWith("\\") ? root.slice(0, -1) : root;
const regionalFixture = `${repo}\\..\\e2r-spec\\examples\\visual-fixtures\\regional-care-coordination.en.e2r.json`;
const apolloFixture = `${repo}\\experimental\\product-evaluation-seam\\actual-inspection\\fixtures\\apollo-11-spacing-220.en.e2r.json`;
const apolloPositions = `${process.env.TEMP}\\e2r-generic-search-apollo-v2.json`;
const regionalPositions = `${process.env.TEMP}\\e2r-audit-regional-care-pair-standard-corridor.json`;

function readJson(path) {
  const bytes = fs.readFileSync(path);
  const utf8 = bytes.toString("utf8").replace(/^\uFEFF/, "");
  try { return JSON.parse(utf8); } catch { return JSON.parse(bytes.toString("utf16le").replace(/^\uFEFF/, "")); }
}
function selectedPositions(path) {
  const value = readJson(path);
  return value.selected?.positions ?? value.positions ?? value;
}
function clonePositions(value) { return Object.fromEntries(Object.entries(value).map(([id, point]) => [id, { ...point }])); }
function signature(value) { return JSON.stringify(value); }
function routeSignatures(routes) { return Object.fromEntries(routes.map((route) => [route.id, signature({ path: route.path, samples: route.samples, labelPoint: route.labelPoint, controlPoint: route.controlPoint })])); }
function mapSignatures(values) { return Object.fromEntries([...values.entries()].map(([id, value]) => [id, signature(value)])); }
function compareMaps(left, right) {
  const ids = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  return [...ids].filter((id) => left?.[id] !== right?.[id]).sort();
}
function routeLength(samples) { return samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - samples[index].x, point.y - samples[index].y), 0); }
function distanceToRect(point, rect) {
  return Math.hypot(Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0), Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0));
}
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

function render(spec, positions, manualRelationLabelAnchors = new Map(), candidateCache) {
  const graph = buildEntityGraph(spec.dataset);
  const edges = graph.edges.map((edge) => ({ ...edge, label: spec.dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), []));
  const decisions = [];
  const startedAt = performance.now();
  const startingStats = candidateCache?.stats ? { ...candidateCache.stats } : null;
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors,
    routeDecisionSink: (decision) => decisions.push(decision),
    candidateCache,
  });
  const labels = [...presentation.nodeLabels.values()];
  const lengths = presentation.routedEdges.map((route) => routeLength(route.samples)).sort((a, b) => a - b);
  const xs = Object.values(positions).map((point) => point.x); const ys = Object.values(positions).map((point) => point.y);
  const candidateSets = Object.fromEntries(decisions.map((decision) => [`${decision.pass}:${decision.edgeId}`, signature(decision.candidateDiagnostics)]));
  const candidateCount = decisions.reduce((sum, decision) => sum + decision.candidateDiagnostics.length, 0);
  const stats = candidateCache?.stats && startingStats ? Object.fromEntries(Object.keys(candidateCache.stats).map((key) => [key, candidateCache.stats[key] - startingStats[key]])) : null;
  return {
    graph,
    presentation,
    routeSignatures: routeSignatures(presentation.routedEdges),
    relationLabelSignatures: mapSignatures(presentation.relationLabels),
    nodeLabelSignatures: mapSignatures(presentation.nodeLabels),
    candidateSets,
    candidateCount,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    cacheStats: stats,
    decisionCounts: Object.fromEntries(["label-free", "first", "feedback"].map((pass) => [pass, decisions.filter((decision) => decision.pass === pass).length])),
    metrics: {
      hardHits: presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).map((route) => route.id),
      near: presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).map((route) => route.id),
      crossings: crossingCount(presentation.routedEdges),
      routeMedian: lengths[Math.floor(lengths.length / 2)] ?? 0,
      routeMax: Math.max(...lengths, 0),
      extent: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
      fit: fitGraphView(Object.values(positions), 800, 500).scale,
      feedbackApplied: presentation.feedbackApplied,
    },
  };
}

function runFixture(name, fixturePath, positionsPath) {
  const dataset = readJson(fixturePath);
  const spec = { dataset };
  const basePositions = selectedPositions(positionsPath);
  const candidateCache = { entries: new Map(), stats: { lookups: 0, hits: 0, misses: 0 } };
  const baseline = render(spec, basePositions, new Map(), candidateCache);
  const uncachedRepeat = render(spec, basePositions);
  const exactRepeat = render(spec, basePositions, new Map(), candidateCache);
  const downstreamAnchorId = buildEntityGraph(dataset).edges[0]?.id;
  const downstreamAnchors = new Map(downstreamAnchorId ? [[downstreamAnchorId, { fraction: 0.2, tangentOffset: 8, normalOffset: 64 }]] : []);
  const downstreamOnly = render(spec, basePositions, downstreamAnchors, candidateCache);
  const downstreamUncached = render(spec, basePositions, downstreamAnchors);
  const semanticPositions = clonePositions(basePositions);
  const semanticNodeId = buildEntityGraph(dataset).nodes[0]?.id;
  if (semanticNodeId) semanticPositions[semanticNodeId].x += 24;
  const semanticMutation = render(spec, semanticPositions, new Map(), candidateCache);
  const semanticUncached = render(spec, semanticPositions);
  const baselineToDownstreamCandidates = compareMaps(baseline.candidateSets, downstreamOnly.candidateSets);
  const baselineToSemanticCandidates = compareMaps(baseline.candidateSets, semanticMutation.candidateSets);
  const candidateChangeByPass = (changed) => Object.fromEntries(["label-free", "first", "feedback"].map((pass) => [pass, changed.filter((key) => key.startsWith(`${pass}:`))]));
  const downstreamCandidateChangesByPass = candidateChangeByPass(baselineToDownstreamCandidates);
  const semanticCandidateChangesByPass = candidateChangeByPass(baselineToSemanticCandidates);
  return {
    fixture: name,
    graph: { nodes: baseline.graph.nodes.length, edges: baseline.graph.edges.length },
    baseline: { metrics: baseline.metrics, candidateSets: Object.keys(baseline.candidateSets).length, candidateCount: baseline.candidateCount, decisionCounts: baseline.decisionCounts, elapsedMs: baseline.elapsedMs, cacheStats: baseline.cacheStats },
    exactRepeat: { metrics: exactRepeat.metrics, elapsedMs: exactRepeat.elapsedMs, cacheStats: exactRepeat.cacheStats, exactRouteOutput: compareMaps(baseline.routeSignatures, exactRepeat.routeSignatures).length === 0, exactRelationLabelOutput: compareMaps(baseline.relationLabelSignatures, exactRepeat.relationLabelSignatures).length === 0, exactNodeLabelOutput: compareMaps(baseline.nodeLabelSignatures, exactRepeat.nodeLabelSignatures).length === 0, exactFeedback: baseline.metrics.feedbackApplied === exactRepeat.metrics.feedbackApplied },
    uncachedRepeat: { elapsedMs: uncachedRepeat.elapsedMs, metrics: uncachedRepeat.metrics, exactRouteOutput: compareMaps(baseline.routeSignatures, uncachedRepeat.routeSignatures).length === 0, exactRelationLabelOutput: compareMaps(baseline.relationLabelSignatures, uncachedRepeat.relationLabelSignatures).length === 0, exactNodeLabelOutput: compareMaps(baseline.nodeLabelSignatures, uncachedRepeat.nodeLabelSignatures).length === 0, exactFeedback: baseline.metrics.feedbackApplied === uncachedRepeat.metrics.feedbackApplied },
    sameRouteInputDifferentDownstreamState: {
      changedDownstreamRelationLabelIds: compareMaps(baseline.relationLabelSignatures, downstreamOnly.relationLabelSignatures),
      changedRoutes: compareMaps(baseline.routeSignatures, downstreamOnly.routeSignatures),
      changedNodeLabels: compareMaps(baseline.nodeLabelSignatures, downstreamOnly.nodeLabelSignatures),
      candidateSetsChanged: baselineToDownstreamCandidates,
      candidateSetsChangedByPass: downstreamCandidateChangesByPass,
      candidateSetsReusableByPass: Object.fromEntries(Object.entries(downstreamCandidateChangesByPass).map(([pass, changed]) => [pass, changed.length === 0])),
      downstreamMetrics: downstreamOnly.metrics,
      elapsedMs: downstreamOnly.elapsedMs,
      cacheStats: downstreamOnly.cacheStats,
      exactUncachedRouteOutput: compareMaps(downstreamOnly.routeSignatures, downstreamUncached.routeSignatures).length === 0,
      exactUncachedRelationLabelOutput: compareMaps(downstreamOnly.relationLabelSignatures, downstreamUncached.relationLabelSignatures).length === 0,
      exactUncachedNodeLabelOutput: compareMaps(downstreamOnly.nodeLabelSignatures, downstreamUncached.nodeLabelSignatures).length === 0,
      exactUncachedFeedback: downstreamOnly.metrics.feedbackApplied === downstreamUncached.metrics.feedbackApplied,
    },
    changedSemanticGeometry: {
      changedNodeId: semanticNodeId,
      changedRoutes: compareMaps(baseline.routeSignatures, semanticMutation.routeSignatures),
      candidateSetsInvalidated: baselineToSemanticCandidates,
      candidateSetsInvalidatedByPass: semanticCandidateChangesByPass,
      candidateSetsChangedCount: baselineToSemanticCandidates.length,
      semanticMetrics: semanticMutation.metrics,
      elapsedMs: semanticMutation.elapsedMs,
      cacheStats: semanticMutation.cacheStats,
      exactUncachedRouteOutput: compareMaps(semanticMutation.routeSignatures, semanticUncached.routeSignatures).length === 0,
      exactUncachedRelationLabelOutput: compareMaps(semanticMutation.relationLabelSignatures, semanticUncached.relationLabelSignatures).length === 0,
      exactUncachedNodeLabelOutput: compareMaps(semanticMutation.nodeLabelSignatures, semanticUncached.nodeLabelSignatures).length === 0,
      exactUncachedFeedback: semanticMutation.metrics.feedbackApplied === semanticUncached.metrics.feedbackApplied,
    },
    workObservation: {
      candidateSetsGeneratedPerPresentation: { baseline: baseline.candidateCount, uncachedRepeat: uncachedRepeat.candidateCount, exactRepeat: exactRepeat.candidateCount, downstreamOnly: downstreamOnly.candidateCount, semanticMutation: semanticMutation.candidateCount },
      uncachedRepeatElapsedMs: uncachedRepeat.elapsedMs,
      cachedRepeatElapsedMs: exactRepeat.elapsedMs,
      observedElapsedReductionMs: Number((uncachedRepeat.elapsedMs - exactRepeat.elapsedMs).toFixed(3)),
      observedElapsedReductionPercent: Number(((uncachedRepeat.elapsedMs - exactRepeat.elapsedMs) / Math.max(0.001, uncachedRepeat.elapsedMs) * 100).toFixed(1)),
      arbitrationDecisionsPerPresentation: { baseline: baseline.decisionCounts, downstreamOnly: downstreamOnly.decisionCounts, semanticMutation: semanticMutation.decisionCounts },
      safeReuseOpportunity: Object.entries(downstreamCandidateChangesByPass).filter(([, changed]) => changed.length === 0).map(([pass]) => pass),
      invalidationRule: baselineToSemanticCandidates.length > 0 ? "relevant geometry mutation invalidates candidate sets" : "not observed in this fixture",
    },
  };
}

const results = [
  runFixture("Apollo 11", apolloFixture, apolloPositions),
  runFixture("Regional Care", regionalFixture, regionalPositions),
];
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-STAGE-BOUNDARY-CANDIDATE-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  productSourceChanged: false,
  productAdoption: false,
  method: "Current route authority is invoked unchanged. Candidate diagnostics are fingerprinted as an observation; downstream-only manual Relation-label state is varied separately from semantic route inputs.",
  results,
  classification: "C_CANDIDATE_SEAM_EXISTS_ARBITRATION_REMAINS_AUTHORITATIVE",
  state: { governedEvidenceChanged: false, historicalEvidenceChanged: false, publication: false },
}, null, 2));
