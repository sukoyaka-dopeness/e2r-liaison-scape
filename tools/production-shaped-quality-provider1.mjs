import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beginProvider, createProviderState, providerEnvelope, providerExecutionContract, requestProviderCancellation, stepProvider } from "../experimental/production-shaped-quality-provider1/contract.mjs";

const root = process.cwd();
const outputDir = process.env.E2R_PROVIDER_OUTPUT_DIR ? path.resolve(root, process.env.E2R_PROVIDER_OUTPUT_DIR) : path.join(root, "experimental", "production-shaped-quality-provider1");
const poolPath = path.join(os.tmpdir(), "e2r-production-shaped-quality-provider-candidate-pool.json");
const poolOverride = process.env.E2R_PROVIDER_CANDIDATE_POOL_FILE;
const extraFixtures = [
  { id: "independent-k6-7", family: "independent-dense-near-threshold", path: "synthetic:k6-7" },
  { id: "independent-k7-6", family: "independent-dense-transpose", path: "synthetic:k7-6" },
  { id: "independent-k8-7", family: "independent-dense-wide", path: "synthetic:k8-7" },
  { id: "independent-k5-8-minus-one", family: "independent-edge-perturbation", path: "synthetic:k5-8-minus-one" },
];
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function compactProduct(product) { return { score: finite(product?.score, Infinity), crossings: finite(product?.crossings, Infinity), labelRouteHits: finite(product?.labelRouteHits, Infinity), labelOverlap: finite(product?.labelOverlap, Infinity), overlapPairs: finite(product?.overlapPairs, Infinity), fitScale: finite(product?.fitScale, 0) }; }
function exportPool() {
  if (poolOverride) return JSON.parse(fs.readFileSync(poolOverride, "utf8"));
  const startedAt = performance.now();
  const run = spawnSync(process.execPath, ["tools/bounded-screening-finalist-recall1.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: 900_000,
    env: { ...process.env, E2R_SCREENING_EXPORT_CANDIDATES: poolPath, E2R_SCREENING_SKIP_ARTIFACT: "1", E2R_SCREENING_EXTRA_FIXTURES: JSON.stringify(extraFixtures) },
  });
  if (run.status !== 0) throw new Error(`candidate generation failed: ${run.stderr || run.error || `exit ${run.status}`}`);
  return { pool: JSON.parse(fs.readFileSync(poolPath, "utf8")), wallMs: performance.now() - startedAt, source: "existing bounded-screening candidate families" };
}
function fixturePaths(pool) { return new Map(pool.fixtures.map((fixture) => [fixture.id, fixture.path])); }
function probeProduct(fixturePath, candidate) {
  const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixturePath], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: 20_000,
    killSignal: "SIGTERM",
    env: { ...process.env, E2R_PRODUCT_PROBE_POSITIONS_FILE: writePositions(candidate), E2R_PRODUCT_PROBE_FAMILY: candidate.family, E2R_PRESENTATION_COST_PROFILE: "1", E2R_GLOBAL_SPACING_STAGE2: "off" },
  });
  if (run.error?.code === "ETIMEDOUT" || run.status !== 0) return { status: "failed", error: run.error?.code === "ETIMEDOUT" ? "timeout" : run.stderr || run.error?.message || `exit ${run.status}`, telemetry: { wallMs: 0, presentationMs: 0 } };
  const output = JSON.parse(run.stdout);
  return { status: "completed", product: compactProduct(output.candidates?.[0]?.metrics), telemetry: { wallMs: finite(output.profile?.wallMs), presentationMs: finite(output.profile?.presentationMs), fullPresentationEvaluations: output.profile?.fullPresentationEvaluations ?? 1 } };
}
function writePositions(candidate) {
  const file = path.join(os.tmpdir(), `e2r-provider-position-${process.pid}-${candidate.fingerprint}.json`);
  fs.writeFileSync(file, JSON.stringify({ family: candidate.family, positions: candidate.positions }));
  return file;
}
function snapshot(row) {
  return { datasetIdentity: `provider:${row.fixture}`, datasetRevision: 1, graphFingerprint: row.fixture, sessionPositions: row.candidates[0].positions, storedCoordinateFingerprint: "none", adoptedCoordinateFingerprint: "none", coordinateOwnership: Object.fromEntries(Object.keys(row.candidates[0].positions).map((id) => [id, "derived"])), manualRelationRouteFingerprint: "routes", manualSelfLoopFingerprint: "loops", manualRelationLabelFingerprint: "relation-labels", manualNodeLabelFingerprint: "node-labels", locale: "en", algorithmVersion: "production-shaped-provider-v1", budgetPolicy: { maxWorkUnits: 1_000 } };
}
function runOperation(row, paths, cache) {
  const input = snapshot(row);
  const state = beginProvider(createProviderState(), input);
  const envelope = providerEnvelope(state);
  const phaseMs = {};
  let current = state;
  while (current.active) {
    const phase = current.active.phase;
    const startedAt = performance.now();
    current = stepProvider(current, envelope, {
      generateCandidates: () => row.candidates.map((candidate) => ({ ...candidate, cheapFeatures: candidate.features })),
      verifyCandidate: (candidate) => {
        const key = `${row.fixture}|${candidate.fingerprint}`;
        if (!cache.has(key)) cache.set(key, probeProduct(paths.get(row.fixture), candidate));
        return cache.get(key);
      },
    }, { currentSnapshot: input, normalK: 4, maxWorkUnits: 1_000 });
    phaseMs[phase] = (phaseMs[phase] ?? 0) + (performance.now() - startedAt);
  }
  return { fixture: row.fixture, fixtureFamily: row.fixtureFamily, arm: row.arm, outcome: current.lastOutcome, phaseMs, verifiedProductEvaluations: current.lastOutcome?.result?.finalistCount ?? 0, failClosed: current.lastOutcome?.status !== "completed" };
}
function aggregate(results) {
  return { operationCount: results.length, completed: results.filter((result) => result.outcome?.status === "completed").length, failClosed: results.filter((result) => result.failClosed).length, providerProductEvaluations: sum(results.map((result) => result.verifiedProductEvaluations)), candidateGenerationPhaseMs: sum(results.map((result) => result.phaseMs["candidate-generation"] ?? 0)), cheapScreenPhaseMs: sum(results.map((result) => result.phaseMs["cheap-screen"] ?? 0)), verificationPhaseMs: sum(results.map((result) => result.phaseMs["product-verification"] ?? 0)), selectionPhaseMs: sum(results.map((result) => result.phaseMs["final-selection"] ?? 0)) };
}
const generated = exportPool();
const pool = generated.pool ?? generated;
const paths = fixturePaths(pool);
const rows = pool.rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length);
const cache = new Map();
const results = rows.map((row) => runOperation(row, paths, cache));
const expected = JSON.parse(fs.readFileSync(path.join(root, "experimental", "boundary-equivalence-class-product-completion1", "benchmark-result-summary.json"), "utf8"));
const expectedByOperation = new Map(expected.policies["full-boundary"].results.map((result) => [`${result.fixture}|${result.arm}`, result.selectedBest?.fingerprint ?? null]));
const semanticEquivalence = results.map((result) => ({ fixture: result.fixture, arm: result.arm, providerStatus: result.outcome?.status, providerFingerprint: result.outcome?.result?.fingerprint ?? null, fixedFingerprint: expectedByOperation.get(`${result.fixture}|${result.arm}`) ?? null, equal: (result.outcome?.result?.fingerprint ?? null) === (expectedByOperation.get(`${result.fixture}|${result.arm}`) ?? null) }));
const cancellationInput = snapshot(rows[0]);
let cancelled = beginProvider(createProviderState(), cancellationInput);
const cancellationEnvelope = providerEnvelope(cancelled);
cancelled = requestProviderCancellation(cancelled);
cancelled = stepProvider(cancelled, cancellationEnvelope, { generateCandidates: () => [], verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: cancellationInput });
const budgetInput = snapshot(rows[0]);
let exhausted = beginProvider(createProviderState(), budgetInput);
const exhaustedEnvelope = providerEnvelope(exhausted);
exhausted = stepProvider(exhausted, exhaustedEnvelope, { generateCandidates: () => rows[0].candidates, verifyCandidate: () => ({ status: "completed", product: { score: 0 } }) }, { currentSnapshot: budgetInput, maxWorkUnits: 0 });
const artifact = {
  contract: providerExecutionContract.contract,
  diagnosticOnly: true,
  sourceBoundary: "The seam owns proposal execution only. Existing candidate families are retained; current Product-authoritative verification and final selection remain the authority. No App.tsx, Product default, Dataset, persistence, routing, labels, endpoint-plan, Parallel / Incident, Self-loop, or viewport integration is performed.",
  candidateSource: { selectedComposition: ["structural-native-v3", "frontier-adaptive-12"], reason: "full boundary completion was the only tested policy that closed both old and independent controls; no individual family is adopted as a production solver", generationSource: generated.source ?? "existing candidate pool", generationWallMs: generated.wallMs ?? null, generationEvaluationCoupling: "existing diagnostic candidate harness remains coupled internally; provider seam does not relabel this as pure generation latency" },
  execution: { phases: providerExecutionContract.phases, normalK: 4, boundaryCompletion: "full outside-member completion", transport: providerExecutionContract.transport, authority: providerExecutionContract.authority },
  aggregate: aggregate(results),
  results,
  semanticEquivalence: { operationCount: semanticEquivalence.length, exactMatches: semanticEquivalence.filter((item) => item.equal).length, allMatch: semanticEquivalence.every((item) => item.equal), samples: semanticEquivalence.filter((item) => ["lighthouse-en", "dense-k7-7", "independent-k6-7"].includes(item.fixture)) },
  cancellation: { status: cancelled.lastOutcome?.status, resultExposed: Boolean(cancelled.lastOutcome?.result) },
  budgetExhaustion: { status: exhausted.lastOutcome?.status, resultExposed: Boolean(exhausted.lastOutcome?.result) },
  browserCampaign: "see browser-result-summary.json; browser campaign measures the same phase contract with current source Product verification and is not Product visual acceptance",
  disposition: { providerExecution: "PRODUCTION-SHAPED SEAM DIAGNOSTICALLY ESTABLISHED", browserCost: "MEASURED / MAIN-THREAD SLICE OPEN", mainThreadViability: "WORKER OR FURTHER EXECUTION STUDY REQUIRED FOR DENSE QUALITY WORK", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", actualProductVisualEvaluation: "NOT READY", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" },
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "provider-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "provider-result-summary.json")), aggregate: artifact.aggregate, semanticEquivalence: artifact.semanticEquivalence, cancellation: artifact.cancellation, budgetExhaustion: artifact.budgetExhaustion }, null, 2));
