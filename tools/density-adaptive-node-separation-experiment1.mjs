import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import { compareAutomaticLayoutProposals, isAutomaticLayoutPresentationEligible } from "../src/automatic-layout-selection.ts";
import { generateFrontierCandidateSet } from "../src/frontier-candidate-generator.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG } from "../experimental/frontier-product-worker-execution-proof1/core.ts";
import { buildPresentationSnapshot, evaluateProductPresentation, positionsFingerprint } from "../experimental/pinned-frontier-feasibility1/core.ts";
import { deriveDensityProfile, generateSeparatedPositions } from "../experimental/density-adaptive-node-separation-experiment1/core.ts";
import { bipartite, labelHeavyJa, parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

const root = process.cwd();
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const outputDirectory = path.join(root, "experimental", "density-adaptive-node-separation-experiment1");

function syntheticDense() {
  return bipartite(7, 7);
}

function workerGraph(dataset) {
  const graph = buildEntityGraph(dataset);
  return { nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map((edge) => ({ ...edge, label: edge.id })) };
}

function globalScale(positions, scale, yScale) {
  const points = Object.values(positions);
  const center = { x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length), y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length) };
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * yScale }]));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pinCases(ids, baseline) {
  const anchor = (id, source) => ({ x: baseline[id].x + 180, y: baseline[id].y + 64, source });
  const first = ids[0]; const middle = ids[Math.floor(ids.length / 2)];
  return [
    { name: "no-pins", anchors: {} },
    { name: "one-saved", anchors: { [first]: anchor(first, "saved") } },
    { name: "few-mixed", anchors: { [first]: anchor(first, "saved"), [middle]: anchor(middle, "staged") } },
    { name: "many-mixed", anchors: Object.fromEntries(ids.slice(0, Math.max(1, ids.length - 2)).map((id, index) => [id, anchor(id, index % 2 ? "staged" : "saved")])) },
    { name: "one-movable", anchors: Object.fromEntries(ids.slice(0, -1).map((id, index) => [id, anchor(id, index % 2 ? "staged" : "saved")])) },
    { name: "all-pinned", anchors: Object.fromEntries(ids.map((id, index) => [id, anchor(id, index % 2 ? "staged" : "saved")])) },
  ];
}

function evaluatePolicy(graph, baseCandidates, snapshot, comparisonSnapshot, anchors, policy) {
  const generationStarted = performance.now();
  const generatedCandidates = baseCandidates.map((candidate) => {
    const generated = generateSeparatedPositions(graph, candidate.positions, anchors, policy);
    return { candidate, generated };
  });
  const candidateGenerationMs = performance.now() - generationStarted;
  const productStarted = performance.now();
  const proposals = generatedCandidates.map(({ candidate, generated }, index) => {
    const evaluated = evaluateProductPresentation(graph, generated.positions, snapshot);
    const comparison = evaluateProductPresentation(graph, generated.positions, comparisonSnapshot);
    return {
      candidateIndex: index,
      family: `${policy}-${index + 1}-${candidate.family}`,
      positions: generated.positions,
      density: generated.density,
      fixedAnchorsPreserved: generated.fixedAnchorsPreserved,
      metrics: evaluated.metrics,
      comparisonMetrics: comparison.metrics,
      eligible: isAutomaticLayoutPresentationEligible(evaluated.metrics),
    };
  }).sort(compareAutomaticLayoutProposals);
  const productEvaluationMs = performance.now() - productStarted;
  const selected = proposals[0] ?? null;
  const comparisonProposals = proposals.slice().sort((left, right) => compareAutomaticLayoutProposals(
    { eligible: isAutomaticLayoutPresentationEligible(left.comparisonMetrics), family: left.family, metrics: left.comparisonMetrics },
    { eligible: isAutomaticLayoutPresentationEligible(right.comparisonMetrics), family: right.family, metrics: right.comparisonMetrics },
  ));
  const comparisonSelected = comparisonProposals[0] ?? null;
  return { proposals, selected, comparisonSelected, candidateGenerationMs, productEvaluationMs, overallMs: candidateGenerationMs + productEvaluationMs };
}

function runFixture(fixture) {
  const graph = workerGraph(fixture.dataset);
  const acceptedBaseline = (() => {
    const input = { nodes: graph.nodes.map(({ id }) => ({ id })), edges: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) };
    const candidateSet = generateFrontierCandidateSet(input);
    if (candidateSet.status !== "completed") throw new Error(`${fixture.id}: current Frontier generator failed`);
    return candidateSet;
  })();
  const acceptedProduct = computeFrontierProductProposals(graph, DEFAULT_FRONTIER_WORKER_CONFIG);
  if (!acceptedProduct.selected) throw new Error(`${fixture.id}: current Frontier/Product baseline did not select a result`);
  const acceptedPositions = acceptedProduct.selected.positions;
  const snapshot = buildPresentationSnapshot(graph, acceptedPositions);
  const emptySnapshot = { edgeCurveOffsets: {}, selfLoopOverrides: {}, previousNodeLabelPlacements: {}, previousRelationLabelPlacements: {}, manualNodeLabelOffsets: {}, manualRelationLabelAnchors: {}, previousAutomaticRoutes: {} };
  const ids = graph.nodes.map(({ id }) => id).sort();
  const cases = [];
  for (const pinCase of pinCases(ids, acceptedPositions)) {
    const anchors = pinCase.anchors;
    const baseCandidates = acceptedBaseline.representatives.map((candidate) => ({ ...candidate, positions: globalScale(candidate.positions, 0.88, 1.12) }));
    const policies = {};
    for (const policy of ["current-fixed", "larger-fixed", "density-adaptive"]) {
      const started = performance.now();
      const result = evaluatePolicy(graph, baseCandidates, snapshot, emptySnapshot, anchors, policy);
      const elapsedMs = performance.now() - started;
      policies[policy] = {
        selected: result.selected ? { family: result.selected.family, fingerprint: positionsFingerprint(result.selected.positions), metrics: result.selected.metrics, density: result.selected.density, eligible: result.selected.eligible, fixedAnchorsPreserved: result.selected.fixedAnchorsPreserved } : null,
        cleanProductSelected: result.comparisonSelected ? { family: result.comparisonSelected.family, fingerprint: positionsFingerprint(result.comparisonSelected.positions), metrics: result.comparisonSelected.comparisonMetrics, eligible: isAutomaticLayoutPresentationEligible(result.comparisonSelected.comparisonMetrics) } : null,
        candidateCount: result.proposals.length,
        allAnchorsPreserved: result.proposals.every(({ fixedAnchorsPreserved }) => fixedAnchorsPreserved),
        candidateGenerationMs: Math.round(result.candidateGenerationMs * 1000) / 1000,
        productEvaluationMs: Math.round(result.productEvaluationMs * 1000) / 1000,
        runtimeMs: Math.round(elapsedMs * 1000) / 1000,
      };
    }
    const current = policies["current-fixed"].selected;
    const adaptive = policies["density-adaptive"].selected;
    const cleanCurrent = policies["current-fixed"].cleanProductSelected;
    const cleanAdaptive = policies["density-adaptive"].cleanProductSelected;
    cases.push({
      pinCase: pinCase.name,
      fixedAnchorCount: Object.keys(anchors).length,
      movableNodeCount: ids.length - Object.keys(anchors).length,
      anchorSources: Object.fromEntries(Object.entries(anchors).map(([id, value]) => [id, value.source])),
      policies,
      adaptiveVsCurrent: adaptive && current ? { scoreDelta: adaptive.metrics.score - current.metrics.score, crossingDelta: adaptive.metrics.crossings - current.metrics.crossings, labelRouteHitDelta: adaptive.metrics.labelRouteHits - current.metrics.labelRouteHits, labelNear20Delta: adaptive.metrics.labelNear20 - current.metrics.labelNear20, extentDelta: [adaptive.metrics.extent[0] - current.metrics.extent[0], adaptive.metrics.extent[1] - current.metrics.extent[1]], fitScaleDelta: adaptive.metrics.fitScale - current.metrics.fitScale } : null,
      cleanProductAdaptiveVsCurrent: cleanAdaptive && cleanCurrent ? { scoreDelta: cleanAdaptive.metrics.score - cleanCurrent.metrics.score, crossingDelta: cleanAdaptive.metrics.crossings - cleanCurrent.metrics.crossings, labelRouteHitDelta: cleanAdaptive.metrics.labelRouteHits - cleanCurrent.metrics.labelRouteHits, labelNear20Delta: cleanAdaptive.metrics.labelNear20 - cleanCurrent.metrics.labelNear20, extentDelta: [cleanAdaptive.metrics.extent[0] - cleanCurrent.metrics.extent[0], cleanAdaptive.metrics.extent[1] - cleanCurrent.metrics.extent[1]], fitScaleDelta: cleanAdaptive.metrics.fitScale - cleanCurrent.metrics.fitScale } : null,
    });
  }
  return {
    fixture: fixture.id,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length, selfLoops: graph.edges.filter((edge) => edge.sourceId === edge.targetId).length, parallelEdges: graph.edges.filter((edge) => edge.parallelCount > 1).length },
    baseDensity: deriveDensityProfile(graph, acceptedPositions),
    snapshot: { nonEmpty: Object.values(snapshot).some((value) => Object.keys(value).length > 0), fingerprint: digest(snapshot), fields: Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Object.keys(value).length])) },
    cases,
  };
}

const fixtures = [
  { id: "lighthouse-en", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")) },
  { id: "apollo-11-en", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "apollo-11-mission.en.e2r.json"), "utf8")) },
  { id: "label-heavy-ja-10", dataset: labelHeavyJa() },
  { id: "dense-k7-7", dataset: syntheticDense() },
  { id: "parallel-self-loop-control", dataset: parallelSelfLoop() },
];

const rows = fixtures.map(runFixture);
const comparisons = rows.flatMap((row) => row.cases.filter((item) => item.movableNodeCount > 0).map((item) => ({ fixture: row.fixture, pinCase: item.pinCase, delta: item.adaptiveVsCurrent, cleanDelta: item.cleanProductAdaptiveVsCurrent }))).filter(({ delta }) => delta !== null && delta !== undefined);
const cleanComparisons = comparisons.filter(({ cleanDelta }) => cleanDelta !== null && cleanDelta !== undefined);
const artifact = {
  contract: "E2R-LIAISONSCAPE-DENSITY-ADAPTIVE-NODE-SEPARATION-EXPERIMENT1",
  diagnosticOnly: true,
  sourceRevision: `${sourceRevision} + working-tree diagnostic additions`,
  classification: "C. MIXED / SPACING HELPS SOME PRESENTATION PRESSURE BUT DOES NOT CLOSE THE MAIN QUALITY GAP",
  objective: "Compare current fixed, larger fixed, and density-adaptive Graph-space separation through the existing Product presentation evaluator without changing viewport policy or production behavior.",
  densityDefinition: "graphDensity = E / (N * (N - 1) / 2); node pressure = 0.55 normalized non-self degree + 0.45 normalized nearby-node count within 260 Graph-space units; target gap = 150 + 150 * pressure",
  policies: {
    "current-fixed": "current Frontier candidate geometry after existing .88 / 1.12 anisotropic diagnostic spacing; anchors are installed before evaluation and held fixed",
    "larger-fixed": "bounded 1.18 Graph-space radial expansion control; anchors remain fixed",
    "density-adaptive": "per-node pressure-derived target gaps with bounded local repulsion iterations; no global translation/scale after anchors are installed",
  },
  viewportBoundary: "Graph extents and fitScale are reported as diagnostics only; fitGraphView, zoom, pan, and initial framing are not modified or used as hard quality gates.",
  productBoundary: "All policies use the current Product route, Relation-label, Node-label, Self-loop, previous-route, and manual presentation snapshot evaluator. Pinning Node coordinates does not pin connected Edge geometry.",
  rows,
  aggregate: {
    nonAllPinnedComparisons: comparisons.length,
    adaptiveScoreImproved: comparisons.filter(({ delta }) => delta.scoreDelta < 0).length,
    adaptiveScoreWorsened: comparisons.filter(({ delta }) => delta.scoreDelta > 0).length,
    adaptiveCrossingsReduced: comparisons.filter(({ delta }) => delta.crossingDelta < 0).length,
    adaptiveCrossingsIncreased: comparisons.filter(({ delta }) => delta.crossingDelta > 0).length,
    adaptiveLabelNear20Reduced: comparisons.filter(({ delta }) => delta.labelNear20Delta < 0).length,
    adaptiveLabelNear20Increased: comparisons.filter(({ delta }) => delta.labelNear20Delta > 0).length,
    cleanProductAdaptiveScoreImproved: cleanComparisons.filter(({ cleanDelta }) => cleanDelta.scoreDelta < 0).length,
    cleanProductAdaptiveScoreWorsened: cleanComparisons.filter(({ cleanDelta }) => cleanDelta.scoreDelta > 0).length,
    cleanProductAdaptiveCrossingsReduced: cleanComparisons.filter(({ cleanDelta }) => cleanDelta.crossingDelta < 0).length,
    cleanProductAdaptiveCrossingsIncreased: cleanComparisons.filter(({ cleanDelta }) => cleanDelta.crossingDelta > 0).length,
    denseCrossingFreeAdaptiveCases: rows.filter((row) => row.fixture === "dense-k7-7").flatMap((row) => row.cases).filter((item) => item.movableNodeCount > 0 && item.policies["density-adaptive"].selected.metrics.crossings === 0).length,
    allPolicyCandidatesPreservedAnchors: rows.every((row) => row.cases.every((item) => Object.values(item.policies).every((policy) => policy.allAnchorsPreserved))),
  },
  noProductionBehaviorChange: true,
  humanReview: "not started or reopened",
  nextDecision: "interpret per-policy deltas; do not promote a policy without moderate-case quality and dense graceful-degradation evidence",
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ contract: artifact.contract, sourceRevision: artifact.sourceRevision, fixtures: rows.map((row) => ({ fixture: row.fixture, density: row.baseDensity.graphDensity, cases: row.cases.length })), output: path.relative(root, path.join(outputDirectory, "result-summary.json")) }, null, 2));
