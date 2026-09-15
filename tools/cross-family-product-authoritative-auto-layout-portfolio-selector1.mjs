import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { placeNodeLabel } from "../src/viewport.ts";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "cross-family-product-authoritative-auto-layout-portfolio-selector1");
const comparisonArtifact = JSON.parse(fs.readFileSync(path.join(root, "experimental", "frontier-g3-post-current-source-comparison1", "result-summary.json"), "utf8"));
const freeFormArtifact = JSON.parse(fs.readFileSync(path.join(root, "experimental", "topology-aware-free-form-crossing-experiment1", "result-summary.json"), "utf8"));
const SELECTOR_TOP_K = 2;

function bipartite(leftSize, rightSize) {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}

function labelHeavyJa() {
  const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`);
  return { version: "1.0", entities: ids.map((id, index) => ({ id, name: `日本語 長いノードラベル ${index} 障害対応確認`, description: "長い説明文を含む日本語の表示確認用ノード" })), events: [], relations: Array.from({ length: 20 }, (_, index) => ({ id: `label-r${index}`, sourceId: ids[index % ids.length], targetId: ids[(index * 3 + 1) % ids.length], name: `長い日本語Relationラベル ${index} の表示と所有関係を確認する` })) };
}

const fixtures = [
  { id: "lighthouse-en", locale: "en", source: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json" },
  { id: "lighthouse-ja", locale: "ja", source: "../e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json" },
  { id: "apollo-en", locale: "en", source: "../e2r-spec/examples/apollo-11-mission.en.e2r.json" },
  { id: "apollo-ja", locale: "ja", source: "../e2r-spec/examples/apollo-11-mission.ja.e2r.json" },
  { id: "titanic-en", locale: "en", source: "../e2r-spec/examples/titanic-final-voyage.en.e2r.json" },
  { id: "label-heavy-ja-10", locale: "ja", source: "synthetic:label-heavy-ja-10" },
  { id: "dense-k7-7", locale: "en", source: "synthetic:k7-7" },
];

function loadFixture(fixture) {
  if (fixture.source === "synthetic:label-heavy-ja-10") return labelHeavyJa();
  if (fixture.source === "synthetic:k7-7") return bipartite(7, 7);
  return JSON.parse(fs.readFileSync(path.resolve(root, fixture.source), "utf8"));
}

function fingerprint(positions) {
  return createHash("sha256").update(JSON.stringify(Object.entries(positions).sort(([left], [right]) => left.localeCompare(right)))).digest("hex").slice(0, 12);
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }

function compactMetrics(metrics) {
  return Object.fromEntries(["score", "crossings", "overlapPairs", "minimumSeparation", "extent", "fitScale", "labelRouteHits", "labelNear20", "labelOverlap", "labelCorridorDeficit", "routeMedian", "routeMax"].filter((key) => key in metrics).map((key) => [key, metrics[key]]));
}

function orientation(first, second, third) { return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x); }
function straightCrosses(first, second, third, fourth) { const firstTurn = orientation(first, second, third); const secondTurn = orientation(first, second, fourth); const thirdTurn = orientation(third, fourth, first); const fourthTurn = orientation(third, fourth, second); return firstTurn * secondTurn < -1e-7 && thirdTurn * fourthTurn < -1e-7; }

function cheapFeatures(nodes, edges, positions) {
  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]; const second = edges[right];
    if (new Set([first.sourceId, first.targetId, second.sourceId, second.targetId]).size < 4) continue;
    if (straightCrosses(positions[first.sourceId], positions[first.targetId], positions[second.sourceId], positions[second.targetId])) crossings += 1;
  }
  let overlapPairs = 0; let minimumSeparation = Infinity;
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    const first = positions[nodes[left].id]; const second = positions[nodes[right].id];
    const separation = Math.hypot(first.x - second.x, first.y - second.y);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (Math.abs(first.x - second.x) < 140 && Math.abs(first.y - second.y) < 140) overlapPairs += 1;
  }
  const x = Object.values(positions).map((point) => point.x); const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const aspect = Math.max(extent[0], extent[1]) / Math.max(1, Math.min(extent[0], extent[1]));
  const pathologicalExtent = Math.max(...extent) > 2400 || aspect > 7;
  return { crossings, overlapPairs, minimumSeparation, extent, aspect, pathologicalExtent, score: crossings * 1_000_000 + overlapPairs * 10_000_000 + Math.max(0, 140 - minimumSeparation) * 1_000 };
}

function evaluate(graph, edges, positions) {
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), []));
  const presentation = deriveBoundedAutomaticPresentation({ graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  return deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges, positions, presentation });
}

function productComparator(left, right) {
  return left.metrics.crossings - right.metrics.crossings
    || left.metrics.overlapPairs - right.metrics.overlapPairs
    || left.metrics.labelRouteHits - right.metrics.labelRouteHits
    || left.metrics.labelNear20 - right.metrics.labelNear20
    || left.metrics.labelOverlap - right.metrics.labelOverlap
    || left.metrics.labelCorridorDeficit - right.metrics.labelCorridorDeficit
    || left.metrics.score - right.metrics.score
    || left.family.localeCompare(right.family);
}

function cheapComparator(left, right) {
  return left.cheap.crossings - right.cheap.crossings
    || left.cheap.overlapPairs - right.cheap.overlapPairs
    || right.cheap.minimumSeparation - left.cheap.minimumSeparation
    || Number(left.cheap.pathologicalExtent) - Number(right.cheap.pathologicalExtent)
    || left.family.localeCompare(right.family);
}

function hardGate(candidate, baseline) {
  const failures = [];
  if (candidate.metrics.overlapPairs > 0) failures.push("node-body-overlap");
  if (candidate.cheap.pathologicalExtent) failures.push("pathological-extent");
  if (baseline.metrics.crossings === 0 && candidate.metrics.crossings > 0) failures.push("baseline-zero-crossing-regression");
  if (!Object.values(candidate.positions).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) failures.push("non-finite-geometry");
  return { admitted: failures.length === 0, failures };
}

function materializeFamily(row, family) {
  const fixtureId = row.id ?? row.fixture;
  if (family === "free-form") {
    const freeRow = freeFormArtifact.rows.find(({ fixture }) => fixture === fixtureId);
    return { family, lineage: "topology-aware-free-form-experiment1", source: "persisted lineage artifact; ranking metrics freshly recomputed from current source", positions: freeRow.selected.positions, persistedMetrics: freeRow.selected.metrics };
  }
  const candidate = comparisonArtifact.rows.find(({ fixture }) => fixture === fixtureId)?.candidates[family];
  return { family, lineage: family === "frontier" ? "frontier-12" : "post", source: "persisted lineage artifact; ranking metrics freshly recomputed from current source", positions: candidate.positions, persistedMetrics: candidate.selectedMetrics };
}

function parityDiff(actual, persisted) {
  if (!persisted) return null;
  const fields = ["crossings", "overlapPairs", "labelRouteHits", "labelNear20", "labelOverlap"];
  return fields.filter((field) => actual[field] !== persisted[field]);
}

const startedAt = performance.now();
const rows = fixtures.map((fixture) => {
  const dataset = loadFixture(fixture); const graph = buildEntityGraph(dataset); const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const materialized = ["frontier", "post", "free-form"].map((family) => materializeFamily(fixture, family)).map((candidate) => ({ ...candidate, fingerprint: fingerprint(candidate.positions), cheap: cheapFeatures(graph.nodes, edges, candidate.positions) }));
  const byFingerprint = new Map();
  for (const candidate of materialized) if (!byFingerprint.has(candidate.fingerprint)) byFingerprint.set(candidate.fingerprint, candidate);
  const uniqueCandidates = [...byFingerprint.values()];
  const evaluated = uniqueCandidates.map((candidate) => ({ ...candidate, metrics: evaluate(graph, edges, candidate.positions), evaluation: "full Product-authoritative presentation" }));
  for (const candidate of evaluated) candidate.parityDiff = parityDiff(candidate.metrics, candidate.persistedMetrics);
  const baseline = evaluated.find((candidate) => candidate.family === "frontier");
  const gated = evaluated.map((candidate) => ({ ...candidate, hardGate: hardGate(candidate, baseline) }));
  const admitted = gated.filter((candidate) => candidate.hardGate.admitted);
  const oracle = admitted.slice().sort(productComparator)[0] ?? baseline;
  const cheapRanked = admitted.slice().sort(cheapComparator);
  const selectorFinalists = cheapRanked.slice(0, Math.min(SELECTOR_TOP_K, cheapRanked.length));
  const selectorWinner = selectorFinalists.slice().sort(productComparator)[0] ?? null;
  const regret = selectorWinner && oracle ? selectorWinner.metrics.score - oracle.metrics.score : null;
  const exactBest = Boolean(selectorWinner && oracle && selectorWinner.fingerprint === oracle.fingerprint);
  const meaningfulEquivalent = Boolean(selectorWinner && oracle && !exactBest && selectorWinner.metrics.crossings === oracle.metrics.crossings && selectorWinner.metrics.overlapPairs === oracle.metrics.overlapPairs && selectorWinner.metrics.labelRouteHits === oracle.metrics.labelRouteHits && selectorWinner.metrics.labelNear20 === oracle.metrics.labelNear20 && Math.abs(regret) <= 2000);
  return {
    fixture: fixture.id,
    locale: fixture.locale,
    source: fixture.source,
    graph: { nodes: graph.nodes.length, edges: edges.length },
    candidateMaterializationCount: materialized.length,
    uniqueGeometryCount: uniqueCandidates.length,
    duplicateGeometryReuseCount: materialized.length - uniqueCandidates.length,
    candidates: gated.map((candidate) => ({ family: candidate.family, lineage: candidate.lineage, fingerprint: candidate.fingerprint, cheap: candidate.cheap, hardGate: candidate.hardGate, metrics: compactMetrics(candidate.metrics), persistedMetricParityDiff: candidate.parityDiff })),
    oracle: { family: oracle?.family ?? null, fingerprint: oracle?.fingerprint ?? null, productEvaluationCount: admitted.length, ranking: "hard gates, then crossings -> overlap -> label-route hits -> label-near -> label overlap -> corridor deficit -> score" },
    selector: { topK: SELECTOR_TOP_K, cheapRanking: cheapRanked.map((candidate) => candidate.family), finalists: selectorFinalists.map((candidate) => candidate.family), family: selectorWinner?.family ?? null, fingerprint: selectorWinner?.fingerprint ?? null, productEvaluationCount: selectorFinalists.length, exactBest, meaningfulEquivalent, regret, admittedFamilyCount: admitted.length },
    selectionCost: { oracleProductEvaluations: admitted.length, selectorProductEvaluations: selectorFinalists.length, avoidedProductEvaluations: Math.max(0, admitted.length - selectorFinalists.length), candidateGeneration: "reused completed current-source family artifacts; no new solver generation" },
  };
});

const exactBestRows = rows.filter((row) => row.selector.exactBest);
const meaningfulRows = rows.filter((row) => row.selector.exactBest || row.selector.meaningfulEquivalent);
const rejectedFreeFormRows = rows.filter((row) => row.candidates.find((candidate) => candidate.family === "free-form")?.hardGate.admitted === false);
const allParity = rows.flatMap((row) => row.candidates.map((candidate) => candidate.persistedMetricParityDiff ?? []));
const artifact = {
  contract: "LIAISONSCAPE-CROSS-FAMILY-PRODUCT-AUTHORITATIVE-AUTO-LAYOUT-PORTFOLIO-SELECTOR-EXPERIMENT-1",
  diagnosticOnly: true,
  candidateFamilies: ["frontier", "post", "topology-aware-free-form-experiment1"],
  candidateSource: "completed current-source artifacts; no historical replay, new solver, or Product authority change",
  parityInterpretation: "Persisted family summaries are lineage references only. Every candidate used for gating and ranking was freshly evaluated through the current Product-authoritative presentation/quality path; any persisted-field mismatch is recorded per candidate and is not silently inherited.",
  productAuthority: "current ordinary routing, Parallel/Incident allocation, endpoint-plan, final Relation-label, Node-label, Self-loop, viewport/camera, styling, Dataset, persistence, Save Coordinates, and manual placement",
  selectorArchitecture: { oracle: "full Product-authoritative evaluation of every hard-gate-admitted unique geometry", boundedSelector: "cheap geometry-only ranking, top-2 finalist Product evaluation, lexicographic Product ordering rather than one scalar", hardGates: ["node-body overlap", "pathological extent/aspect", "baseline zero-crossing regression", "non-finite geometry"], duplicateReuse: "fingerprint exact reuse before Product evaluation" },
  visualInspectionRequired: true,
  rows,
  aggregate: { fixtureCount: rows.length, exactBestCount: exactBestRows.length, meaningfulEquivalentCount: meaningfulRows.length, exactOrEquivalentRate: meaningfulRows.length / Math.max(1, rows.length), rejectedFreeFormCount: rejectedFreeFormRows.length, duplicateGeometryReuseCount: rows.reduce((sum, row) => sum + row.duplicateGeometryReuseCount, 0), oracleProductEvaluations: rows.reduce((sum, row) => sum + row.oracle.productEvaluationCount, 0), selectorProductEvaluations: rows.reduce((sum, row) => sum + row.selector.productEvaluationCount, 0), avoidedProductEvaluations: rows.reduce((sum, row) => sum + row.selectionCost.avoidedProductEvaluations, 0), metricParityMismatchCount: allParity.length },
  interpretationPending: true,
  readiness: { humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", adaptiveCascade: "INACTIVE", initialLayoutReleaseBlocker: "OPEN" },
  elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ aggregate: artifact.aggregate, rows: rows.map((row) => ({ fixture: row.fixture, oracle: row.oracle.family, selector: row.selector.family, exactBest: row.selector.exactBest, meaningfulEquivalent: row.selector.meaningfulEquivalent, regret: row.selector.regret, admitted: row.selector.admittedFamilyCount, selectorEvaluations: row.selector.productEvaluationCount })) }, null, 2));
