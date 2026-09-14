import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "experimental", "quality-solver-benchmark1");
const arms = ["direct-current", "structural-native-v3", "frontier-adaptive-12", "structural-native-discrete"];
const discreteFixtureIds = new Set(["lighthouse-en", "apollo-en", "dense-k7-7"]);
const OPERATION_TIMEOUT_MS = 20_000;
const topK = 4;
const fixtures = [
  { id: "lighthouse-en", family: "canonical-mixed-self-loop", path: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json" },
  { id: "lighthouse-ja", family: "canonical-mixed-self-loop-label", path: "../e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json" },
  { id: "apollo-en", family: "canonical-mixed", path: "../e2r-spec/examples/apollo-11-mission.en.e2r.json" },
  { id: "apollo-ja", family: "canonical-label-sensitive", path: "../e2r-spec/examples/apollo-11-mission.ja.e2r.json" },
  { id: "titanic-en", family: "canonical-mixed-parallel", path: "../e2r-spec/examples/titanic-final-voyage.en.e2r.json" },
  { id: "titanic-ja", family: "canonical-label-sensitive-parallel", path: "../e2r-spec/examples/titanic-final-voyage.ja.e2r.json" },
  { id: "dense-k7-7", family: "dense", path: "synthetic:k7-7" },
  { id: "dense-k6-8", family: "dense-rectangular", path: "synthetic:k6-8" },
  { id: "dense-k8-8", family: "dense-large", path: "synthetic:k8-8" },
  { id: "dense-k5-9", family: "dense-imbalanced", path: "synthetic:k5-9" },
  { id: "dense-k7-7-minus-one", family: "dense-perturbed", path: "synthetic:k7-7-minus-one" },
  { id: "apollo-spacing-control", family: "dense-product-control", path: "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-control.en.e2r.json" },
];

function hashPositions(positions) {
  return createHash("sha256").update(JSON.stringify(Object.entries(positions ?? {}).sort(([a], [b]) => a.localeCompare(b)))).digest("hex").slice(0, 16);
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }

function cheapScore(candidate) {
  const crossings = finite(candidate.structuralCrossings, 999);
  const minSeparation = finite(candidate.minNodeSeparation ?? candidate.cheap?.minimumSeparation, 0);
  const corridor = finite(candidate.cheap?.coarseCorridorDeficit, 0);
  const cheapBase = finite(candidate.cheapScore, 0);
  return crossings * 1_000_000 + Math.max(0, 145 - minSeparation) * 1_000 + corridor * 100 + cheapBase / 1_000_000;
}

function compactMetrics(metrics) {
  return {
    score: finite(metrics?.score, Infinity),
    crossings: finite(metrics?.crossings, Infinity),
    labelRouteHits: finite(metrics?.labelRouteHits, Infinity),
    labelNear20: finite(metrics?.labelNear20, Infinity),
    labelOverlap: finite(metrics?.labelOverlap, Infinity),
    overlapPairs: finite(metrics?.overlapPairs, Infinity),
    labelCorridorDeficit: finite(metrics?.labelCorridorDeficit, Infinity),
    routeMedian: finite(metrics?.routeMedian, Infinity),
    routeMax: finite(metrics?.routeMax, Infinity),
    fitScale: finite(metrics?.fitScale, 0),
    extent: metrics?.extent ?? null,
  };
}

function productComparator(left, right) {
  return left.metrics.score - right.metrics.score || left.metrics.crossings - right.metrics.crossings || left.family.localeCompare(right.family);
}

function cheapComparator(left, right) {
  return left.cheapScore - right.cheapScore || left.family.localeCompare(right.family);
}

function runArm(fixture, arm) {
  const env = {
    ...process.env,
    E2R_GLOBAL_PLACEMENT_ABLATION: arm,
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_PRESENTATION_FINALIST_LIMIT: String(topK),
    E2R_PRESENTATION_COST_PROFILE: "1",
  };
  const startedAt = performance.now();
  const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixture.path], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: OPERATION_TIMEOUT_MS,
    killSignal: "SIGTERM",
    env,
  });
  if (run.error?.code === "ETIMEDOUT") return {
    fixture: fixture.id,
    family: fixture.family,
    source: fixture.path,
    arm,
    status: "budget-exhausted",
    budget: { operationTimeoutMs: OPERATION_TIMEOUT_MS },
    graph: null,
    candidateGeneration: { candidateCount: 0, uniqueFamilies: 0, uniquePositions: 0 },
    screening: { ranking: "not reached", finalistBudget: topK, screenedFinalistCount: 0, bestProductCandidateCheapRank: null, topKRecall: false, topKFamilies: [] },
    productEvaluation: { measuredFullPresentationEvaluations: 0, measuredPresentationMs: 0, estimatedFinalistEvaluations: 0, bestCandidate: null, productTopK: [], baseline: null, selected: null },
    diversity: { uniquePositionCount: 0, uniqueFamilyCount: 0, candidateFamilies: [] },
    deterministicFingerprint: null,
  };
  if (run.status !== 0) throw new Error(`${fixture.id}/${arm}: ${run.stderr || run.error || `exit ${run.status}`}`);
  const output = JSON.parse(run.stdout);
  const candidates = (output.candidates ?? []).map((candidate, index) => ({
    index,
    family: candidate.family,
    positionsFingerprint: hashPositions(candidate.positions),
    cheapScore: cheapScore(candidate),
    structuralCrossings: candidate.structuralCrossings ?? null,
    minNodeSeparation: candidate.minNodeSeparation ?? candidate.cheap?.minimumSeparation ?? null,
    metrics: compactMetrics(candidate.metrics),
  }));
  const productRanked = candidates.slice().sort(productComparator);
  const cheapRanked = candidates.slice().sort(cheapComparator);
  const best = productRanked[0] ?? null;
  const cheapBestIndex = best ? cheapRanked.findIndex((candidate) => candidate.positionsFingerprint === best.positionsFingerprint) : -1;
  const baseline = output.selected ? compactMetrics(output.selected.metrics) : null;
  const uniqueFamilies = new Set(candidates.map((candidate) => candidate.family)).size;
  const uniquePositions = new Set(candidates.map((candidate) => candidate.positionsFingerprint)).size;
  const topKRows = cheapRanked.slice(0, topK);
  const productTopK = productRanked.slice(0, topK);
  return {
    fixture: fixture.id,
    family: fixture.family,
    source: fixture.path,
    arm,
    graph: output.graph,
    wallMs: Math.round((performance.now() - startedAt) * 100) / 100,
    candidateGeneration: {
      candidateCount: candidates.length,
      uniqueFamilies,
      uniquePositions,
      planning: output.searchBudget?.globalPlacementAblation ?? arm,
      cheapPlanning: output.searchBudget?.presentationFinalistLimit ?? topK,
    },
    screening: {
      ranking: "structuralCrossings + minimum separation + coarse corridor deficit + source cheapScore",
      finalistBudget: topK,
      screenedFinalistCount: Math.min(topK, candidates.length),
      bestProductCandidateCheapRank: cheapBestIndex < 0 ? null : cheapBestIndex + 1,
      topKRecall: best ? topKRows.some((candidate) => candidate.positionsFingerprint === best.positionsFingerprint) : false,
      topKFamilies: topKRows.map((candidate) => candidate.family),
    },
    productEvaluation: {
      measuredFullPresentationEvaluations: output.profile?.fullPresentationEvaluations ?? null,
      measuredPresentationMs: output.profile?.presentationMs ?? null,
      estimatedFinalistEvaluations: Math.min(topK, candidates.length),
      bestCandidate: best,
      productTopK: productTopK.map((candidate) => ({ family: candidate.family, positionsFingerprint: candidate.positionsFingerprint, metrics: candidate.metrics })),
      baseline: arm === "direct-current" ? baseline : null,
      selected: output.selected ? { family: output.selected.family, metrics: compactMetrics(output.selected.metrics) } : null,
    },
    diversity: {
      uniquePositionCount: uniquePositions,
      uniqueFamilyCount: uniqueFamilies,
      candidateFamilies: [...new Set(candidates.map((candidate) => candidate.family))],
    },
    deterministicFingerprint: output.selectedPositionFingerprint ?? (output.selected ? hashPositions(output.selected.positions) : null),
  };
}

function runRepeatCheck() {
  const checks = [];
  for (const fixture of [fixtures[0], fixtures[2], fixtures[6]]) {
    for (const arm of arms.slice(1)) {
      const first = runArm(fixture, arm);
      const second = runArm(fixture, arm);
      checks.push({ fixture: fixture.id, arm, deterministic: first.deterministicFingerprint === second.deterministicFingerprint, first: first.deterministicFingerprint, second: second.deterministicFingerprint });
    }
  }
  return checks;
}

const startedAt = performance.now();
const rows = [];
for (const fixture of fixtures) for (const arm of arms) {
  if (arm === "structural-native-discrete" && !discreteFixtureIds.has(fixture.id)) continue;
  rows.push(runArm(fixture, arm));
}
const repeatChecks = runRepeatCheck();
const baselineRows = rows.filter((row) => row.arm === "direct-current" && row.status !== "budget-exhausted");
const candidateRows = rows.filter((row) => row.arm !== "direct-current" && row.status !== "budget-exhausted");
const improvements = candidateRows.map((row) => {
  const baseline = baselineRows.find((item) => item.fixture === row.fixture);
  const best = row.productEvaluation.bestCandidate?.metrics;
  return {
    fixture: row.fixture,
    family: row.family,
    arm: row.arm,
    baselineScore: baseline?.productEvaluation.selected?.metrics.score ?? null,
    bestCandidateScore: best?.score ?? null,
    scoreDeltaVsBaseline: baseline && best ? best.score - baseline.productEvaluation.selected.metrics.score : null,
    crossingsDeltaVsBaseline: baseline && best ? best.crossings - baseline.productEvaluation.selected.metrics.crossings : null,
    topKRecall: row.screening.topKRecall,
    bestProductCandidateCheapRank: row.screening.bestProductCandidateCheapRank,
    candidateCount: row.candidateGeneration.candidateCount,
    productEvaluations: row.productEvaluation.measuredFullPresentationEvaluations,
  };
});
const qualityImprovementRows = improvements.filter((row) => Number.isFinite(row.scoreDeltaVsBaseline) && row.scoreDeltaVsBaseline < -1e-6);
const falseNegativeRows = improvements.filter((row) => row.topKRecall === false && (row.productEvaluations ?? 0) > 0);
const successfulCandidateOperations = candidateRows.filter((row) => row.productEvaluation.bestCandidate !== null);
const topKRecallRate = successfulCandidateOperations.length === 0 ? 0 : successfulCandidateOperations.filter((row) => row.screening.topKRecall).length / successfulCandidateOperations.length;
const qualitySolverReadiness = qualityImprovementRows.length > 0 && topKRecallRate >= 0.5 && falseNegativeRows.length > 0
  ? "B: QUALITY SOLVER FAMILY PROMISING BUT SCREENING UNSOLVED"
  : qualityImprovementRows.length > 0
    ? "C: QUALITY IMPROVEMENT CASE-SPECIFIC"
    : "E: NO PROMISING SOLVER FAMILY";
const artifact = {
  contract: "LIAISONSCAPE-BOUNDED-QUALITY-SOLVER-BENCHMARK-v1",
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  sourceBoundary: "Candidate generation is diagnostic-only; finalist evaluation uses the current Product-authoritative presentation source through generic-crossing-search. No Product provider, defaults, Dataset, persistence, manual authority, routing, label, endpoint-plan, or Self-loop ownership changes.",
  campaign: {
    bounded: true,
    fixtureCount: fixtures.length,
    armCount: arms.length,
    operationCount: rows.length,
    candidateFinalistBudget: topK,
    operationTimeoutMs: OPERATION_TIMEOUT_MS,
    discreteFixtureIds: [...discreteFixtureIds],
    fixtures,
    arms,
    fullProductEvaluationPerCandidate: true,
    screeningIsPostHocDiagnostic: true,
  },
  exactness: {
    deterministicRepeatChecks: repeatChecks,
    allRepeatChecksPass: repeatChecks.every((check) => check.deterministic),
  },
  aggregate: {
    operationCount: rows.length,
    maxCandidateCount: Math.max(...rows.map((row) => row.candidateGeneration.candidateCount)),
    maxMeasuredProductEvaluations: Math.max(...rows.map((row) => row.productEvaluation.measuredFullPresentationEvaluations ?? 0)),
    maxPresentationMs: Math.max(...rows.map((row) => row.productEvaluation.measuredPresentationMs ?? 0)),
    budgetExhaustedCount: rows.filter((row) => row.status === "budget-exhausted").length,
    topKRecallRate,
    falseNegativeCount: falseNegativeRows.length,
    qualityImprovementCount: qualityImprovementRows.length,
    successfulCandidateOperations: successfulCandidateOperations.length,
    positiveQualityImprovementCount: qualityImprovementRows.filter((row) => row.scoreDeltaVsBaseline < 0).length,
    negativeOrNeutralQualityCount: qualityImprovementRows.filter((row) => row.scoreDeltaVsBaseline >= 0).length,
    maxCandidateDiversity: Math.max(...rows.map((row) => row.diversity.uniquePositionCount)),
  },
  rows,
  improvements,
  interpretation: {
    cheapScreening: "diagnostic post-hoc ranking; does not replace Product-authoritative finalist evaluation",
    candidateFamilyDisposition: "structural candidates may improve selected metrics in some controls, but a general solver claim requires recall and bounded cost across the campaign",
    productQualityDisposition: "quality remains diagnostic; no visual acceptance or Product adoption",
  },
  disposition: {
    qualitySolverBenchmark: "COMPLETED",
    qualitySolverReadiness,
    productIntegration: "HOLD",
    productionProvider: "NOT ESTABLISHED",
    adaptiveCascade: "INACTIVE",
    humanReview: "NOT READY",
    initialLayoutReleaseBlocker: "OPEN",
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "benchmark-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  contract: artifact.contract,
  campaign: artifact.campaign,
  aggregate: artifact.aggregate,
  exactness: artifact.exactness,
  disposition: artifact.disposition,
}, null, 2));
