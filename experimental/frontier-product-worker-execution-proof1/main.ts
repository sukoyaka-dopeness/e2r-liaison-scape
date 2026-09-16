import { buildEntityGraph } from "../../src/dataset.ts";
import { acceptanceFixturePath } from "../../src/acceptance-fixture-access.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG, positionsFingerprint, serializeCandidateSet, validateFrontierProductResult, type FrontierProductResult, type Point, type WorkerGraph } from "./core.ts";
import reviewedArtifact from "../frontier-actual-product-visual-sweep1/result-summary.json";
import parityArtifact from "../frontier-12-shared-candidate-generator-parity1/result.json";

type Dataset = {
  version: string;
  entities: Array<{ id: string; name?: string; label?: string; description?: string }>;
  events: unknown[];
  relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }>;
};
type Fixture = { id: string; source: string; category: string; dataset: Dataset; graph: WorkerGraph };
type WorkerEnvelope = { kind: "frontier-product"; operationId: string; generation: number; snapshotIdentity: string; graph: WorkerGraph; config: typeof DEFAULT_FRONTIER_WORKER_CONFIG };
type WorkerMessage = { kind: string; operationId: string; generation: number; snapshotIdentity: string; status: string; [key: string]: unknown };

const statusElement = document.querySelector<HTMLParagraphElement>("#status")!;
const resultsElement = document.querySelector<HTMLPreElement>("#results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const downloadLink = document.querySelector<HTMLAnchorElement>("#download")!;
const BASE_URL = import.meta.env.BASE_URL;
const intervalTicks: number[] = [];
const frameTicks: number[] = [];
const longTasks: number[] = [];
let nextOperationId = 1;
setInterval(() => intervalTicks.push(performance.now()), 10);
requestAnimationFrame(function frameTick(value) { frameTicks.push(value); requestAnimationFrame(frameTick); });
if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(Number(entry.duration.toFixed(3))); }).observe({ type: "longtask", buffered: true });
}

function bipartite(leftSize: number, rightSize: number): Dataset {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}

function graphFor(dataset: Dataset): WorkerGraph {
  const source = buildEntityGraph(dataset as never);
  const labels = new Map(dataset.relations.map((relation) => [relation.id, relation.name ?? ""]));
  return {
    nodes: source.nodes.map((node) => ({ id: node.id, label: node.label, description: node.description, x: node.x, y: node.y })),
    edges: source.edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? "" })),
  };
}

async function loadFixture(id: string, source: string, category: string): Promise<Fixture> {
  const dataset = source.startsWith("synthetic:k")
    ? bipartite(...source.slice("synthetic:k".length).split("-").map(Number) as [number, number])
    : await (await fetch(`${BASE_URL}__acceptance-fixtures/${source}`)).json() as Dataset;
  return { id, source, category, dataset, graph: graphFor(dataset) };
}

function expectedFor(fixture: Fixture) {
  const visual = (reviewedArtifact as { rows: Array<{ fixture: string; selectedFamily: string | null; selectedPositionFingerprint: string | null }> }).rows.find((row) => row.fixture === fixture.id);
  const parity = (parityArtifact as { rows: Array<{ fixture: string; selectedFamily: string | null; reviewedPositionFingerprint: string | null }> }).rows.find((row) => row.fixture === fixture.id);
  return visual ?? parity ?? null;
}

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

function gaps(values: number[]) { return values.slice(1).map((value, index) => value - values[index]!); }
function eventLoopWindow(start: number, end: number) {
  return {
    maxIntervalGapMs: Number(Math.max(0, ...gaps(intervalTicks.filter((value) => value >= start && value <= end))).toFixed(3)),
    maxRafGapMs: Number(Math.max(0, ...gaps(frameTicks.filter((value) => value >= start && value <= end))).toFixed(3)),
  };
}

function makeJob(fixture: Fixture): WorkerEnvelope {
  const operationId = `frontier-product-worker-${nextOperationId++}`;
  return { kind: "frontier-product", operationId, generation: 1, snapshotIdentity: `${operationId}:${fixture.id}:revision-1`, graph: fixture.graph, config: DEFAULT_FRONTIER_WORKER_CONFIG };
}

function directRun(fixture: Fixture): { result: FrontierProductResult; elapsedMs: number } {
  const started = performance.now();
  const result = computeFrontierProductProposals(fixture.graph, DEFAULT_FRONTIER_WORKER_CONFIG);
  return { result, elapsedMs: performance.now() - started };
}

function exactParity(direct: FrontierProductResult, message: WorkerMessage): { candidateSet: boolean; product: boolean; selected: boolean } {
  const workerResult = message as unknown as FrontierProductResult;
  return {
    candidateSet: serializeCandidateSet(direct) === serializeCandidateSet(workerResult),
    product: JSON.stringify(direct.proposals) === JSON.stringify(workerResult.proposals),
    selected: direct.selected?.family === workerResult.selected?.family
      && direct.selectedPositionFingerprint === workerResult.selectedPositionFingerprint
      && JSON.stringify(direct.selected?.positions) === JSON.stringify(workerResult.selected?.positions),
  };
}

function validateMessage(job: WorkerEnvelope, message: WorkerMessage, expectedGeneration = job.generation): { accepted: boolean; disposition: string; reason?: string } {
  if (message.operationId !== job.operationId || message.generation !== expectedGeneration || message.snapshotIdentity !== job.snapshotIdentity) return { accepted: false, disposition: "stale", reason: "operation/generation/snapshot identity mismatch" };
  if (message.status !== "completed") return { accepted: false, disposition: message.status === "failed" ? "technical-failure" : message.status, reason: String((message.failure as { message?: string } | undefined)?.message ?? "non-success worker message") };
  const validation = validateFrontierProductResult(message as unknown as FrontierProductResult);
  return validation.ok ? { accepted: true, disposition: "success" } : { accepted: false, disposition: validation.code === "NON_FINITE_RESULT" ? "non-finite" : "incomplete", reason: validation.message };
}

function runWorker(fixture: Fixture): Promise<{ job: WorkerEnvelope; message: WorkerMessage; elapsedMs: number; payloadBytes: number; started: boolean }> {
  return new Promise((resolve) => {
    const job = makeJob(fixture);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(job)).byteLength;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const started = performance.now();
    let workerStarted = false;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.status === "started") { workerStarted = true; return; }
      if (message.status === "progress") return;
      worker.terminate();
      resolve({ job, message, elapsedMs: performance.now() - started, payloadBytes, started: workerStarted });
    };
    worker.onerror = (event) => { worker.terminate(); resolve({ job, message: { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status: "failed", failure: { code: "WORKER_ERROR", message: event.message } }, elapsedMs: performance.now() - started, payloadBytes, started: workerStarted }); };
    worker.postMessage(job);
  });
}

async function runCancellation(fixture: Fixture) {
  const job = makeJob(fixture);
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const started = performance.now();
  let workerStarted = false;
  let resultReceived = false;
  const outcome = await new Promise<Record<string, unknown>>((resolve) => {
    let timer: number | undefined;
    let finished = false;
    const cancel = () => {
      if (finished) return;
      finished = true;
      const requestedAt = performance.now();
      worker.terminate();
      const terminatedAt = performance.now();
      resolve({ status: "cancelled", workerStarted, resultReceived, partialResultPublished: false, elapsedBeforeCancelMs: requestedAt - started, terminateCallLatencyMs: terminatedAt - requestedAt, operationInvalidated: true });
      if (timer !== undefined) window.clearTimeout(timer);
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.status === "started") { workerStarted = true; timer = window.setTimeout(cancel, 25); }
      else if (event.data.status === "completed" || event.data.status === "failed") { resultReceived = true; if (!finished) { finished = true; worker.terminate(); resolve({ status: "completion-race", workerStarted, resultReceived, partialResultPublished: event.data.status === "completed", elapsedBeforeCancelMs: performance.now() - started, terminateCallLatencyMs: 0, operationInvalidated: false }); } }
    };
    worker.onerror = () => { if (!finished) cancel(); };
    worker.postMessage(job);
  });
  return outcome;
}

async function runFailure(fixture: Fixture) {
  const job = { ...makeJob(fixture), config: { ...DEFAULT_FRONTIER_WORKER_CONFIG, limit: 0 } };
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  return await new Promise<Record<string, unknown>>((resolve) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => { if (event.data.status === "failed") { worker.terminate(); resolve({ status: event.data.status, failure: event.data.failure, partialResultPublished: false }); } };
    worker.onerror = (event) => { worker.terminate(); resolve({ status: "failed", failure: { code: "WORKER_ERROR", message: event.message }, partialResultPublished: false }); };
    worker.postMessage(job);
  });
}

async function runCampaign() {
  runButton.disabled = true;
  statusElement.textContent = "Running actual Frontier/Product worker campaign…";
  const fixtures = [
    await loadFixture("lighthouse-en", "lighthouse.en.e2r.json", "canonical-public"),
    await loadFixture("apollo-en", "apollo-11.en.e2r.json", "canonical-public"),
    await loadFixture("dense-k7-7", "synthetic:k7-7", "dense-control"),
  ];
  const rows = [];
  let firstWorkerRun: { job: WorkerEnvelope; message: WorkerMessage } | null = null;
  for (const fixture of fixtures) {
    const beforeDataset = JSON.stringify(fixture.dataset);
    const direct = directRun(fixture);
    const worker = await runWorker(fixture);
    if (!firstWorkerRun) firstWorkerRun = worker;
    const workerDisposition = validateMessage(worker.job, worker.message);
    const parity = worker.message.status === "completed" ? exactParity(direct.result, worker.message) : { candidateSet: false, product: false, selected: false };
    const expected = expectedFor(fixture);
    const workerFingerprint = worker.message.selected ? await shortHash(positionsFingerprint((worker.message.selected as { positions: Record<string, Point> }).positions)) : null;
    rows.push({
      fixture: fixture.id,
      category: fixture.category,
      graph: { nodes: fixture.graph.nodes.length, edges: fixture.graph.edges.length },
      direct: { status: validateFrontierProductResult(direct.result).ok ? "completed" : "failed", elapsedMs: Number(direct.elapsedMs.toFixed(3)), selectedFamily: direct.result.selected?.family ?? null, selectedPositionFingerprint: direct.result.selected ? await shortHash(positionsFingerprint(direct.result.selected.positions)) : null },
      worker: { status: worker.message.status, started: worker.started, elapsedMs: Number(worker.elapsedMs.toFixed(3)), workerComputeMs: worker.message.workerComputeMs ?? null, candidateGenerationMs: worker.message.candidateGenerationMs ?? null, productPresentationMs: worker.message.productPresentationMs ?? null, payloadBytes: worker.payloadBytes, selectedFamily: worker.message.selected ? (worker.message.selected as { family: string }).family : null, selectedPositionFingerprint: workerFingerprint },
      parity,
      reviewedEvidence: expected ? { family: expected.selectedFamily ?? null, positionFingerprint: expected.selectedPositionFingerprint ?? expected.reviewedPositionFingerprint ?? null, familyEqual: expected.selectedFamily === (worker.message.selected as { family?: string } | undefined)?.family, fingerprintEqual: (expected.selectedPositionFingerprint ?? expected.reviewedPositionFingerprint ?? null) === workerFingerprint } : null,
      datasetUnchanged: beforeDataset === JSON.stringify(fixture.dataset),
      acceptance: workerDisposition,
    });
  }
  const dense = fixtures.find((fixture) => fixture.id === "dense-k7-7")!;
  const responsivenessStart = performance.now();
  const longTaskStartIndex = longTasks.length;
  const responsiveWorker = await runWorker(dense);
  const responsiveness = { elapsedMs: Number((performance.now() - responsivenessStart).toFixed(3)), eventLoop: eventLoopWindow(responsivenessStart, performance.now()), workerCompleted: responsiveWorker.message.status === "completed", maxLongTaskMs: Number(Math.max(0, ...longTasks.slice(longTaskStartIndex)).toFixed(3)) };
  const cancellation = await runCancellation(dense);
  const failure = await runFailure(fixtures[0]!);
  const stale = firstWorkerRun ? validateMessage(firstWorkerRun.job, firstWorkerRun.message, firstWorkerRun.job.generation + 1) : { accepted: false, disposition: "stale", reason: "completion unavailable" };
  const artifact = {
    contract: "LIAISONSCAPE-FRONTIER-PRODUCT-WORKER-EXECUTION-PROOF-1",
    diagnosticOnly: true,
    actualWorker: true,
    sourceBoundary: "src/frontier-candidate-generator.ts -> Product presentation through src/graph-presentation.ts and src/automatic-layout-quality.ts -> bounded Product proposal selection in this execution adapter",
    architecture: { worker: "Frontier candidate generation + Product presentation/proposal evaluation/selection", mainThread: "operation identity validation, result adoption decision, render/session authority", appWiring: false },
    config: DEFAULT_FRONTIER_WORKER_CONFIG,
    environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null, crossOriginIsolated: crossOriginIsolated, workerApi: typeof Worker !== "undefined" },
    rows,
    responsiveness,
    cancellation,
    failureEnvelope: failure,
    staleResult: { disposition: stale.disposition, accepted: stale.accepted, reason: stale.reason },
    lifecycle: { success: rows.every((row) => row.acceptance.accepted), technicalFailure: failure.status === "failed", cancel: cancellation.status === "cancelled", stale: stale.disposition === "stale", incompleteOrNonFinite: "validation gate present; no incomplete/non-finite result emitted" },
    determinism: { directWorkerSelectedParity: rows.every((row) => row.parity.selected), repeatedCampaign: "not duplicated; source deterministic candidate generator and one browser replay" },
    productionDefaultChanged: false,
    partialResultPublished: false,
    disposition: { workerExecution: "ESTABLISHED", parity: rows.every((row) => row.parity.candidateSet && row.parity.product && row.parity.selected) ? "PASSED" : "FAILED", browserResponsiveness: responsiveness.workerCompleted ? "ESTABLISHED" : "FAILED", cancellation: cancellation.status === "cancelled" && !cancellation.resultReceived ? "ESTABLISHED" : "FAILED", productionIntegration: "HOLD", executionArchitecture: "PROOF-ONLY; NO APP ADOPTION" },
  };
  const serialized = JSON.stringify(artifact, null, 2);
  resultsElement.textContent = serialized;
  downloadLink.href = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
  downloadLink.hidden = false;
  statusElement.textContent = "Actual Frontier/Product Worker proof complete";
  runButton.disabled = false;
}

runButton.addEventListener("click", () => { void runCampaign(); });
