import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const sourcePool = path.join(os.tmpdir(), "e2r-bounded-screening-candidate-pool.json");
const outputDir = process.env.E2R_MULTI_STAGE_OUTPUT_DIR
  ? path.resolve(root, process.env.E2R_MULTI_STAGE_OUTPUT_DIR)
  : path.join(root, "experimental", "bounded-multi-stage-product-probe1");
const probeBudgets = [0, 1, 2];
const operationTimeoutMs = 20_000;
const featureKeys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"];

function compareId(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function median(values) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }
function compactProduct(product) {
  return {
    score: finite(product?.score, Number.POSITIVE_INFINITY),
    crossings: finite(product?.crossings, Number.POSITIVE_INFINITY),
    labelRouteHits: finite(product?.labelRouteHits, Number.POSITIVE_INFINITY),
    labelNear20: finite(product?.labelNear20, Number.POSITIVE_INFINITY),
    labelOverlap: finite(product?.labelOverlap, Number.POSITIVE_INFINITY),
    overlapPairs: finite(product?.overlapPairs, Number.POSITIVE_INFINITY),
    labelCorridorDeficit: finite(product?.labelCorridorDeficit, Number.POSITIVE_INFINITY),
    routeMedian: finite(product?.routeMedian, Number.POSITIVE_INFINITY),
    routeMax: finite(product?.routeMax, Number.POSITIVE_INFINITY),
    fitScale: finite(product?.fitScale, 0),
  };
}
function productComparator(left, right) {
  return left.product.score - right.product.score || left.product.crossings - right.product.crossings
    || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
}
function cheapComparator(left, right) {
  for (const key of ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal"]) {
    const delta = left.features[key] - right.features[key];
    if (delta) return delta;
  }
  return compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
}
function cheapEquivalenceKey(candidate) {
  return featureKeys.map((key) => Math.round(finite(candidate.features[key]) * 1_000_000) / 1_000_000).join("|");
}
function fixturePathById(pool) {
  return new Map(pool.fixtures.map((fixture) => [fixture.id, fixture.path]));
}
function ensureCandidatePool() {
  if (process.env.E2R_MULTI_STAGE_CANDIDATE_POOL_FILE) return JSON.parse(fs.readFileSync(process.env.E2R_MULTI_STAGE_CANDIDATE_POOL_FILE, "utf8"));
  const run = spawnSync(process.execPath, ["tools/bounded-screening-finalist-recall1.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: operationTimeoutMs * 20,
    env: { ...process.env, E2R_SCREENING_EXPORT_CANDIDATES: sourcePool, E2R_SCREENING_SKIP_ARTIFACT: "1" },
  });
  if (run.status !== 0) throw new Error(`candidate pool: ${run.stderr || run.error || `exit ${run.status}`}`);
  return JSON.parse(fs.readFileSync(sourcePool, "utf8"));
}
function graphPressure(row) {
  const nodeCount = row.graph.nodes.length;
  const edgeCount = row.graph.edges.length;
  const possiblePairs = Math.max(1, nodeCount * (nodeCount - 1) / 2);
  const maximumDegree = Math.max(0, ...row.graph.nodes.map((node) => row.graph.edges.filter((edge) => edge.sourceId === node.id || edge.targetId === node.id).length));
  return { nodeCount, edgeCount, density: edgeCount / possiblePairs, maximumDegree };
}
function gateFor(row, ranking) {
  const normal = ranking.slice(0, 4);
  const normalKeys = new Set(normal.map(cheapEquivalenceKey));
  const equivalenceClasses = [...normalKeys].map((key) => ({
    key,
    members: row.candidates.filter((candidate) => cheapEquivalenceKey(candidate) === key),
  })).filter(({ members }) => members.length >= 4);
  const outside = equivalenceClasses.flatMap(({ key, members }) => members
    .filter((candidate) => !normal.includes(candidate))
    .map((candidate) => ({ candidate, key })));
  const pressure = graphPressure(row);
  const denseOccupancy = pressure.nodeCount >= 14 && pressure.edgeCount >= 45 && pressure.density >= 0.4;
  const triggered = denseOccupancy && outside.length > 0;
  return {
    triggered,
    rule: "dense occupancy plus a cheap-equivalence class crossing the normal K=4 boundary",
    denseOccupancy,
    outsideCount: outside.length,
    classCount: equivalenceClasses.length,
    equivalenceClassSizes: equivalenceClasses.map(({ key, members }) => ({ key, size: members.length })),
    pressure,
    outside,
  };
}
function selectProbeTargets(row, gate, limit) {
  if (!gate.triggered || limit === 0) return [];
  return gate.outside
    .map(({ candidate, key }) => ({ candidate, key }))
    .sort((left, right) => left.candidate.index - right.candidate.index || compareId(left.candidate.family, right.candidate.family) || compareId(left.candidate.fingerprint, right.candidate.fingerprint))
    .slice(0, limit)
    .map(({ candidate, key }) => ({
      family: candidate.family,
      fingerprint: candidate.fingerprint,
      candidateIndex: candidate.index,
      equivalenceKey: key,
      positions: candidate.positions,
    }));
}
function probeProduct(fixturePath, target) {
  const positionFile = path.join(os.tmpdir(), `e2r-product-probe-${process.pid}-${hash(target.positions)}.json`);
  fs.writeFileSync(positionFile, JSON.stringify({ family: target.family, positions: target.positions }));
  const startedAt = performance.now();
  if (process.env.E2R_MULTI_STAGE_INJECT_PROBE_FAILURE === "1") return {
    status: "failed",
    family: target.family,
    fingerprint: target.fingerprint,
    candidateIndex: target.candidateIndex,
    error: "injected Product-authoritative probe failure",
    presentationMs: 0,
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
  };
  const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixturePath], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: operationTimeoutMs,
    killSignal: "SIGTERM",
    env: {
      ...process.env,
      E2R_PRODUCT_PROBE_POSITIONS_FILE: positionFile,
      E2R_PRODUCT_PROBE_FAMILY: target.family,
      E2R_PRESENTATION_COST_PROFILE: "1",
      E2R_GLOBAL_SPACING_STAGE2: "off",
    },
  });
  if (run.error?.code === "ETIMEDOUT" || run.status !== 0) return {
    status: "failed",
    family: target.family,
    fingerprint: target.fingerprint,
    candidateIndex: target.candidateIndex,
    error: run.error?.code === "ETIMEDOUT" ? "Product-authoritative probe budget exhausted" : (run.stderr || run.error?.message || `exit ${run.status}`),
    presentationMs: 0,
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
  };
  const output = JSON.parse(run.stdout);
  return {
    status: "completed",
    family: target.family,
    fingerprint: target.fingerprint,
    candidateIndex: target.candidateIndex,
    product: compactProduct(output.candidates?.[0]?.metrics),
    presentationMs: finite(output.profile?.presentationMs),
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
    authority: output.probe?.authority ?? "current Product-authoritative presentation",
  };
}
function operationEvaluation(row, budget, cache, fixturePaths, baselineByFixture) {
  const ranking = row.candidates.slice().sort(cheapComparator);
  const normal = ranking.slice(0, 4);
  const gate = gateFor(row, ranking);
  const targets = selectProbeTargets(row, gate, budget);
  const evaluated = [];
  for (const candidate of normal) {
    const key = `${row.fixture}|${candidate.fingerprint}`;
    if (!cache.has(key)) cache.set(key, probeProduct(fixturePaths.get(row.fixture), candidate));
    evaluated.push(cache.get(key));
  }
  const probes = [];
  for (const target of targets) {
    const key = `${row.fixture}|${target.fingerprint}`;
    if (!cache.has(key)) cache.set(key, probeProduct(fixturePaths.get(row.fixture), target));
    const result = cache.get(key);
    evaluated.push(result);
    probes.push(result);
  }
  const oracle = row.candidates.slice().sort(productComparator)[0];
  const failed = evaluated.find((candidate) => candidate.status !== "completed");
  if (failed) {
    return {
      fixture: row.fixture,
      fixtureFamily: row.fixtureFamily,
      arm: row.arm,
      normalFinalistCount: normal.length,
      probeCount: probes.length,
      gate: { ...gate, outside: gate.outside.map(({ candidate, key }) => ({ family: candidate.family, fingerprint: candidate.fingerprint, candidateIndex: candidate.index, equivalenceKey: key })) },
      probeTargets: targets.map(({ positions, ...target }) => target),
      failClosed: true,
      failure: { family: failed.family, error: failed.error ?? "Product probe did not complete" },
      exactBest: false,
      top3Hit: false,
      meaningfulFalseNegative: false,
      regret: 0,
      relativeRegret: 0,
      oracle: { family: oracle.family, fingerprint: oracle.fingerprint, product: oracle.product },
      selectedBest: null,
      selectedFingerprints: [],
      oracleImprovesBaseline: false,
      baselineImprovementRetained: false,
      normalPresentationMs: sum(normal.map((candidate) => cache.get(`${row.fixture}|${candidate.fingerprint}`)?.presentationMs ?? 0)),
      probePresentationMs: sum(probes.map((candidate) => candidate.presentationMs ?? 0)),
      normalWallMs: sum(normal.map((candidate) => cache.get(`${row.fixture}|${candidate.fingerprint}`)?.wallMs ?? 0)),
      probeWallMs: sum(probes.map((candidate) => candidate.wallMs ?? 0)),
      deterministic: true,
      baseline: baselineByFixture.get(row.fixture)?.candidates?.[0]?.product ?? null,
    };
  }
  const selected = evaluated.slice().sort(productComparator);
  const selectedBest = selected[0];
  const top3 = row.candidates.slice().sort(productComparator).slice(0, 3);
  const baseline = baselineByFixture.get(row.fixture)?.candidates?.[0]?.product ?? null;
  const oracleImprovesBaseline = Boolean(baseline && oracle.product.score < baseline.score);
  const selectedImprovesBaseline = Boolean(baseline && selectedBest.product.score < baseline.score);
  const regret = selectedBest.product.score - oracle.product.score;
  const relativeRegret = regret / Math.max(1, Math.abs(oracle.product.score));
  const exactBest = selected.some((candidate) => candidate.fingerprint === oracle.fingerprint);
  const top3Hit = selected.some((candidate) => top3.some((top) => top.fingerprint === candidate.fingerprint));
  const meaningfulFalseNegative = !exactBest && (relativeRegret > 0.02 || regret > 2_000
    || selectedBest.product.crossings > oracle.product.crossings
    || selectedBest.product.overlapPairs > oracle.product.overlapPairs
    || selectedBest.product.labelRouteHits > oracle.product.labelRouteHits
    || selectedBest.product.labelOverlap > oracle.product.labelOverlap);
  return {
    fixture: row.fixture,
    fixtureFamily: row.fixtureFamily,
    arm: row.arm,
    normalFinalistCount: normal.length,
    probeCount: probes.length,
    gate: { ...gate, outside: gate.outside.map(({ candidate, key }) => ({ family: candidate.family, fingerprint: candidate.fingerprint, candidateIndex: candidate.index, equivalenceKey: key })) },
    probeTargets: targets.map(({ positions, ...target }) => target),
    exactBest,
    top3Hit,
    meaningfulFalseNegative,
    regret,
    relativeRegret,
    oracle: { family: oracle.family, fingerprint: oracle.fingerprint, product: oracle.product },
    selectedBest: { family: selectedBest.family, fingerprint: selectedBest.fingerprint, product: selectedBest.product },
    selectedFingerprints: selected.map(({ fingerprint }) => fingerprint),
    oracleImprovesBaseline,
    baselineImprovementRetained: !oracleImprovesBaseline || selectedImprovesBaseline,
    normalPresentationMs: sum(normal.map((candidate) => cache.get(`${row.fixture}|${candidate.fingerprint}`).presentationMs)),
    probePresentationMs: sum(probes.map((candidate) => candidate.presentationMs)),
    normalWallMs: sum(normal.map((candidate) => cache.get(`${row.fixture}|${candidate.fingerprint}`).wallMs)),
    probeWallMs: sum(probes.map((candidate) => candidate.wallMs)),
    deterministic: JSON.stringify(ranking.slice(0, 4).map(({ fingerprint }) => fingerprint)) === JSON.stringify(row.candidates.slice().sort(cheapComparator).slice(0, 4).map(({ fingerprint }) => fingerprint)),
    baseline,
  };
}
function aggregate(results) {
  const operationCount = results.length;
  const totalProductEvaluations = sum(results.map((result) => result.normalFinalistCount + result.probeCount));
  return {
    operationCount,
    exactBestHits: results.filter((result) => result.exactBest).length,
    exactBestRecall: results.filter((result) => result.exactBest).length / Math.max(1, operationCount),
    top3AnyHits: results.filter((result) => result.top3Hit).length,
    top3AnyRecall: results.filter((result) => result.top3Hit).length / Math.max(1, operationCount),
    meaningfulFalseNegativeCount: results.filter((result) => result.meaningfulFalseNegative).length,
    baselineImprovementRetention: results.filter((result) => result.baselineImprovementRetained).length / Math.max(1, operationCount),
    meanRegret: sum(results.map((result) => result.regret)) / Math.max(1, operationCount),
    maxRegret: Math.max(0, ...results.map((result) => result.regret)),
    meanRelativeRegret: sum(results.map((result) => result.relativeRegret)) / Math.max(1, operationCount),
    totalProductEvaluations,
    normalFinalistEvaluations: sum(results.map((result) => result.normalFinalistCount)),
    ambiguityProbeEvaluations: sum(results.map((result) => result.probeCount)),
    avoidedProductEvaluations: sum(results.map((result) => result.oracleCandidateCount ?? 0)) - totalProductEvaluations,
    triggeredOperations: results.filter((result) => result.gate.triggered).length,
    unnecessaryTriggers: results.filter((result) => result.gate.triggered && result.probeCount > 0 && result.exactBest && !result.meaningfulFalseNegative).length,
    normalPresentationMs: sum(results.map((result) => result.normalPresentationMs)),
    probePresentationMs: sum(results.map((result) => result.probePresentationMs)),
    measuredProductPresentationMs: sum(results.map((result) => result.normalPresentationMs + result.probePresentationMs)),
    normalWallMs: sum(results.map((result) => result.normalWallMs)),
    probeWallMs: sum(results.map((result) => result.probeWallMs)),
    deterministic: results.every((result) => result.deterministic),
    failClosedOperations: results.filter((result) => result.failClosed).length,
  };
}

const startedAt = performance.now();
const pool = ensureCandidatePool();
const fixturePaths = fixturePathById(pool);
const candidateRows = pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length);
const baselineByFixture = new Map(pool.rows.filter((row) => row.arm === "direct-current" && row.candidates.length).map((row) => [row.fixture, row]));
const oracleCandidateCount = sum(candidateRows.map((row) => row.candidates.length));
const cache = new Map();
const budgetResults = Object.fromEntries(probeBudgets.map((budget) => {
  const results = candidateRows.map((row) => ({ ...operationEvaluation(row, budget, cache, fixturePaths, baselineByFixture), oracleCandidateCount: row.candidates.length }));
  return [budget, { aggregate: { ...aggregate(results), oracleCandidateEvaluations: oracleCandidateCount }, results }];
}));
const oneProbe = budgetResults[1];
const zeroProbe = budgetResults[0];
const twoProbe = budgetResults[2];
const zeroByOperation = new Map(zeroProbe.results.map((result) => [`${result.fixture}|${result.arm}`, result]));
for (const budget of probeBudgets) {
  const aggregateResult = budgetResults[budget].aggregate;
  const results = budgetResults[budget].results;
  aggregateResult.usefulTriggers = results.filter((result) => result.gate.triggered && zeroByOperation.get(`${result.fixture}|${result.arm}`)?.meaningfulFalseNegative).length;
  aggregateResult.unnecessaryTriggers = results.filter((result) => result.gate.triggered && !zeroByOperation.get(`${result.fixture}|${result.arm}`)?.meaningfulFalseNegative).length;
  aggregateResult.probeTriggerRate = aggregateResult.triggeredOperations / Math.max(1, aggregateResult.operationCount);
  aggregateResult.unnecessaryProbeRate = aggregateResult.unnecessaryTriggers / Math.max(1, aggregateResult.triggeredOperations);
}
const denseRows = oneProbe.results.filter((result) => result.fixture.startsWith("dense-"));
const classification = oneProbe.aggregate.meaningfulFalseNegativeCount === 0
  && oneProbe.aggregate.ambiguityProbeEvaluations <= 6
  && oneProbe.aggregate.failClosedOperations === 0
  && oneProbe.aggregate.deterministic
  ? "A. BOUNDED MULTI-STAGE SELECTOR ESTABLISHED"
  : oneProbe.aggregate.meaningfulFalseNegativeCount < zeroProbe.aggregate.meaningfulFalseNegativeCount
    ? "B. PRODUCT PROBE IMPROVES RECALL BUT COST/BOUNDARY OPEN"
    : twoProbe.aggregate.meaningfulFalseNegativeCount < zeroProbe.aggregate.meaningfulFalseNegativeCount
      ? "C. DENSE AMBIGUITY DETECTABLE BUT PROBE TARGET UNSOLVED"
      : "D. LIMITED PRODUCT PROBING INSUFFICIENT";
const artifact = {
  contract: "LIAISONSCAPE-BOUNDED-MULTI-STAGE-PRODUCT-PROBE-v1",
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  sourceBoundary: "Existing candidate families and cheap lexicographic K=4 are retained. Every normal finalist and ambiguity probe is evaluated by the current Product-authoritative presentation source; no partial routing, label approximation, or new solver family is introduced.",
  architecture: {
    stages: ["existing candidate generation", "cheap lexicographic K=4", "deterministic cheap-equivalence/high-risk gate", "0/1/2 complete Product-authoritative probes", "Product metric selection"],
    normalFinalistBudget: 4,
    probeBudgets,
    cheapEquivalence: "six-decimal quantized tested cheap feature vector including crossings, separation, label/corridor, angular, extent, and edge-spread signals",
    riskGate: "dense occupancy derived from graph size/edge density plus a cheap-equivalence class crossing the K=4 boundary; no fixture identity",
    targetRule: "lowest candidate-generation index outside the normal K=4 finalists within the triggered equivalence classes, then next-lowest for budget 2",
    selectionRule: "minimum current Product-authoritative score, then crossings/family/fingerprint deterministic tie-break",
  },
  accounting: {
    oracleFullCandidateEvaluations: oracleCandidateCount,
    normalFinalistEvaluations: oneProbe.aggregate.normalFinalistEvaluations,
    oneProbeAmbiguityEvaluations: oneProbe.aggregate.ambiguityProbeEvaluations,
    oneProbeTotalProductEvaluations: oneProbe.aggregate.totalProductEvaluations,
    oneProbeAvoidedProductEvaluations: oracleCandidateCount - oneProbe.aggregate.totalProductEvaluations,
    twoProbeAmbiguityEvaluations: twoProbe.aggregate.ambiguityProbeEvaluations,
    twoProbeTotalProductEvaluations: twoProbe.aggregate.totalProductEvaluations,
    candidateGenerationTiming: "not isolated by the current source-faithful candidate harness because candidate-family generation and Product evaluation are coupled inside generic-crossing-search; this checkpoint reports measured selected Product authority timing separately rather than relabeling the coupled wall time",
    measuredSelectedProductPresentationMs: { oneProbe: oneProbe.aggregate.measuredProductPresentationMs, twoProbe: twoProbe.aggregate.measuredProductPresentationMs },
    measuredSelectedProcessWallMs: { oneProbe: oneProbe.aggregate.normalWallMs + oneProbe.aggregate.probeWallMs, twoProbe: twoProbe.aggregate.normalWallMs + twoProbe.aggregate.probeWallMs },
    previousOraclePresentationMs: sum(pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed").map((row) => row.profile?.presentationMs ?? 0)),
  },
  budgets: Object.fromEntries(probeBudgets.map((budget) => [budget, budgetResults[budget].aggregate])),
  falseTriggerAudit: {
    oneProbeTriggeredOperations: oneProbe.results.filter((result) => result.gate.triggered).map((result) => ({ fixture: result.fixture, arm: result.arm, probeCount: result.probeCount, exactBest: result.exactBest, meaningfulFalseNegative: result.meaningfulFalseNegative })),
    denseControls: denseRows.map((result) => ({ fixture: result.fixture, arm: result.arm, triggered: result.gate.triggered, outsideCount: result.gate.outsideCount, probeTargets: result.probeTargets })),
    canonicalTriggered: oneProbe.results.filter((result) => /^(lighthouse|apollo|titanic)-/.test(result.fixture) && result.gate.triggered).length,
  },
  denseResults: denseRows.map((result) => ({ fixture: result.fixture, arm: result.arm, gate: result.gate, probeTargets: result.probeTargets, exactBest: result.exactBest, meaningfulFalseNegative: result.meaningfulFalseNegative, regret: result.regret, selectedBest: result.selectedBest })),
  budgetResults,
  deterministic: { samePoolAndSelector: Object.values(budgetResults).every(({ aggregate: result }) => result.deterministic), repeatProbeCacheKey: true },
  cancellationAndFailure: "The existing Product verification seam is resumable and fail-closed; this selector does not expose an unverified candidate on probe budget exhaustion or Product probe failure. Lifecycle integration is intentionally not performed.",
  failureSafety: {
    classificationRequiresFailClosedOperationsZero: true,
    injectedFailureMode: "E2R_MULTI_STAGE_INJECT_PROBE_FAILURE=1",
    normalRunFailClosedOperations: oneProbe.aggregate.failClosedOperations,
  },
  disposition: {
    classification,
    candidateGeneration: "existing families retained",
    cheapOnlySelector: "HOLD / NOT ESTABLISHED",
    multiStageSelector: classification.startsWith("A.") ? "DIAGNOSTICALLY PROMISING / PRODUCTION INTEGRATION NOT ESTABLISHED" : "NEXT BOUNDED ARCHITECTURE CANDIDATE",
    qualitySolver: "HOLD / NOT ESTABLISHED",
    productIntegration: "HOLD",
    productionProvider: "NOT ESTABLISHED",
    actualProductVisualEvaluation: "NOT READY",
    humanReview: "NOT READY",
    initialLayoutReleaseBlocker: "OPEN",
  },
  elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "benchmark-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "benchmark-result-summary.json")), classification, budgets: artifact.budgets, dense: artifact.denseResults }, null, 2));
