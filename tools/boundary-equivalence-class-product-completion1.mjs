import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const sourcePool = path.join(os.tmpdir(), "e2r-boundary-equivalence-candidate-pool.json");
const outputDir = process.env.E2R_BOUNDARY_OUTPUT_DIR
  ? path.resolve(root, process.env.E2R_BOUNDARY_OUTPUT_DIR)
  : path.join(root, "experimental", "boundary-equivalence-class-product-completion1");
const operationTimeoutMs = 20_000;
const normalK = 4;
const caps = [2, 4, 6];
const featureKeys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"];
const extraFixtures = [
  { id: "independent-k6-7", family: "independent-dense-near-threshold", path: "synthetic:k6-7" },
  { id: "independent-k7-6", family: "independent-dense-transpose", path: "synthetic:k7-6" },
  { id: "independent-k8-7", family: "independent-dense-wide", path: "synthetic:k8-7" },
  { id: "independent-k5-8-minus-one", family: "independent-edge-perturbation", path: "synthetic:k5-8-minus-one" },
];

function compareId(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function median(values) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }
function quantized(value) { return Math.round(finite(value) * 1_000_000) / 1_000_000; }
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
function equivalenceKey(candidate) {
  return featureKeys.map((key) => quantized(candidate.features[key])).join("|");
}
function positionSignature(candidate) {
  return Object.keys(candidate.positions ?? {}).sort(compareId).map((id) => {
    const position = candidate.positions[id] ?? {};
    return `${id}:${quantized(position.x)},${quantized(position.y)}`;
  }).join("|");
}
function stableGeometryComparator(left, right) {
  return compareId(positionSignature(left), positionSignature(right))
    || compareId(left.family, right.family)
    || compareId(left.fingerprint, right.fingerprint);
}
function graphPressure(row) {
  const nodeCount = row.graph.nodes.length;
  const edgeCount = row.graph.edges.length;
  return {
    nodeCount,
    edgeCount,
    density: edgeCount / Math.max(1, nodeCount * (nodeCount - 1) / 2),
    maximumDegree: Math.max(0, ...row.graph.nodes.map((node) => row.graph.edges.filter((edge) => edge.sourceId === node.id || edge.targetId === node.id).length)),
  };
}
function densityGate(row) {
  const pressure = graphPressure(row);
  return pressure.nodeCount >= 14 && pressure.edgeCount >= 45 && pressure.density >= 0.4;
}
function boundaryClasses(row, ranking) {
  const normal = ranking.slice(0, normalK);
  const grouped = new Map();
  for (const candidate of row.candidates) {
    const key = equivalenceKey(candidate);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  return [...grouped.entries()]
    .map(([key, members]) => ({ key, members, normalMembers: members.filter((candidate) => normal.includes(candidate)), outsideMembers: members.filter((candidate) => !normal.includes(candidate)) }))
    .filter(({ members, normalMembers, outsideMembers }) => members.length >= normalK && normalMembers.length > 0 && outsideMembers.length > 0);
}
function boundaryInfo(row, ranking) {
  const classes = boundaryClasses(row, ranking);
  const normal = ranking.slice(0, normalK);
  const outside = classes.flatMap(({ key, outsideMembers }) => outsideMembers.map((candidate) => ({ candidate, key })));
  return {
    normal,
    classes,
    outside,
    boundaryTriggered: classes.length > 0,
    densityTriggered: classes.length > 0 && densityGate(row),
    pressure: graphPressure(row),
  };
}
function targetForCurrentRule(info, limit) {
  return info.densityTriggered
    ? info.outside.slice().sort((left, right) => left.candidate.index - right.candidate.index || compareId(left.candidate.family, right.candidate.family) || compareId(left.candidate.fingerprint, right.candidate.fingerprint)).slice(0, limit)
    : [];
}
function targetForStableCap(info, limit) {
  return info.boundaryTriggered
    ? info.outside.slice().sort((left, right) => stableGeometryComparator(left.candidate, right.candidate)).slice(0, limit)
    : [];
}
function selectCandidates(row, policy, cap = 0) {
  const ranking = row.candidates.slice().sort(cheapComparator);
  const info = boundaryInfo(row, ranking);
  const targets = policy === "cheap-k4"
    ? []
    : policy === "density-one-index"
      ? targetForCurrentRule(info, 1)
      : policy === "full-boundary"
        ? info.outside
        : targetForStableCap(info, cap);
  const selected = [...info.normal, ...targets.map(({ candidate }) => candidate)];
  const unique = new Map(selected.map((candidate) => [candidate.fingerprint, candidate]));
  return {
    ranking,
    info,
    targets,
    selected: [...unique.values()],
    boundaryClassSummary: info.classes.map(({ key, members, normalMembers, outsideMembers }) => ({
      key,
      size: members.length,
      normalMemberCount: normalMembers.length,
      outsideMemberCount: outsideMembers.length,
      members: members.map((candidate) => ({ family: candidate.family, fingerprint: candidate.fingerprint, candidateIndex: candidate.index })),
    })),
  };
}
function probeProduct(fixturePath, candidate) {
  const positionFile = path.join(os.tmpdir(), `e2r-boundary-probe-${process.pid}-${hash(candidate.positions)}.json`);
  fs.writeFileSync(positionFile, JSON.stringify({ family: candidate.family, positions: candidate.positions }));
  const startedAt = performance.now();
  if (process.env.E2R_BOUNDARY_INJECT_PRODUCT_FAILURE === "1") return {
    status: "failed",
    family: candidate.family,
    fingerprint: candidate.fingerprint,
    error: "injected Product-authoritative completion failure",
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
      E2R_PRODUCT_PROBE_FAMILY: candidate.family,
      E2R_PRESENTATION_COST_PROFILE: "1",
      E2R_GLOBAL_SPACING_STAGE2: "off",
    },
  });
  if (run.error?.code === "ETIMEDOUT" || run.status !== 0) return {
    status: "failed",
    family: candidate.family,
    fingerprint: candidate.fingerprint,
    error: run.error?.code === "ETIMEDOUT" ? "Product-authoritative completion budget exhausted" : (run.stderr || run.error?.message || `exit ${run.status}`),
    presentationMs: 0,
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
  };
  const output = JSON.parse(run.stdout);
  return {
    status: "completed",
    family: candidate.family,
    fingerprint: candidate.fingerprint,
    product: compactProduct(output.candidates?.[0]?.metrics),
    presentationMs: finite(output.profile?.presentationMs),
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
    authority: output.probe?.authority ?? "current Product-authoritative presentation",
  };
}
function evaluate(row, selection, policy, cache, fixturePaths, baselineByFixture) {
  const evaluated = selection.selected.map((candidate) => {
    const key = `${row.fixture}|${candidate.fingerprint}`;
    if (!cache.has(key)) cache.set(key, probeProduct(fixturePaths.get(row.fixture), candidate));
    return { candidate, result: cache.get(key) };
  });
  const oracle = row.candidates.slice().sort(productComparator)[0];
  const failed = evaluated.find(({ result }) => result.status !== "completed");
  const baseline = baselineByFixture.get(row.fixture)?.candidates?.[0]?.product ?? null;
  const common = {
    fixture: row.fixture,
    fixtureFamily: row.fixtureFamily,
    arm: row.arm,
    policy,
    normalFinalistCount: selection.info.normal.length,
    selectedCount: selection.selected.length,
    extraEvaluations: Math.max(0, selection.selected.length - normalK),
    boundaryTriggered: selection.info.boundaryTriggered,
    densityTriggered: selection.info.densityTriggered,
    pressure: selection.info.pressure,
    boundaryClassSummary: selection.boundaryClassSummary,
    targetMembers: selection.targets.map(({ candidate, key }) => ({ family: candidate.family, fingerprint: candidate.fingerprint, candidateIndex: candidate.index, equivalenceKey: key })),
    selectedFingerprints: selection.selected.map(({ fingerprint }) => fingerprint),
    oracle: { family: oracle.family, fingerprint: oracle.fingerprint, product: oracle.product },
    baseline,
    normalPresentationMs: sum(evaluated.slice(0, normalK).map(({ result }) => result.presentationMs ?? 0)),
    completionPresentationMs: sum(evaluated.slice(normalK).map(({ result }) => result.presentationMs ?? 0)),
    normalWallMs: sum(evaluated.slice(0, normalK).map(({ result }) => result.wallMs ?? 0)),
    completionWallMs: sum(evaluated.slice(normalK).map(({ result }) => result.wallMs ?? 0)),
    productEvaluations: evaluated.length,
  };
  if (failed) return {
    ...common,
    failClosed: true,
    failure: { family: failed.result.family, error: failed.result.error ?? "Product evaluation did not complete" },
    exactBest: false,
    top3Hit: false,
    meaningfulFalseNegative: false,
    regret: 0,
    relativeRegret: 0,
    selectedBest: null,
    baselineImprovementRetained: false,
    deterministic: true,
  };
  const completed = evaluated.map(({ candidate, result }) => ({ ...candidate, product: result.product }));
  const selected = completed.slice().sort(productComparator);
  const selectedBest = selected[0];
  const top3 = row.candidates.slice().sort(productComparator).slice(0, 3);
  const regret = selectedBest.product.score - oracle.product.score;
  const relativeRegret = regret / Math.max(1, Math.abs(oracle.product.score));
  const exactBest = selected.some((candidate) => candidate.fingerprint === oracle.fingerprint);
  const top3Hit = selected.some((candidate) => top3.some((top) => top.fingerprint === candidate.fingerprint));
  const meaningfulFalseNegative = !exactBest && (relativeRegret > 0.02 || regret > 2_000
    || selectedBest.product.crossings > oracle.product.crossings
    || selectedBest.product.overlapPairs > oracle.product.overlapPairs
    || selectedBest.product.labelRouteHits > oracle.product.labelRouteHits
    || selectedBest.product.labelOverlap > oracle.product.labelOverlap);
  const oracleImprovesBaseline = Boolean(baseline && oracle.product.score < baseline.score);
  const selectedImprovesBaseline = Boolean(baseline && selectedBest.product.score < baseline.score);
  return {
    ...common,
    failClosed: false,
    exactBest,
    top3Hit,
    meaningfulFalseNegative,
    regret,
    relativeRegret,
    selectedBest: { family: selectedBest.family, fingerprint: selectedBest.fingerprint, product: selectedBest.product },
    baselineImprovementRetained: !oracleImprovesBaseline || selectedImprovesBaseline,
    deterministic: JSON.stringify(selection.ranking.slice(0, normalK).map(({ fingerprint }) => fingerprint)) === JSON.stringify(row.candidates.slice().sort(cheapComparator).slice(0, normalK).map(({ fingerprint }) => fingerprint)),
  };
}
function aggregate(results, oracleCandidateEvaluations) {
  const extra = results.map((result) => result.extraEvaluations);
  const productEvaluations = sum(results.map((result) => result.productEvaluations));
  return {
    operationCount: results.length,
    exactBestHits: results.filter((result) => result.exactBest).length,
    exactBestRecall: results.filter((result) => result.exactBest).length / Math.max(1, results.length),
    top3AnyHits: results.filter((result) => result.top3Hit).length,
    top3AnyRecall: results.filter((result) => result.top3Hit).length / Math.max(1, results.length),
    meaningfulFalseNegativeCount: results.filter((result) => result.meaningfulFalseNegative).length,
    baselineImprovementRetention: results.filter((result) => result.baselineImprovementRetained).length / Math.max(1, results.length),
    meanRegret: sum(results.map((result) => result.regret)) / Math.max(1, results.length),
    maxRegret: Math.max(0, ...results.map((result) => result.regret)),
    meanRelativeRegret: sum(results.map((result) => result.relativeRegret)) / Math.max(1, results.length),
    totalProductEvaluations: productEvaluations,
    normalFinalistEvaluations: sum(results.map((result) => result.normalFinalistCount)),
    extraCompletionEvaluations: sum(extra),
    medianExtraEvaluations: median(extra),
    p95ExtraEvaluations: percentile(extra, 0.95),
    maxExtraEvaluations: Math.max(0, ...extra),
    avoidedProductEvaluations: oracleCandidateEvaluations - productEvaluations,
    reductionRate: 1 - productEvaluations / Math.max(1, oracleCandidateEvaluations),
    triggeredOperations: results.filter((result) => result.extraEvaluations > 0).length,
    boundaryTriggeredOperations: results.filter((result) => result.boundaryTriggered).length,
    densityTriggeredOperations: results.filter((result) => result.densityTriggered).length,
    failClosedOperations: results.filter((result) => result.failClosed).length,
    measuredProductPresentationMs: sum(results.map((result) => result.normalPresentationMs + result.completionPresentationMs)),
    worstCaseOperationPresentationMs: Math.max(0, ...results.map((result) => result.normalPresentationMs + result.completionPresentationMs)),
    measuredCompletionPresentationMs: sum(results.map((result) => result.completionPresentationMs)),
    worstCaseCompletionPresentationMs: Math.max(0, ...results.map((result) => result.completionPresentationMs)),
  };
}
function exportCandidatePool() {
  if (process.env.E2R_BOUNDARY_CANDIDATE_POOL_FILE) return JSON.parse(fs.readFileSync(process.env.E2R_BOUNDARY_CANDIDATE_POOL_FILE, "utf8"));
  const run = spawnSync(process.execPath, ["tools/bounded-screening-finalist-recall1.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: operationTimeoutMs * 40,
    env: { ...process.env, E2R_SCREENING_EXPORT_CANDIDATES: sourcePool, E2R_SCREENING_SKIP_ARTIFACT: "1", E2R_SCREENING_EXTRA_FIXTURES: JSON.stringify(extraFixtures) },
  });
  if (run.status !== 0) throw new Error(`candidate pool: ${run.stderr || run.error || `exit ${run.status}`}`);
  return JSON.parse(fs.readFileSync(sourcePool, "utf8"));
}
function fixturePathById(pool) { return new Map(pool.fixtures.map((fixture) => [fixture.id, fixture.path])); }
function perturbGenerationOrder(row) {
  return { ...row, candidates: row.candidates.slice().reverse().map((candidate, index) => ({ ...candidate, index })) };
}
function classVariance(rows, cache) {
  const classes = [];
  for (const row of rows) {
    const selection = selectCandidates(row, "full-boundary");
    for (const boundaryClass of selection.boundaryClassSummary) {
      const members = boundaryClass.members.map(({ fingerprint }) => cache.get(`${row.fixture}|${fingerprint}`)).filter((result) => result?.status === "completed");
      const metrics = (key) => members.map((result) => result.product[key]).filter(Number.isFinite);
      const scores = metrics("score");
      const crossings = metrics("crossings");
      const labelRouteHits = metrics("labelRouteHits");
      const fitScales = metrics("fitScale");
      const orderedByScore = boundaryClass.members.map(({ fingerprint }) => ({ fingerprint, result: cache.get(`${row.fixture}|${fingerprint}`) })).filter(({ result }) => result?.status === "completed").sort((left, right) => left.result.product.score - right.result.product.score || compareId(left.fingerprint, right.fingerprint));
      const productBestFingerprint = row.candidates.slice().sort(productComparator)[0].fingerprint;
      const productBestIndex = orderedByScore.findIndex(({ fingerprint }) => fingerprint === productBestFingerprint);
      classes.push({
        fixture: row.fixture,
        arm: row.arm,
        equivalenceKey: boundaryClass.key,
        classSize: boundaryClass.size,
        normalMemberCount: boundaryClass.normalMemberCount,
        outsideMemberCount: boundaryClass.outsideMemberCount,
        productScoreRange: Math.max(0, ...scores) - Math.min(...scores),
        crossingRange: Math.max(0, ...crossings) - Math.min(...crossings),
        labelRouteHitsRange: Math.max(0, ...labelRouteHits) - Math.min(...labelRouteHits),
        fitScaleRange: Math.max(0, ...fitScales) - Math.min(...fitScales),
        productBestPositionWithinClass: productBestIndex >= 0 ? productBestIndex + 1 : null,
      });
    }
  }
  return classes;
}

const pool = exportCandidatePool();
const fixturePaths = fixturePathById(pool);
const rows = pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length);
const oldRows = rows.filter((row) => !row.fixture.startsWith("independent-"));
const independentRows = rows.filter((row) => row.fixture.startsWith("independent-"));
const baselineByFixture = new Map(pool.rows.filter((row) => row.arm === "direct-current" && row.candidates.length).map((row) => [row.fixture, row]));
const oracleCandidateEvaluations = sum(rows.map((row) => row.candidates.length));
const cache = new Map();
const policyDefinitions = [
  ["cheap-k4", 0],
  ["density-one-index", 1],
  ["full-boundary", 0],
  ...caps.map((cap) => [`capped-boundary-${cap}`, cap]),
];
const resultsByPolicy = {};
for (const [policy, cap] of policyDefinitions) {
  resultsByPolicy[policy] = rows.map((row) => evaluate(row, selectCandidates(row, policy, cap), policy, cache, fixturePaths, baselineByFixture));
}
const orderAudit = {};
for (const [policy, cap] of policyDefinitions) {
  const original = rows.map((row) => selectCandidates(row, policy, cap).selected.map(({ fingerprint }) => fingerprint));
  const perturbed = rows.map((row) => selectCandidates(perturbGenerationOrder(row), policy, cap).selected.map(({ fingerprint }) => fingerprint));
  const sameSet = (left, right) => JSON.stringify(left.slice().sort(compareId)) === JSON.stringify(right.slice().sort(compareId));
  orderAudit[policy] = {
    invariantOperations: original.filter((selected, index) => sameSet(selected, perturbed[index])).length,
    operationCount: rows.length,
    invariant: original.every((selected, index) => sameSet(selected, perturbed[index])),
    comparison: "selected candidate fingerprint set; class enumeration order is not semantic",
    differences: rows.map((row, index) => ({ fixture: row.fixture, arm: row.arm, original: original[index], perturbed: perturbed[index] })).filter((entry) => !sameSet(entry.original, entry.perturbed)),
  };
}
const policies = Object.fromEntries(Object.entries(resultsByPolicy).map(([policy, results]) => [policy, {
  aggregate: aggregate(results, oracleCandidateEvaluations),
  old: aggregate(results.filter((result) => !result.fixture.startsWith("independent-")), sum(oldRows.map((row) => row.candidates.length))),
  independent: aggregate(results.filter((result) => result.fixture.startsWith("independent-")), sum(independentRows.map((row) => row.candidates.length))),
  results,
}]));
const variance = classVariance(rows, cache);
const full = policies["full-boundary"].aggregate;
const cappedClosed = caps.find((cap) => {
  const policy = policies[`capped-boundary-${cap}`];
  return policy.aggregate.meaningfulFalseNegativeCount === 0 && orderAudit[`capped-boundary-${cap}`].invariant && policy.aggregate.failClosedOperations === 0;
}) ?? null;
const fullClosed = full.meaningfulFalseNegativeCount === 0 && orderAudit["full-boundary"].invariant && full.failClosedOperations === 0;
const fullCostBounded = full.maxExtraEvaluations <= 12 && full.reductionRate >= 0.25;
let classification;
if (fullClosed && fullCostBounded) classification = "A. BOUNDARY CLASS COMPLETION ESTABLISHED WITH ACCEPTABLE COST";
else if (fullClosed) classification = "B. QUALITY CLOSED / COST ENVELOPE TOO HIGH";
  else if (cappedClosed !== null) classification = "C. CAPPED COMPLETION ESTABLISHED / FULL COMPLETION OR GENERALIZATION OPEN";
else if (policies["full-boundary"].aggregate.boundaryTriggeredOperations > 0) classification = "D. BOUNDARY CLASS TRIGGER INSUFFICIENT";
else classification = "E. MULTI-STAGE SELECTOR ARCHITECTURE NOT JUSTIFIED";
const artifact = {
  contract: "LIAISONSCAPE-BOUNDARY-EQUIVALENCE-CLASS-PRODUCT-COMPLETION-v1",
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  sourceBoundary: "Existing candidate families and current Product-authoritative presentation are retained. Boundary completion changes only which existing candidates are evaluated; it does not move routing, endpoint-plan, Parallel / Incident, labels, Self-loop, viewport, or Product selection authority.",
  architecture: {
    stages: ["existing candidate generation", "cheap lexicographic K=4", "boundary equivalence-class detection", "full or capped Product-authoritative class completion", "Product metric selection"],
    normalFinalistBudget: normalK,
    capCandidates: caps,
    equivalenceDefinition: "six-decimal quantized vector of crossings, separation, label-span, coarse corridor, angular, extent, and edge-spread features; boundary class requires size >= K, at least one K=4 member, and at least one outside member",
    classCompletionPolicy: "complete every outside member of every boundary class; no density gate",
    stableCapPolicy: "outside members ordered by canonical quantized Node-position signature, then family and fingerprint; no candidate-generation index and no Product metric",
    previousPolicy: "density occupancy plus one lowest candidate-generation-index outside member",
    selectionRule: "minimum current Product-authoritative score, then crossings/family/fingerprint deterministic tie-break",
    costBoundDefinition: "tested full completion is called bounded when max extra evaluations <= 12 per operation and aggregate Product evaluation reduction >= 25%; this is a research envelope, not a production SLA",
  },
  controls: {
    extraFixtures,
    operationCount: rows.length,
    oldOperationCount: oldRows.length,
    independentOperationCount: independentRows.length,
  },
  policies,
  classVariance: variance,
  orderAudit,
  failureSafety: {
    classificationRequiresFailClosedZero: true,
    injectionMode: "E2R_BOUNDARY_INJECT_PRODUCT_FAILURE=1",
    normalFailClosedOperations: full.failClosedOperations,
  },
  disposition: {
    classification,
    boundaryEquivalenceTrigger: full.boundaryTriggeredOperations > 0 ? "DIAGNOSTICALLY SUPPORTED" : "NOT ESTABLISHED",
    fullCompletion: fullClosed ? "QUALITY CLOSED IN TESTED SET" : "NOT CLOSED",
    fullCompletionCost: fullCostBounded ? "WITHIN TESTED BOUNDED ENVELOPE" : "ENVELOPE OPEN",
    cappedCompletion: cappedClosed === null ? "NOT CLOSED" : `CAP ${cappedClosed} CLOSED IN TESTED SET`,
    multiStageSelector: classification.startsWith("A.") ? "DIAGNOSTICALLY PROMISING / PRODUCTION INTEGRATION NOT ESTABLISHED" : "DIAGNOSTICALLY BOUNDED / ARCHITECTURE OPEN",
    qualitySolver: "HOLD / NOT ESTABLISHED",
    productIntegration: "HOLD",
    productionProvider: "NOT ESTABLISHED",
    actualProductVisualEvaluation: "NOT READY",
    humanReview: "NOT READY",
    initialLayoutReleaseBlocker: "OPEN",
  },
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "benchmark-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "benchmark-result-summary.json")), classification, full: policies["full-boundary"].aggregate, capped: Object.fromEntries(caps.map((cap) => [cap, policies[`capped-boundary-${cap}`].aggregate])), orderInvariant: Object.fromEntries(Object.entries(orderAudit).map(([policy, result]) => [policy, result.invariant])), classVarianceCount: variance.length }, null, 2));
