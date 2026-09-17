import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG } from "../experimental/frontier-product-worker-execution-proof1/core.ts";
import { positionsFingerprint } from "../experimental/pinned-frontier-feasibility1/core.ts";
import { buildPortfolioCandidates, createNonEmptySnapshot, emptySnapshot, evaluatePortfolioWithAnchors } from "../experimental/pinned-cross-family-product-portfolio-experiment1/core.ts";
import { bipartite, labelHeavyJa, parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "pinned-cross-family-product-portfolio-experiment1");
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const compact = (metrics) => Object.fromEntries(["score", "crossings", "overlapPairs", "minimumSeparation", "extent", "aspect", "fitScale", "routeMedian", "routeMax", "labelRouteHits", "labelNear20", "labelOverlap", "labelCorridorDeficit", "shortHopCount", "feedbackApplied"].filter((key) => key in metrics).map((key) => [key, metrics[key]]));

const fixtures = [
  { id: "lighthouse-en", locale: "en", source: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")) },
  { id: "apollo-11-en", locale: "en", source: "../e2r-spec/examples/apollo-11-mission.en.e2r.json", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "apollo-11-mission.en.e2r.json"), "utf8")) },
  { id: "label-heavy-ja-10", locale: "ja", source: "synthetic:label-heavy-ja-10", dataset: labelHeavyJa() },
  { id: "dense-k7x7-bipartite", locale: "en", source: "synthetic:bipartite(7,7); historical alias dense-k7-7", dataset: bipartite(7, 7) },
  { id: "parallel-self-loop-control", locale: "en", source: "synthetic:parallelSelfLoop()", dataset: parallelSelfLoop() },
];

const graphFor = (dataset) => { const graph = buildEntityGraph(dataset); return { nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? edge.id })) }; };
const pinCases = (graph, baseline) => {
  const ids = graph.nodes.map(({ id }) => id).sort();
  const anchor = (id, source) => ({ x: baseline[id].x + 180, y: baseline[id].y + 64, source });
  const first = ids[0]; const middle = ids[Math.floor(ids.length / 2)];
  return [
    { id: "no-pins", anchors: {} },
    { id: "one-saved", anchors: { [first]: anchor(first, "saved") } },
    { id: "few-mixed", anchors: { [first]: anchor(first, "saved"), [middle]: anchor(middle, "staged") } },
    { id: "all-pinned", anchors: Object.fromEntries(ids.map((id, index) => [id, anchor(id, index % 2 ? "staged" : "saved")])) },
  ];
};
const run = (fixture) => {
  const graph = graphFor(fixture.dataset);
  const baseline = computeFrontierProductProposals(graph, DEFAULT_FRONTIER_WORKER_CONFIG);
  if (!baseline.selected) throw new Error(`${fixture.id}: baseline selection failed`);
  const snapshot = createNonEmptySnapshot(graph, baseline.selected.positions);
  const rows = pinCases(graph, baseline.selected.positions).map((pinCase) => {
    const generatedAt = performance.now();
    const generated = buildPortfolioCandidates(graph, pinCase.anchors, { frontierLimit: 4, freeFormLimit: 4, adaptiveRounds: 10 });
    const generationMs = performance.now() - generatedAt;
    if (generated.status !== "completed") throw new Error(`${fixture.id}/${pinCase.id}: ${generated.failure.message}`);
    const evaluatedAt = performance.now();
    const selected = evaluatePortfolioWithAnchors(graph, generated.candidates, pinCase.anchors, snapshot, { finalCanonicalization: "round-once" });
    const productEvaluationMs = performance.now() - evaluatedAt;
    const perFamily = Object.fromEntries(["pinned-frontier", "density-adaptive", "topology-aware-free-form"].map((family) => {
      const familyCandidates = selected.proposals.filter((candidate) => candidate.family === family);
      const winner = familyCandidates[0] ?? null;
      return [family, { candidateCount: familyCandidates.length, candidateIdentities: familyCandidates.map(({ identity }) => identity), winner: winner ? { identity: winner.identity, fingerprint: positionsFingerprint(winner.positions), metrics: compact(winner.metrics), eligible: winner.eligible } : null, allAnchorsPreserved: familyCandidates.every((candidate) => candidate.anchorsPreserved) }];
    }));
    const portfolio = selected.selected;
    const bestSingle = perFamily["pinned-frontier"].winner;
    return { pinCase: pinCase.id, fixedAnchorCount: Object.keys(pinCase.anchors).length, movableNodeCount: graph.nodes.length - Object.keys(pinCase.anchors).length, anchors: pinCase.anchors, anchorSources: Object.fromEntries(Object.entries(pinCase.anchors).map(([id, value]) => [id, value.source])), generationMs: Math.round(generationMs * 1000) / 1000, productEvaluationMs: Math.round(productEvaluationMs * 1000) / 1000, candidateCount: generated.candidates.length, candidates: generated.candidates.map(({ family, identity, sourceLineage, structuralMetadata, anchorsPreserved, positions }) => ({ family, identity, sourceLineage, structuralMetadata, anchorsPreserved, fingerprint: positionsFingerprint(positions) })), families: perFamily, hardFeasibility: { completeFiniteCandidateSet: true, exactAnchors: generated.candidates.every((candidate) => candidate.anchorsPreserved), productEligibleCandidateCount: selected.proposals.filter((candidate) => candidate.eligible).length }, portfolioWinner: portfolio ? { family: portfolio.family, identity: portfolio.identity, fingerprint: positionsFingerprint(portfolio.positions), metrics: compact(portfolio.metrics), eligible: portfolio.eligible, anchorsPreserved: portfolio.anchorsPreserved } : null, portfolioVsBestSingle: portfolio && bestSingle ? { scoreDelta: portfolio.metrics.score - bestSingle.metrics.score, crossingDelta: portfolio.metrics.crossings - bestSingle.metrics.crossings, overlapDelta: portfolio.metrics.overlapPairs - bestSingle.metrics.overlapPairs, labelRouteHitDelta: portfolio.metrics.labelRouteHits - bestSingle.metrics.labelRouteHits, labelNear20Delta: portfolio.metrics.labelNear20 - bestSingle.metrics.labelNear20, exactSameGeometry: positionsFingerprint(portfolio.positions) === bestSingle.fingerprint } : null };
  });
  const replayCase = pinCases(graph, baseline.selected.positions)[2];
  const replay = buildPortfolioCandidates(graph, replayCase.anchors, { frontierLimit: 4, freeFormLimit: 4, adaptiveRounds: 10 });
  const firstRun = rows.find((item) => item.pinCase === replayCase.id);
  const replayFingerprints = replay.status === "completed" ? replay.candidates.map(({ identity, positions }) => `${identity}:${positionsFingerprint(positions)}`) : [];
  const firstFingerprints = firstRun?.candidates.map(({ identity, fingerprint }) => `${identity}:${fingerprint}`) ?? [];
  return { fixture: fixture.id, locale: fixture.locale, source: fixture.source, graph: { nodes: graph.nodes.length, edges: graph.edges.length, selfLoops: graph.edges.filter((edge) => edge.sourceId === edge.targetId).length }, density: graph.edges.length / Math.max(1, graph.nodes.length * (graph.nodes.length - 1) / 2), snapshotFingerprint: digest(snapshot), snapshotFields: Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Object.keys(value).length])), baselineFingerprint: positionsFingerprint(baseline.selected.positions), cases: rows.map(({ anchors, ...item }) => item), deterministicReplayProbe: { case: replayCase.id, status: replay.status, exactCandidateFingerprintParity: replayFingerprints.length === firstFingerprints.length && replayFingerprints.every((value, index) => value === firstFingerprints[index]), firstRunCandidateCount: firstFingerprints.length, replayCandidateCount: replayFingerprints.length, note: "same normalized graph/config and deterministic pin construction; one independent generation replay per fixture" } };
};

const started = performance.now();
const rows = fixtures.map(run);
const portfolioWins = rows.flatMap((row) => row.cases).filter((item) => item.portfolioWinner?.family !== "pinned-frontier").length;
const exactAnchorPass = rows.flatMap((row) => row.cases).every((item) => item.hardFeasibility.exactAnchors);
const deterministicReplay = rows.every((row) => row.deterministicReplayProbe.exactCandidateFingerprintParity);
const qualityDeltas = rows.flatMap((row) => row.cases).map((item) => item.portfolioVsBestSingle).filter(Boolean);
const distinctPortfolioWins = qualityDeltas.filter((delta) => delta.exactSameGeometry === false).length;
const artifact = { contract: "E2R-LIAISONSCAPE-PINNED-CROSS-FAMILY-PRODUCT-PORTFOLIO-EXPERIMENT1", diagnosticOnly: true, sourceRevision: `${sourceRevision} + working-tree diagnostic additions`, objective: "Compare pin-aware candidate families under identical operation-local Product presentation state; determine whether cross-family Product selection adds bounded value without changing production authority.", fixtureIdentity: "dense-k7x7-bipartite is the exact bipartite(7,7) fixture historically called dense-k7-7; historical names are not renamed.", candidateFamilies: { included: [{ id: "pinned-frontier", lineage: "pinned-frontier-feasibility1 / shared Frontier no-pin path" }, { id: "density-adaptive", lineage: "density-adaptive-node-separation-experiment1 current diagnostic policy" }, { id: "topology-aware-free-form", lineage: "topology-aware-free-form-placement.ts, with bounded anchor-aware adapter when pins exist" }], excluded: [{ id: "post", reason: "existing evidence is persisted position materialization; no current pin-aware generator boundary. Applying anchors afterward would violate exact-pin construction and would not be a source-faithful family replay." }] }, pinContract: "anchors are exact fixed inputs; movable nodes are the only transformed positions; no post-hoc coordinate overwrite; manual move and pin identity remain distinct.", productBoundary: "All candidates use the current Product route, Relation-label, Node-label, Self-loop, previous-placement, and feedback evaluator. Viewport fit is diagnostic only; Dataset, persistence, dirty-state, and Save Coordinates are untouched.", selectionMethod: "same non-empty operation-local snapshot; current Product eligibility and compareAutomaticLayoutProposals order the combined candidate set; no scalar-only winner rule.", baseline: "pinned-frontier family is the best-single control; no-pin accepted Frontier lineage remains the separate empty-snapshot parity control.", rows, aggregate: { fixtureCount: rows.length, pinCaseCount: rows.reduce((sum, row) => sum + row.cases.length, 0), portfolioNonFrontierWins: portfolioWins, portfolioDistinctGeometryWins: distinctPortfolioWins, exactAnchorPreservation: exactAnchorPass, deterministicCandidateReplay: deterministicReplay, qualityDeltas: { improvedScore: qualityDeltas.filter((delta) => delta.scoreDelta < 0).length, worsenedScore: qualityDeltas.filter((delta) => delta.scoreDelta > 0).length, improvedCrossings: qualityDeltas.filter((delta) => delta.crossingDelta < 0).length, worsenedCrossings: qualityDeltas.filter((delta) => delta.crossingDelta > 0).length, worsenedOverlap: qualityDeltas.filter((delta) => delta.overlapDelta > 0).length }, candidateGenerationMs: rows.flatMap((row) => row.cases).map((item) => item.generationMs), productEvaluationMs: rows.flatMap((row) => row.cases).map((item) => item.productEvaluationMs) }, classification: "C. PORTFOLIO HELPS SELECT CASES / GENERAL RELEASE-QUALITY BENEFIT NOT ESTABLISHED", interpretation: "Cross-family selection is executable with exact pins and Product authority, but this bounded campaign does not establish a general quality or release benefit over the best single control. It is not a production Auto Layout decision.", runtimeBoundary: "candidate generation and Product evaluation timings exclude fixture loading, artifact I/O, report generation, React render, and viewport fit; measurements are diagnostic and not an execution-architecture decision.", humanReview: "not started or reopened", noProductionBehaviorChange: true, excludedFromScope: ["production Auto Layout", "Initial Automatic Display", "Save Coordinates", "solver retuning", "routing/label/Self-loop authority", "Worker/scheduler/Cancel implementation"], elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ contract: artifact.contract, classification: artifact.classification, aggregate: artifact.aggregate, rows: rows.map((row) => ({ fixture: row.fixture, cases: row.cases.length, winners: row.cases.map((item) => item.portfolioWinner?.family) })) }, null, 2));
