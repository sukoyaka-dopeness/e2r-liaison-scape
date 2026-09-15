import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveTopologyAwareFreeFormCandidates } from "../src/topology-aware-free-form-placement.ts";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "topology-aware-free-form-crossing-experiment1");
const priorArtifact = JSON.parse(fs.readFileSync(path.join(root, "experimental", "frontier-g3-post-current-source-comparison1", "result-summary.json"), "utf8"));

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

function compactMetrics(metrics) {
  return Object.fromEntries(["score", "crossings", "overlapPairs", "minimumSeparation", "extent", "fitScale", "labelRouteHits", "labelNear20", "labelOverlap", "labelCorridorDeficit", "routeMedian", "routeMax", "shortHopCount"].filter((key) => key in metrics).map((key) => [key, metrics[key]]));
}

function evaluate(graph, edges, positions) {
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: true,
  });
  return deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges, positions, presentation });
}

function candidateOrder(left, right) {
  const first = left.metrics;
  const second = right.metrics;
  return first.crossings - second.crossings
    || first.overlapPairs - second.overlapPairs
    || first.labelRouteHits - second.labelRouteHits
    || first.labelNear20 - second.labelNear20
    || first.labelOverlap - second.labelOverlap
    || first.score - second.score
    || left.cheapMetrics.score - right.cheapMetrics.score
    || left.family.localeCompare(right.family);
}

function referenceSummary(fixtureId, candidate) {
  const row = priorArtifact.rows.find(({ fixture }) => fixture === fixtureId);
  const source = row?.candidates[candidate];
  if (!source) return null;
  return { family: source.selectedFamily, fingerprint: source.selectedPositionFingerprint, elapsedMs: source.elapsedMs, candidateCount: source.candidateCount, evaluationCount: source.evaluationCount, presentationMs: source.presentationMs, metrics: compactMetrics(source.selectedMetrics) };
}

const startedAt = performance.now();
const rows = fixtures.map((fixture) => {
  const dataset = loadFixture(fixture);
  const graph = buildEntityGraph(dataset);
  const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const generationStarted = performance.now();
  const generated = deriveTopologyAwareFreeFormCandidates(graph.nodes, edges, 6);
  const generationMs = Math.round((performance.now() - generationStarted) * 100) / 100;
  const evaluationStarted = performance.now();
  const evaluated = generated.map((candidate) => {
    const evaluationStarted = performance.now();
    const metrics = evaluate(graph, edges, candidate.positions);
    return { ...candidate, metrics, evaluationMs: Math.round((performance.now() - evaluationStarted) * 100) / 100 };
  });
  const evaluationMs = Math.round((performance.now() - evaluationStarted) * 100) / 100;
  evaluated.sort(candidateOrder);
  const selected = evaluated[0];
  const secondRun = deriveTopologyAwareFreeFormCandidates(graph.nodes, edges, 6);
  const deterministic = JSON.stringify(generated.map(({ positions }) => positions)) === JSON.stringify(secondRun.map(({ positions }) => positions));
  return {
    fixture: fixture.id,
    locale: fixture.locale,
    source: fixture.source,
    graph: { nodes: graph.nodes.length, edges: edges.length },
    candidateCount: generated.length,
    productEvaluationCount: evaluated.length,
    generationMs,
    evaluationMs,
    elapsedMs: Math.round((generationMs + evaluationMs) * 100) / 100,
    deterministic,
    selected: {
      family: selected.family,
      fingerprint: fingerprint(selected.positions),
      seed: selected.seed,
      iterations: selected.iterations,
      topology: selected.topology,
      cheapMetrics: selected.cheapMetrics,
      metrics: compactMetrics(selected.metrics),
      evaluationMs: selected.evaluationMs,
      positions: selected.positions,
    },
    finalistSummaries: evaluated.map((candidate) => ({ family: candidate.family, fingerprint: fingerprint(candidate.positions), cheapMetrics: candidate.cheapMetrics, metrics: compactMetrics(candidate.metrics), evaluationMs: candidate.evaluationMs })),
    references: { frontier: referenceSummary(fixture.id, "frontier"), post: referenceSummary(fixture.id, "post") },
  };
});

const artifact = {
  contract: "LIAISONSCAPE-TOPOLOGY-AWARE-FREE-FORM-CROSSING-MINIMIZING-AUTO-LAYOUT-EXPERIMENT-1",
  diagnosticOnly: true,
  candidateIdentity: "bounded current-source topology-aware free-form BFS seed plus deterministic local continuous relaxation; no grid/circle finalization",
  topologyInputs: ["connected components", "degree/hub", "BFS layers", "bridge detection", "deterministic local neighborhood moves"],
  productAuthoritiesChanged: false,
  visualInspectionRequired: true,
  rows,
  interpretationPending: true,
  readiness: { humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" },
  elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, candidateCount, productEvaluationCount, generationMs, deterministic, selected, references }) => ({ fixture, candidateCount, productEvaluationCount, generationMs, deterministic, selected: { family: selected.family, fingerprint: selected.fingerprint, metrics: selected.metrics, topology: selected.topology }, references })), null, 2));
