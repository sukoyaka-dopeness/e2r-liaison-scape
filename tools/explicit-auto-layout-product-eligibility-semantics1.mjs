import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import { settleInitialPlacement } from "../src/auto-layout.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG } from "../experimental/frontier-product-worker-execution-proof1/core.ts";
import { buildPortfolioCandidates, createNonEmptySnapshot, emptySnapshot, evaluatePortfolioWithAnchors } from "../experimental/pinned-cross-family-product-portfolio-experiment1/core.ts";
import { evaluateProductPresentation, positionsFingerprint } from "../experimental/pinned-frontier-feasibility1/core.ts";
import { bipartite, labelHeavyJa, parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "explicit-auto-layout-product-eligibility-semantics1");
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const clone = (value) => JSON.parse(JSON.stringify(value));
const metricKeys = ["crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelNear20", "crossingRelationLabelNear", "labelCorridorDeficit", "labelCorridorConflictPairs", "shortHopCount", "usableSpanPenalty", "score", "minimumSeparation", "routeMedian", "routeMax", "fitScale"];
const predicateKeys = ["crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelNear20"];
const compact = (metrics) => Object.fromEntries(metricKeys.filter((key) => key in metrics).map((key) => [key, metrics[key]]));
const delta = (candidate, baseline) => Object.fromEntries(metricKeys.filter((key) => key in candidate && key in baseline && typeof candidate[key] === "number" && typeof baseline[key] === "number").map((key) => [key, candidate[key] - baseline[key]]));
const finitePositions = (positions, ids) => Object.keys(positions).length === ids.length && ids.every((id) => Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y));
const canonicalize = (positions, anchors) => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, anchors[id] ? { ...point } : { x: Math.round(point.x), y: Math.round(point.y) }]));
const predicate = (metrics) => ({ eligible: metrics.crossings === 0 && metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0, failedConditions: predicateKeys.filter((key) => metrics[key] > 0) });
const pinCases = (graph, baseline) => {
  const ids = graph.nodes.map(({ id }) => id).sort();
  const anchor = (id, source) => ({ x: baseline[id].x + 180, y: baseline[id].y + 64, source });
  const first = ids[0]; const middle = ids[Math.floor(ids.length / 2)];
  return [
    { id: "no-pins", anchors: {} },
    { id: "few-mixed", anchors: { [first]: anchor(first, "saved"), [middle]: anchor(middle, "staged") } },
    { id: "all-pinned", anchors: Object.fromEntries(ids.map((id, index) => [id, anchor(id, index % 2 ? "staged" : "saved")])) },
  ];
};
const withoutManualFields = (snapshot) => ({ ...snapshot, manualNodeLabelOffsets: {}, manualRelationLabelAnchors: {} });
const graphFor = (dataset) => { const graph = buildEntityGraph(dataset); return { nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? edge.id })) }; };
const fixtures = [
  { id: "lighthouse-en", locale: "en", source: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")) },
  { id: "apollo-11-en", locale: "en", source: "../e2r-spec/examples/apollo-11-mission.en.e2r.json", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "apollo-11-mission.en.e2r.json"), "utf8")) },
  { id: "label-heavy-ja-10", locale: "ja", source: "synthetic:label-heavy-ja-10", dataset: labelHeavyJa() },
  { id: "dense-k7x7-bipartite", locale: "en", source: "synthetic:bipartite(7,7); historical alias dense-k7-7", dataset: bipartite(7, 7) },
  { id: "parallel-self-loop-control", locale: "en", source: "synthetic:parallelSelfLoop()", dataset: parallelSelfLoop() },
];

function conditionAttribution(full, noManual, empty, preOperation) {
  return Object.fromEntries(predicateKeys.map((key) => {
    const fullFailed = full[key] > 0;
    const noManualFailed = noManual[key] > 0;
    const emptyFailed = empty[key] > 0;
    const preOperationFailed = preOperation[key] > 0;
    const contributingFactors = [];
    if (fullFailed && !noManualFailed) contributingFactors.push("manual-user-authority-state-dependent");
    if (fullFailed && noManualFailed && !emptyFailed) contributingFactors.push("previous-automatic-presentation-state-dependent");
    if (fullFailed && preOperationFailed) contributingFactors.push("inherited-pre-operation-residual");
    if (fullFailed && contributingFactors.length === 0) contributingFactors.push("candidate-geometry-or-automatic-product-presentation");
    return [key, { full: full[key], noManual: noManual[key], empty: empty[key], preOperation: preOperation[key], contributingFactors, attribution: contributingFactors[0] ?? "none" }];
  }));
}

function runFixture(fixture) {
  const graph = graphFor(fixture.dataset);
  const ids = graph.nodes.map(({ id }) => id).sort();
  const preOperation = settleInitialPlacement({ entities: ids.map((id) => ({ id })), relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) });
  const preOperationPresentation = evaluateProductPresentation(graph, preOperation, emptySnapshot());
  const snapshot = createNonEmptySnapshot(graph, preOperation);
  const noManualSnapshot = withoutManualFields(snapshot);
  const baseline = computeFrontierProductProposals(graph, DEFAULT_FRONTIER_WORKER_CONFIG);
  if (!baseline.selected) throw new Error(`${fixture.id}: accepted Frontier baseline failed`);
  const rows = pinCases(graph, preOperation).map((pinCase) => {
    const generated = buildPortfolioCandidates(graph, pinCase.anchors, { frontierLimit: 4, freeFormLimit: 4, adaptiveRounds: 10 });
    if (generated.status !== "completed") throw new Error(`${fixture.id}/${pinCase.id}: ${generated.failure.message}`);
    const selected = evaluatePortfolioWithAnchors(graph, generated.candidates, pinCase.anchors, snapshot, { finalCanonicalization: "round-once" });
    const portfolio = selected.selected;
    const frontier = selected.proposals.find((candidate) => candidate.family === "pinned-frontier") ?? null;
    const selectedCandidates = [
      { role: "portfolio-selected", proposal: portfolio },
      { role: "best-single-pinned-frontier", proposal: frontier },
    ].filter(({ proposal }) => proposal).map(({ role, proposal }) => {
      const positions = canonicalize(proposal.positions, pinCase.anchors);
      const full = evaluateProductPresentation(graph, positions, snapshot);
      const noManual = evaluateProductPresentation(graph, positions, noManualSnapshot);
      const empty = evaluateProductPresentation(graph, positions, emptySnapshot());
      const fullPredicate = predicate(full.metrics);
      return { role, family: proposal.family, sourceIdentity: proposal.identity, positionFingerprint: positionsFingerprint(positions), completeFinite: finitePositions(positions, ids), exactAnchors: Object.entries(pinCase.anchors).every(([id, anchor]) => positions[id]?.x === anchor.x && positions[id]?.y === anchor.y), metrics: { full: compact(full.metrics), noManual: compact(noManual.metrics), empty: compact(empty.metrics), preOperation: compact(preOperationPresentation.metrics) }, predicate: { full: fullPredicate, noManual: predicate(noManual.metrics), empty: predicate(empty.metrics), preOperation: predicate(preOperationPresentation.metrics) }, conditionAttribution: conditionAttribution(full.metrics, noManual.metrics, empty.metrics, preOperationPresentation.metrics), relativeToPreOperation: delta(full.metrics, preOperationPresentation.metrics), presentationFeedbackApplied: { full: full.presentation.feedbackApplied, noManual: noManual.presentation.feedbackApplied, empty: empty.presentation.feedbackApplied }, notes: { manualFieldsRetainedInPrimary: true, counterfactualsAreDiagnosticOnly: true } };
    });
    return { pinCase: pinCase.id, fixedAnchorCount: Object.keys(pinCase.anchors).length, movableNodeCount: ids.length - Object.keys(pinCase.anchors).length, anchorSources: Object.fromEntries(Object.entries(pinCase.anchors).map(([id, anchor]) => [id, anchor.source])), candidateCount: generated.candidates.length, candidateSetCompleteFinite: generated.candidates.every((candidate) => finitePositions(candidate.positions, ids)), candidates: selectedCandidates };
  });
  return { fixture: fixture.id, locale: fixture.locale, source: fixture.source, graph: { nodes: graph.nodes.length, edges: graph.edges.length, selfLoops: graph.edges.filter((edge) => edge.sourceId === edge.targetId).length }, preOperation: { provider: "settleInitialPlacement", positionFingerprint: positionsFingerprint(preOperation), snapshotFingerprint: digest(snapshot), snapshotFields: Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Object.keys(value).length])), predicate: predicate(preOperationPresentation.metrics), metrics: compact(preOperationPresentation.metrics) }, cases: rows, replayIdentity: rows.map((row) => `${row.pinCase}:${row.candidates.map((candidate) => `${candidate.role}:${candidate.positionFingerprint}`).join("|")}`).join(";") };
}

const started = performance.now();
const rows = fixtures.map(runFixture);
const candidateRows = rows.flatMap((row) => row.cases.flatMap((item) => item.candidates));
const failureCounts = Object.fromEntries(predicateKeys.map((key) => [key, candidateRows.filter((candidate) => candidate.predicate.full.failedConditions.includes(key)).length]));
const attributionCounts = Object.fromEntries(["candidate-geometry-or-automatic-product-presentation", "manual-user-authority-state-dependent", "previous-automatic-presentation-state-dependent", "inherited-pre-operation-residual", "none"].map((value) => [value, candidateRows.flatMap((candidate) => Object.values(candidate.conditionAttribution)).filter((condition) => condition.contributingFactors.includes(value)).length]));
const artifact = { contract: "E2R-LIAISONSCAPE-EXPLICIT-AUTO-LAYOUT-PRODUCT-ELIGIBILITY-SEMANTICS1", diagnosticOnly: true, sourceRevision: `${sourceRevision} + working-tree diagnostic additions`, objective: "Attribute current Product eligibility failures for Explicit Auto Layout candidates without changing the predicate or production behavior.", predicate: { entryPoint: "src/automatic-layout-selection.ts:isAutomaticLayoutPresentationEligible", formula: "eligible iff crossings === 0 && overlapPairs === 0 && labelRouteHits === 0 && labelOverlap === 0 && labelNear20 === 0", hardConditions: ["crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelNear20"], notDirectlyGated: ["non-finite/incomplete geometry", "Pin violation", "minimumSeparation", "aspect/extent", "fitScale", "routeMedian/routeMax", "labelCorridorDeficit", "shortHopCount", "Self-loop-specific metric"], callSiteFinding: "Current source call sites are diagnostic/research proposal selection modules; App.tsx Explicit Auto Layout calls solveAutoLayout and applies positions/dirty-state without this predicate.", interpretation: "This boolean is a hard presentation eligibility predicate for the current research/selection path, not a demonstrated production Explicit Auto Layout Preview or release gate." }, comparisonViews: { primary: "non-empty operation snapshot built from coordinate-less settleInitialPlacement pre-operation presentation", noManual: "same previous automatic state with manual Node/Relation label fields removed; diagnostic counterfactual only", empty: "empty presentation snapshot; diagnostic counterfactual only", preOperation: "settleInitialPlacement positions evaluated with empty snapshot; relative baseline only", manualAuthority: "manual presentation state is retained in primary evaluation and is not discarded by production code" }, fixtures: rows, aggregate: { fixtureCount: rows.length, candidateComparisonCount: candidateRows.length, failedPredicateCount: candidateRows.filter((candidate) => !candidate.predicate.full.eligible).length, conditionFailureCounts: failureCounts, conditionAttributionCounts: attributionCounts, completeFiniteAll: candidateRows.every((candidate) => candidate.completeFinite), exactAnchorsAll: candidateRows.every((candidate) => candidate.exactAnchors), nonEmptyVsEmptyChanged: candidateRows.filter((candidate) => JSON.stringify(candidate.metrics.full) !== JSON.stringify(candidate.metrics.empty)).length, manualFieldsChangedOutcome: candidateRows.filter((candidate) => candidate.predicate.full.eligible !== candidate.predicate.noManual.eligible).length }, classification: "C. MIXED / PREDICATE IS A HARD PRESENTATION ELIGIBILITY GATE, BUT ITS FALSE RESULT MIXES REAL PRESENTATION QUALITY WITH INHERITED/OUT-OF-SCOPE RESIDUALS", decision: "Do not retune or relax isAutomaticLayoutPresentationEligible in this checkpoint. Explicit Auto Layout needs a separate semantic split between structural validity, Preview admissibility, and release acceptance if users must preview candidates that retain authority-preserving residuals. The evidence does not justify calling the current boolean a complete Explicit Auto Layout release gate.", productionImpact: "No production source behavior, Initial Automatic Display, routing, labels, Self-loop, Pin persistence, Dataset, Coordinates, dirty-state, or Human Review status changed.", humanReview: "not started or reopened", runtime: "bounded diagnostic; no execution-architecture decision", elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ contract: artifact.contract, classification: artifact.classification, aggregate: artifact.aggregate, fixtures: rows.map((row) => ({ fixture: row.fixture, cases: row.cases.length })) }, null, 2));
