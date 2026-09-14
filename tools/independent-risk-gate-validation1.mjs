import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const poolPath = path.join(os.tmpdir(), "e2r-independent-risk-gate-candidate-pool.json");
const outputDir = path.join(root, "experimental", "independent-risk-gate-validation1");
const extraFixtures = [
  { id: "independent-k6-7", family: "independent-dense-near-threshold", path: "synthetic:k6-7" },
  { id: "independent-k7-6", family: "independent-dense-transpose", path: "synthetic:k7-6" },
  { id: "independent-k8-7", family: "independent-dense-wide", path: "synthetic:k8-7" },
  { id: "independent-k5-8-minus-one", family: "independent-edge-perturbation", path: "synthetic:k5-8-minus-one" },
];
const cheapKeys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"];

function compareId(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function productComparator(left, right) { return left.product.score - right.product.score || left.product.crossings - right.product.crossings || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint); }
function cheapComparator(left, right) {
  for (const key of ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal"]) {
    const delta = left.features[key] - right.features[key];
    if (delta) return delta;
  }
  return compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
}
function equivalenceKey(candidate) { return cheapKeys.map((key) => Math.round(finite(candidate.features[key]) * 1_000_000) / 1_000_000).join("|"); }
function graphPressure(row) {
  const nodeCount = row.graph.nodes.length;
  const edgeCount = row.graph.edges.length;
  return { nodeCount, edgeCount, density: edgeCount / Math.max(1, nodeCount * (nodeCount - 1) / 2), maximumDegree: Math.max(0, ...row.graph.nodes.map((node) => row.graph.edges.filter((edge) => edge.sourceId === node.id || edge.targetId === node.id).length)) };
}
function gateFor(row, ranking) {
  const normal = ranking.slice(0, 4);
  const keys = new Set(normal.map(equivalenceKey));
  const classes = [...keys].map((key) => ({ key, members: row.candidates.filter((candidate) => equivalenceKey(candidate) === key) })).filter(({ members }) => members.length >= 4);
  const outside = classes.flatMap(({ key, members }) => members.filter((candidate) => !normal.includes(candidate)).map((candidate) => ({ candidate, key })));
  const pressure = graphPressure(row);
  const denseOccupancy = pressure.nodeCount >= 14 && pressure.edgeCount >= 45 && pressure.density >= 0.4;
  return { triggered: denseOccupancy && outside.length > 0, denseOccupancy, outside, classes, pressure };
}
function targetCandidates(row, gate, rule) {
  if (!gate.triggered) return [];
  const ordered = gate.outside.slice().sort((left, right) => {
    if (rule === "index") return left.candidate.index - right.candidate.index || compareId(left.candidate.family, right.candidate.family) || compareId(left.candidate.fingerprint, right.candidate.fingerprint);
    return compareId(left.candidate.family, right.candidate.family) || compareId(left.candidate.fingerprint, right.candidate.fingerprint);
  });
  return ordered.slice(0, 1).map(({ candidate, key }) => ({ candidate, key }));
}
function evaluate(row, rule) {
  const ranking = row.candidates.slice().sort(cheapComparator);
  const normal = ranking.slice(0, 4);
  const gate = gateFor(row, ranking);
  const targets = targetCandidates(row, gate, rule);
  const selected = [...normal, ...targets.map(({ candidate }) => candidate)].sort(productComparator);
  const oracle = row.candidates.slice().sort(productComparator)[0];
  const best = selected[0];
  const baseline = row.baseline?.product ?? null;
  return {
    fixture: row.fixture,
    fixtureFamily: row.fixtureFamily,
    arm: row.arm,
    rule,
    triggered: gate.triggered,
    denseOccupancy: gate.denseOccupancy,
    outsideCount: gate.outside.length,
    equivalenceClassSizes: gate.classes.map(({ members }) => members.length),
    target: targets[0] ? { family: targets[0].candidate.family, fingerprint: targets[0].candidate.fingerprint, candidateIndex: targets[0].candidate.index } : null,
    exactBest: selected.some((candidate) => candidate.fingerprint === oracle.fingerprint),
    top3Hit: selected.some((candidate) => row.candidates.slice().sort(productComparator).slice(0, 3).some((top) => top.fingerprint === candidate.fingerprint)),
    regret: best.product.score - oracle.product.score,
    meaningfulFalseNegative: !selected.some((candidate) => candidate.fingerprint === oracle.fingerprint) && (best.product.score - oracle.product.score > 2_000 || best.product.crossings > oracle.product.crossings || best.product.labelRouteHits > oracle.product.labelRouteHits || best.product.labelOverlap > oracle.product.labelOverlap),
    baselineImprovementRetained: !baseline || oracle.product.score >= baseline.score || best.product.score < baseline.score,
    oracle: { family: oracle.family, fingerprint: oracle.fingerprint },
    selectedBest: { family: best.family, fingerprint: best.fingerprint },
    productEvaluations: normal.length + targets.length,
  };
}
function aggregate(results) {
  return {
    operationCount: results.length,
    exactBestHits: results.filter((result) => result.exactBest).length,
    exactBestRecall: results.filter((result) => result.exactBest).length / Math.max(1, results.length),
    top3AnyRecall: results.filter((result) => result.top3Hit).length / Math.max(1, results.length),
    meaningfulFalseNegativeCount: results.filter((result) => result.meaningfulFalseNegative).length,
    baselineImprovementRetention: results.filter((result) => result.baselineImprovementRetained).length / Math.max(1, results.length),
    maxRegret: Math.max(0, ...results.map((result) => result.regret)),
    triggeredOperations: results.filter((result) => result.triggered).length,
    probeEvaluations: sum(results.map((result) => result.productEvaluations - 4)),
    productEvaluations: sum(results.map((result) => result.productEvaluations)),
  };
}
function exportCandidatePool() {
  const run = spawnSync(process.execPath, ["tools/bounded-screening-finalist-recall1.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env, E2R_SCREENING_EXPORT_CANDIDATES: poolPath, E2R_SCREENING_SKIP_ARTIFACT: "1", E2R_SCREENING_EXTRA_FIXTURES: JSON.stringify(extraFixtures) },
  });
  if (run.status !== 0) throw new Error(`candidate pool: ${run.stderr || run.error || `exit ${run.status}`}`);
  return JSON.parse(fs.readFileSync(poolPath, "utf8"));
}
function withBaseline(pool, row) {
  const baseline = pool.rows.find((candidateRow) => candidateRow.fixture === row.fixture && candidateRow.arm === "direct-current" && candidateRow.candidates.length)?.candidates[0] ?? null;
  return { ...row, baseline };
}
function perturbGenerationOrder(row, mode) {
  const candidates = row.candidates.slice().reverse().map((candidate, index) => ({ ...candidate, index }));
  return { ...row, candidates, perturbation: mode };
}

const pool = exportCandidatePool();
const oldRows = pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length && !row.fixture.startsWith("independent-" )).map((row) => withBaseline(pool, row));
const independentRows = pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length && row.fixture.startsWith("independent-" )).map((row) => withBaseline(pool, row));
const indexOriginal = oldRows.map((row) => evaluate(row, "index"));
const indexListOnly = oldRows.map((row) => evaluate({ ...row, candidates: row.candidates.slice().reverse() }, "index"));
const indexPerturbed = oldRows.map((row) => evaluate(perturbGenerationOrder(row, "reversed-generation-index"), "index"));
const stableOriginal = oldRows.map((row) => evaluate(row, "stable-family-fingerprint"));
const stablePerturbed = oldRows.map((row) => evaluate(perturbGenerationOrder(row, "reversed-generation-index"), "stable-family-fingerprint"));
const independentIndex = independentRows.map((row) => evaluate(row, "index"));
const independentStable = independentRows.map((row) => evaluate(row, "stable-family-fingerprint"));
const orderDifferences = indexOriginal.map((result, index) => ({ fixture: result.fixture, arm: result.arm, listOnlyInvariant: JSON.stringify(result.target) === JSON.stringify(indexListOnly[index].target), generationIndexInvariant: JSON.stringify(result.target) === JSON.stringify(indexPerturbed[index].target), originalTarget: result.target, perturbedTarget: indexPerturbed[index].target, originalExactBest: result.exactBest, perturbedExactBest: indexPerturbed[index].exactBest })).filter((result) => !result.generationIndexInvariant);
const artifact = {
  contract: "LIAISONSCAPE-INDEPENDENT-RISK-GATE-TARGET-STABILITY-v1",
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  sourceBoundary: "Existing candidate families and current Product metrics are retained. Order and target validation use the same candidate geometry set; independent controls are generated through the existing diagnostic candidate source. No Product authority is moved or approximated.",
  controls: { extraFixtures, oldOperationCount: oldRows.length, independentOperationCount: independentRows.length, independentGraphFamilies: [...new Set(independentRows.map((row) => row.fixtureFamily))] },
  classificationSafety: { predicateRequiresFailClosedZero: true, normalArtifactFailClosedOperations: 0, failureInjectionMode: "E2R_MULTI_STAGE_INJECT_PROBE_FAILURE=1", failureInjectionMustNotClassifyEstablished: true },
  targetRules: {
    current: "lowest candidate-generation index outside the K=4 cheap-equivalence class",
    stable: "lexicographically lowest family + fingerprint outside the K=4 cheap-equivalence class; no Product metric input",
    productMetricLeakage: false,
  },
  original: aggregate(indexOriginal),
  listOrderOnly: aggregate(indexListOnly),
  generationIndexPerturbed: aggregate(indexPerturbed),
  stableOriginal: aggregate(stableOriginal),
  stablePerturbed: aggregate(stablePerturbed),
  independentIndex: aggregate(independentIndex),
  independentStable: aggregate(independentStable),
  orderDifferences,
  oldDenseWitnesses: ["dense-k7-7", "dense-k5-9"].map((fixture) => ({
    fixture,
    current: indexOriginal.filter((result) => result.fixture === fixture).map(({ arm, target, exactBest, meaningfulFalseNegative }) => ({ arm, target, exactBest, meaningfulFalseNegative })),
    stable: stableOriginal.filter((result) => result.fixture === fixture).map(({ arm, target, exactBest, meaningfulFalseNegative }) => ({ arm, target, exactBest, meaningfulFalseNegative })),
  })),
  independentResults: independentIndex.map((result, index) => ({ ...result, stable: independentStable[index] })),
  disposition: {
    classification: "PENDING-COMPUTED",
    riskGateReadiness: "PENDING-COMPUTED",
    probeTargetReadiness: "PENDING-COMPUTED",
    multiStageSelector: "PENDING-COMPUTED",
    qualitySolver: "HOLD / NOT ESTABLISHED",
    productIntegration: "HOLD",
    productionProvider: "NOT ESTABLISHED",
    actualProductVisualEvaluation: "NOT READY",
    humanReview: "NOT READY",
    initialLayoutReleaseBlocker: "OPEN",
  },
};
const indexClosure = indexOriginal.every((result) => result.exactBest && !result.meaningfulFalseNegative);
const stableClosure = stableOriginal.every((result) => result.exactBest && !result.meaningfulFalseNegative);
const independentMisses = independentIndex.filter((result) => result.meaningfulFalseNegative).length;
const stableIndependentMisses = independentStable.filter((result) => result.meaningfulFalseNegative).length;
artifact.disposition.classification = stableClosure && orderDifferences.length === 0 && stableIndependentMisses === 0
  ? "A. INDEPENDENT MULTI-STAGE SELECTOR VALIDATION PASSED"
  : stableOriginal.some((result) => result.meaningfulFalseNegative) && indexPerturbed.some((result) => result.meaningfulFalseNegative)
    ? "C. ORDER DEPENDENCY CONFIRMED / TARGET RULE NOT ESTABLISHED"
    : independentMisses > 0 || stableIndependentMisses > 0
      ? "D. RISK GATE DOES NOT GENERALIZE"
      : "B. TARGET RULE STABILIZED / INDEPENDENT GATE VALIDATION LIMITED";
artifact.disposition.riskGateReadiness = independentMisses === 0 && stableIndependentMisses === 0 ? "SUPPORTED IN TESTED INDEPENDENT CONTROLS" : "OPEN";
artifact.disposition.probeTargetReadiness = orderDifferences.length === 0 && stableClosure && stableIndependentMisses === 0 ? "SUPPORTED" : "NOT ESTABLISHED";
artifact.disposition.multiStageSelector = artifact.disposition.classification.startsWith("A.") ? "INDEPENDENTLY SUPPORTED DIAGNOSTICALLY / PRODUCTION INTEGRATION NOT ESTABLISHED" : "DIAGNOSTICALLY BOUNDED / TARGET OR GATE OPEN";
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "benchmark-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "benchmark-result-summary.json")), classification: artifact.disposition.classification, original: artifact.original, generationIndexPerturbed: artifact.generationIndexPerturbed, stableOriginal: artifact.stableOriginal, stablePerturbed: artifact.stablePerturbed, independentIndex: artifact.independentIndex, independentStable: artifact.independentStable, orderDifferences: orderDifferences.length }, null, 2));
