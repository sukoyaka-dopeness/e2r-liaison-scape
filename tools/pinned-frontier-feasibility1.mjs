import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import {
  buildPresentationSnapshot,
  computePinnedFrontierProductProposals,
  evaluateProductPresentation,
  generatePinnedFrontierCandidateSet,
  positionsFingerprint,
  snapshotFingerprint,
  validatePinnedFrontierResult,
} from "../experimental/pinned-frontier-feasibility1/core.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG } from "../experimental/frontier-product-worker-execution-proof1/core.ts";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "pinned-frontier-feasibility1");
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function syntheticDense() {
  const ids = Array.from({ length: 7 }, (_, index) => `dense-${index + 1}`);
  return {
    version: "1.0",
    entities: ids.map((id) => ({ id, name: id })),
    events: [],
    relations: ids.flatMap((sourceId, index) => ids.slice(index + 1).map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "dense" }))),
  };
}

function syntheticParallelSelfLoop() {
  return {
    version: "1.0",
    entities: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: `Node ${id}` })),
    events: [],
    relations: [
      { id: "self-a", sourceId: "a", targetId: "a", name: "loops" },
      { id: "ab-1", sourceId: "a", targetId: "b", name: "parallel one" },
      { id: "ab-2", sourceId: "a", targetId: "b", name: "parallel two" },
      { id: "bc", sourceId: "b", targetId: "c", name: "next" },
      { id: "cd", sourceId: "c", targetId: "d", name: "next" },
      { id: "de", sourceId: "d", targetId: "e", name: "next" },
      { id: "ea", sourceId: "e", targetId: "a", name: "back" },
    ],
  };
}

function workerGraph(dataset) {
  const graph = buildEntityGraph(dataset);
  return {
    nodes: graph.nodes.map((node) => ({ id: node.id, label: node.label, description: node.description, x: node.x, y: node.y })),
    edges: graph.edges.map((edge) => ({ ...edge, label: edge.id })),
  };
}

function configForPins() {
  return { limit: 6, featureMode: "global", globalSpacingScale: 0.88, globalSpacingY: 1.12, finalCanonicalization: "round-once", variantCount: 4, relaxationRounds: 12 };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function runWorker(job) {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../experimental/pinned-frontier-feasibility1/worker.mjs", import.meta.url), { workerData: job, execArgv: process.execArgv });
    const messages = [];
    worker.on("message", (message) => {
      messages.push(message);
      if (message.kind === "completed" || message.kind === "failed") resolve({ messages, terminal: message });
    });
    worker.on("error", reject);
    worker.on("exit", (code) => { if (code !== 0) reject(new Error(`pinned feasibility worker exited ${code}`)); });
  });
}

function pinSets(ids, baselinePositions) {
  const shifted = (id, source) => ({ x: baselinePositions[id].x + 180, y: baselinePositions[id].y + 64, source });
  const first = ids[0];
  const middle = ids[Math.floor(ids.length / 2)];
  const last = ids.at(-1);
  return [
    { name: "no-pins", anchors: {} },
    { name: "one-saved", anchors: { [first]: shifted(first, "saved") } },
    { name: "few-staged", anchors: { [first]: shifted(first, "staged"), [middle]: shifted(middle, "saved") } },
    { name: "many-mixed", anchors: Object.fromEntries(ids.slice(0, Math.max(1, ids.length - 2)).map((id, index) => [id, shifted(id, index % 2 ? "staged" : "saved")])) },
    { name: "one-movable", anchors: Object.fromEntries(ids.slice(0, -1).map((id, index) => [id, shifted(id, index % 2 ? "staged" : "saved")])) },
    { name: "all-pinned", anchors: Object.fromEntries(ids.map((id, index) => [id, shifted(id, index % 2 ? "staged" : "saved")])) },
  ];
}

function timingFor(input, config, repetitions = 3) {
  const candidateTimes = [];
  const productTimes = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const candidateStarted = performance.now();
    const candidateSet = generatePinnedFrontierCandidateSet(input, config);
    candidateTimes.push(performance.now() - candidateStarted);
    const productStarted = performance.now();
    if (candidateSet.status === "completed") for (const candidate of candidateSet.representatives) evaluateProductPresentation(input.graph, candidate.positions, input.presentationSnapshot);
    productTimes.push(performance.now() - productStarted);
  }
  return { repetitions, candidateGenerationMsMedian: median(candidateTimes), productEvaluationMsMedian: median(productTimes), candidateGenerationMs: candidateTimes, productEvaluationMs: productTimes };
}

function runFixture(fixture) {
  const graph = workerGraph(fixture.dataset);
  const emptySnapshot = buildPresentationSnapshot(graph, Object.fromEntries(graph.nodes.map((node, index) => [node.id, { x: index * 260, y: 0 }])));
  const noSnapshot = { edgeCurveOffsets: {}, selfLoopOverrides: {}, previousNodeLabelPlacements: {}, previousRelationLabelPlacements: {}, manualNodeLabelOffsets: {}, manualRelationLabelAnchors: {}, previousAutomaticRoutes: {} };
  const baseline = computeFrontierProductProposals(graph, DEFAULT_FRONTIER_WORKER_CONFIG);
  if (!baseline.selected) throw new Error(`${fixture.id}: accepted no-pin baseline did not select a result`);
  const positions = baseline.selected.positions;
  const snapshot = buildPresentationSnapshot(graph, positions);
  const snapshotId = digest(snapshotFingerprint(snapshot));
  const inputBase = { graph, initialPositions: positions, presentationSnapshot: snapshot };
  const config = configForPins();
  const rows = [];
  const ids = graph.nodes.map(({ id }) => id).sort();
  for (const pinSet of pinSets(ids, positions)) {
    const input = { ...inputBase, fixedAnchors: pinSet.anchors };
    const started = performance.now();
    const result = computePinnedFrontierProductProposals(input, pinSet.name === "no-pins" ? DEFAULT_FRONTIER_WORKER_CONFIG : config);
    const elapsedMs = performance.now() - started;
    const validation = validatePinnedFrontierResult(result, input);
    rows.push({
      fixture: fixture.id,
      pinCase: pinSet.name,
      fixedAnchorCount: Object.keys(pinSet.anchors).length,
      movableNodeCount: ids.length - Object.keys(pinSet.anchors).length,
      anchorSources: Object.fromEntries(Object.entries(pinSet.anchors).map(([id, anchor]) => [id, anchor.source])),
      status: result.candidateSet.status,
      candidateCount: result.candidateSet.representatives.length,
      selectedFamily: result.selected?.family ?? null,
      selectedPositionFingerprint: result.selectedPositionFingerprint,
      exactPinnedCoordinates: validation.ok,
      finiteCompleteResult: validation.ok,
      elapsedMs: Math.round(elapsedMs * 1000) / 1000,
      selectedMetrics: result.selected?.metrics ?? null,
      snapshotFingerprint: snapshotId,
      structuredClone: (() => { try { structuredClone({ input, result }); return true; } catch { return false; } })(),
    });
  }
  const noPinExperiment = computePinnedFrontierProductProposals({ ...inputBase, fixedAnchors: {}, presentationSnapshot: noSnapshot }, DEFAULT_FRONTIER_WORKER_CONFIG);
  const noPinParity = noPinExperiment.selectedPositionFingerprint === baseline.selectedPositionFingerprint
    && noPinExperiment.candidateSet.representatives.map(({ identity }) => identity).join("|") === baseline.candidateSet.representatives.map(({ identity }) => identity).join("|");
  const onePin = rows.find((row) => row.pinCase === "one-saved");
  const onePinInput = { ...inputBase, fixedAnchors: pinSets(ids, positions)[1].anchors };
  const workerProbe = onePin ? runWorker({ operationId: `pinned-feasibility-${fixture.id}`, generation: 1, snapshotIdentity: snapshotId, input: onePinInput, config }).then((workerResult) => ({ messages: workerResult.messages.map(({ kind, operationId, generation, snapshotIdentity }) => ({ kind, operationId, generation, snapshotIdentity })), terminal: { kind: workerResult.terminal.kind, validation: workerResult.terminal.kind === "completed" ? validatePinnedFrontierResult(workerResult.terminal.result, onePinInput) : workerResult.terminal.failure } })) : Promise.resolve(null);
  return workerProbe.then((worker) => ({
    fixture: fixture.id,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length, selfLoops: graph.edges.filter((edge) => edge.sourceId === edge.targetId).length, parallelEdges: graph.edges.filter((edge) => edge.parallelCount > 1).length },
    presentationSnapshot: { fingerprint: snapshotFingerprint(snapshot), nonEmpty: Object.values(snapshot).some((value) => Object.keys(value).length > 0), edgeCurveOffsets: Object.keys(snapshot.edgeCurveOffsets).length, selfLoopOverrides: Object.keys(snapshot.selfLoopOverrides).length, previousNodeLabels: Object.keys(snapshot.previousNodeLabelPlacements).length, previousRelationLabels: Object.keys(snapshot.previousRelationLabelPlacements).length, manualNodeLabels: Object.keys(snapshot.manualNodeLabelOffsets).length, manualRelationLabels: Object.keys(snapshot.manualRelationLabelAnchors).length, previousRoutes: Object.keys(snapshot.previousAutomaticRoutes).length },
    noPinParity,
    baselineSelectedPositionFingerprint: baseline.selectedPositionFingerprint,
    experimentNoPinSelectedPositionFingerprint: noPinExperiment.selectedPositionFingerprint,
    rows,
    runtime: timingFor({ ...inputBase, fixedAnchors: pinSets(ids, positions)[2].anchors }, config),
    worker,
  }));
}

const fixtures = [
  { id: "apollo-11-en", dataset: JSON.parse(fs.readFileSync(path.join(root, "..", "e2r-spec", "examples", "apollo-11-mission.en.e2r.json"), "utf8")) },
  { id: "dense-k7-7", dataset: syntheticDense() },
  { id: "parallel-self-loop-control", dataset: syntheticParallelSelfLoop() },
];

const rows = [];
for (const fixture of fixtures) rows.push(await runFixture(fixture));
const artifact = {
  contract: "E2R-LIAISONSCAPE-PINNED-FRONTIER-FEASIBILITY-1",
  diagnosticOnly: true,
  sourceRevision: `${sourceRevision} + working-tree diagnostic additions`,
  classification: "C. PINNED FRONTIER HARD CONSTRAINT ESTABLISHED / PRODUCT QUALITY INSUFFICIENT ON DENSE CONTROL; EXPLICIT AUTO LAYOUT QUALITY GATE REMAINS OPEN",
  generator: "experimental/pinned-frontier-feasibility1/core.ts::generatePinnedFrontierCandidateSet",
  productEvaluator: "src/graph-presentation.ts::deriveBoundedAutomaticPresentation",
  workerBoundary: "experimental/pinned-frontier-feasibility1/worker.mjs",
  inputContract: "graph + complete finite initialPositions + fixedAnchors[id]={x,y,source:saved|staged} + serializable Product presentation snapshot",
  hardConstraint: "fixed anchors are installed before bounded movable-node relaxation and are never translated/scaled/overwritten; final validation requires exact coordinate equality",
  pinnedAlgorithm: "anchor-aware-relaxation-v1 diagnostic candidate construction; no-pin cases delegate to the current shared Frontier generator; pinned cases are not claimed to be the reviewed Frontier-12 lineage",
  noPinParity: "shared generateFrontierCandidateSet plus existing Product selection/finalization; no-pin selected fingerprint and representative identities are compared to the accepted Worker core",
  productBoundary: "routing, Relation-label, Node-label, Self-loop, previous routes and manual presentation state remain Product-owned and are supplied as an operation-local snapshot",
  rows,
  allNoPinParity: rows.every((row) => row.noPinParity),
  allWorkerCompleted: rows.every((row) => row.worker?.terminal.kind === "completed"),
  allPinnedExact: rows.every((row) => row.rows.every((caseRow) => caseRow.exactPinnedCoordinates)),
  allSnapshotsNonEmpty: rows.every((row) => row.presentationSnapshot.nonEmpty),
  operationBoundaryReadiness: "hard-constraint, serializability, Product snapshot, and Worker transport boundary proven; general Explicit Auto Layout quality/release acceptance remains open",
  productionWiring: false,
  humanReview: "unchanged QUALIFIED; not reopened",
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
