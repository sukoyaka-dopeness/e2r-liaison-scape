import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { createAutomaticPresentationProfiler, deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect, type Point } from "../src/viewport.ts";
import { denseBrowserFixtures, type DenseFixture } from "../experimental/product-node-label-recovery-dense-browser-feasibility1/fixtures.ts";

type Mode = "baseline" | "product-candidate";

function graphFor(fixture: DenseFixture) {
  const graph = buildEntityGraph(fixture.dataset as never);
  const labels = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name]));
  return { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? "" })) };
}

function provisionalLabels(graph: ReturnType<typeof graphFor>, positions: Record<string, Point>) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!,
    node.label,
    node.description,
    [],
    graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!),
    [],
  ));
}

function derive(fixture: DenseFixture, mode: Mode, previous: Map<string, LabelRect>, positions = fixture.positions) {
  const graph = graphFor(fixture);
  const profiler = createAutomaticPresentationProfiler();
  const startedAt = performance.now();
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(graph, positions),
    previousNodeLabelPlacements: previous,
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: true,
    profiler,
    nodeLabelRecoveryMode: mode === "product-candidate" ? "product-candidate" : undefined,
  });
  return { presentation, elapsedMs: performance.now() - startedAt, profiler };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function summarize(values: number[]) {
  return { medianMs: Number(median(values).toFixed(3)), maxMs: Number(Math.max(...values, 0).toFixed(3)), samples: values.map((value) => Number(value.toFixed(3))) };
}

function signature(presentation: BoundedAutomaticPresentation) {
  return JSON.stringify({ routes: presentation.routedEdges.map(({ id, samples }) => [id, samples]), relationLabels: [...presentation.relationLabels.entries()], nodeLabels: [...presentation.nodeLabels.entries()] });
}

function metrics(derived: ReturnType<typeof derive>) {
  const passes = Object.values(derived.profiler.passes);
  const nodeLabel = passes.reduce((sum, pass) => sum + pass.nodeLabelMs, 0);
  const routeProfileCounters = passes.reduce((sum, pass) => sum + pass.route.candidateComparisons + pass.route.occupiedPathPointComparisons + pass.route.safeCandidateChecks, 0);
  const relationLabel = passes.reduce((sum, pass) => sum + pass.relationLabelMs, 0);
  const recoveryComparison = passes.reduce((sum, pass) => sum + pass.nodeLabel.recoveryComparisonMs, 0);
  const candidateRows = passes.reduce((sum, pass) => sum + pass.nodeLabel.recoveryCandidateRows, 0);
  return { fullDeriveMs: derived.elapsedMs, routeProfileCounters, relationLabelMs: relationLabel, nodeLabelMs: nodeLabel, recoveryComparisonMs: recoveryComparison, recoveryCandidateRows: candidateRows, candidateEvaluations: passes.reduce((sum, pass) => sum + pass.nodeLabel.candidateEvaluations, 0) };
}

function runFixture(fixture: DenseFixture) {
  const cleanBaseline = derive(fixture, "baseline", new Map());
  const cleanCandidate = derive(fixture, "product-candidate", new Map());
  const settledPrevious = new Map(cleanCandidate.presentation.nodeLabels);
  const samples = (mode: Mode, previous: Map<string, LabelRect>) => Array.from({ length: 7 }, () => derive(fixture, mode, previous));
  const baselineSamples = samples("baseline", settledPrevious).slice(1);
  const candidateSamples = samples("product-candidate", settledPrevious).slice(1);
  const shifted = { ...fixture.positions, [fixture.dataset.entities[0]!.id]: { x: fixture.positions[fixture.dataset.entities[0]!.id]!.x + 68, y: fixture.positions[fixture.dataset.entities[0]!.id]!.y + 24 } };
  const recoveryBaseline = derive(fixture, "baseline", settledPrevious, shifted);
  const recoveryCandidate = derive(fixture, "product-candidate", settledPrevious, shifted);
  const recoveryFingerprints = [signature(recoveryCandidate.presentation)];
  let recoveryPrevious = new Map(recoveryCandidate.presentation.nodeLabels);
  for (let index = 0; index < 4; index += 1) {
    const next = derive(fixture, "product-candidate", recoveryPrevious, shifted);
    recoveryFingerprints.push(signature(next.presentation));
    recoveryPrevious = new Map(next.presentation.nodeLabels);
  }
  const baselineClean = signature(cleanBaseline.presentation);
  const candidateClean = signature(cleanCandidate.presentation);
  const baselineRecovery = signature(recoveryBaseline.presentation);
  const candidateRecovery = signature(recoveryCandidate.presentation);
  const parallelGroups = new Map<string, number>();
  for (const edge of graphFor(fixture).edges) if (edge.parallelCount > 1) parallelGroups.set(`${edge.sourceId}\u0000${edge.targetId}`, edge.parallelCount);
  return {
    fixture: fixture.id,
    family: fixture.family,
    locale: fixture.locale,
    graph: { nodes: fixture.dataset.entities.length, edges: fixture.dataset.relations.length },
    pressure: { parallelGroups: parallelGroups.size, maxParallelBundle: Math.max(...parallelGroups.values(), 0), selfLoops: fixture.dataset.relations.filter(({ sourceId, targetId }) => sourceId === targetId).length, nodeLabelChars: fixture.dataset.entities.reduce((sum, entity) => sum + entity.name.length + (entity.description?.length ?? 0), 0), relationLabelChars: fixture.dataset.relations.reduce((sum, relation) => sum + relation.name.length, 0) },
    exact: { cleanBaselineCandidateParity: baselineClean === candidateClean, recoveryChangesOutputAsExpected: baselineRecovery !== candidateRecovery, candidateRecoveryStableOnReuse: recoveryFingerprints.every((fingerprint) => fingerprint === recoveryFingerprints[0]), recoveryFingerprintCount: new Set(recoveryFingerprints).size, routeCount: cleanCandidate.presentation.routedEdges.length, relationLabelCount: cleanCandidate.presentation.relationLabels.size, nodeLabelCount: cleanCandidate.presentation.nodeLabels.size },
    clean: { baseline: metrics(cleanBaseline), candidate: metrics(cleanCandidate), fullDeriveDeltaMs: cleanCandidate.elapsedMs - cleanBaseline.elapsedMs },
    settled: { baseline: summarize(baselineSamples.map((sample) => sample.elapsedMs)), candidate: summarize(candidateSamples.map((sample) => sample.elapsedMs)), candidateNodeLabelMedianMs: Number(median(candidateSamples.map((sample) => metrics(sample).nodeLabelMs)).toFixed(3)), candidateRecoveryComparisonMedianMs: Number(median(candidateSamples.map((sample) => metrics(sample).recoveryComparisonMs)).toFixed(3)), candidateRows: metrics(candidateSamples[0]!).recoveryCandidateRows },
    recoveryTrigger: { baseline: metrics(recoveryBaseline), candidate: metrics(recoveryCandidate), outputDifference: baselineRecovery !== candidateRecovery },
  };
}

const rows = denseBrowserFixtures().map(runFixture);
const artifact = {
  contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-DENSE-BROWSER-FEASIBILITY-v1",
  diagnosticOnly: true,
  generatedAt: new Date().toISOString(),
  purpose: "Measure production-shaped Node-label recovery cost before browser-main-thread evidence; no Product default or provider adoption.",
  boundary: { recoverySemantics: "unchanged", movementCoefficient: "distance * 4", firstPass: "continuity-only", settledPass: "hard-safe or strict fresh non-movement gain", activeDrag: "recovery suppressed", ordinaryRouting: "unchanged", relationLabel: "unchanged", selfLoop: "unchanged" },
  campaign: { fixtureCount: rows.length, fixtureFamilies: [...new Set(rows.map((row) => row.family))], repeatedStableSamples: 6, browserEvidenceRequired: true, memoryStudy: "allocation counters only; not a heap profile" },
  rows,
  status: { browserNativeFeasibility: "NOT ESTABLISHED", productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN", adaptiveCascade: "NOT ENTERED" },
};
const outputPath = path.join(process.cwd(), "experimental", "product-node-label-recovery-dense-browser-feasibility1", "source-result-summary.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
