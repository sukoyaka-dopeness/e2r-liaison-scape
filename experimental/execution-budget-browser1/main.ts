import { settleInitialPlacement, solveAutoLayout } from "../../src/auto-layout.ts";
import { buildEntityGraph, type GraphNode } from "../../src/dataset.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect } from "../../src/viewport.ts";
import { beginOperation, createLifecycleState, createOperationSnapshot, deliverCandidate, jobEnvelope, requestCancellation } from "../quality-operation-lifecycle/contract.mjs";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name?: string };
type DatasetLike = { entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Relation[] };
type BrowserCase = {
  id: string;
  category: string;
  locale: "en" | "ja";
  graph: { nodes: GraphNode[]; edges: RoutingGraphEdge[] };
  positions: Record<string, Point>;
  solveInput: { entities: Array<{ id: string }>; relations: Relation[] };
};

const statusElement = document.querySelector<HTMLParagraphElement>("#status")!;
const resultsElement = document.querySelector<HTMLPreElement>("#results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;

const emptyMaps = () => ({
  edgeCurveOffsets: {},
  selfLoopOverrides: {},
  previousNodeLabelPlacements: new Map<string, LabelRect>(),
  previousRelationLabelPlacements: new Map<string, LabelRect>(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
});

function relation(id: string, sourceId: string, targetId: string, locale: "en" | "ja", index: number): Relation {
  const label = locale === "ja" ? `関係ラベル ${index} 長い説明` : `Relation label ${index} with explanatory text`;
  return { id, sourceId, targetId, name: label };
}

function graphFromRelations(id: string, category: string, locale: "en" | "ja", nodeIds: string[], relations: Relation[], longLabels = false): BrowserCase {
  const solveInput = { entities: nodeIds.map((nodeId) => ({ id: nodeId })), relations };
  const positions = solveAutoLayout(solveInput, { iterations: 3 });
  const entities = nodeIds.map((nodeId, index) => ({
    id: nodeId,
    name: longLabels
      ? locale === "ja" ? `長いノード名称 ${index} 建築と関係の説明` : `Long Node ${index} with an explanatory presentation label`
      : `Node ${index}`,
    description: longLabels ? "Additional description used by the Product label placement authority." : "",
  }));
  const groups = new Map<string, Relation[]>();
  for (const item of relations) {
    const key = `${item.sourceId}\u0000${item.targetId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const graphEdges = relations.map((item) => {
    const group = groups.get(`${item.sourceId}\u0000${item.targetId}`)!;
    const sorted = [...group].sort((left, right) => left.id.localeCompare(right.id));
    return {
      id: item.id,
      sourceId: item.sourceId,
      targetId: item.targetId,
      parallelIndex: sorted.findIndex(({ id: itemId }) => itemId === item.id),
      parallelCount: group.length,
      label: item.name ?? "",
    };
  });
  const nodes = entities.map((entity) => ({
    id: entity.id,
    label: String(entity.name ?? entity.id),
    description: String(entity.description ?? ""),
    x: positions[entity.id]?.x ?? 160,
    y: positions[entity.id]?.y ?? 160,
  }));
  return { id, category, locale, graph: { nodes, edges: graphEdges }, positions, solveInput };
}

function denseCase(): BrowserCase {
  const nodeIds = Array.from({ length: 14 }, (_, index) => `dense-${index}`);
  const relations: Relation[] = [];
  let index = 0;
  for (let source = 0; source < 7; source += 1) {
    for (let offset = 1; offset <= 7; offset += 1) {
      relations.push(relation(`dense-r${index}`, nodeIds[source]!, nodeIds[(source + offset) % 14]!, "en", index));
      index += 1;
    }
  }
  return graphFromRelations("dense-k7-7", "dense", "en", nodeIds, relations);
}

function parallelCase(): BrowserCase {
  const nodeIds = Array.from({ length: 8 }, (_, index) => `parallel-${index}`);
  const relations = Array.from({ length: 10 }, (_, index) => relation(`parallel-bundle-${index}`, "parallel-0", "parallel-1", "en", index));
  relations.push(...nodeIds.slice(1, -1).map((nodeId, index) => relation(`parallel-support-${index}`, nodeId, nodeIds[index + 2]!, "en", index + 10)));
  return graphFromRelations("parallel-pressure", "parallel", "en", nodeIds, relations);
}

function longLabelCase(): BrowserCase {
  const nodeIds = Array.from({ length: 10 }, (_, index) => `label-${index}`);
  const relations = nodeIds.map((nodeId, index) => relation(`label-ring-${index}`, nodeId, nodeIds[(index + 1) % nodeIds.length]!, "en", index));
  return graphFromRelations("long-label-pressure", "label-heavy", "en", nodeIds, relations, true);
}

function selfLoopCase(): BrowserCase {
  const nodeIds = Array.from({ length: 10 }, (_, index) => `loop-${index}`);
  const relations: Relation[] = [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) relations.push(relation(`loop-edge-${index}`, nodeIds[index]!, nodeIds[index + 1]!, "ja", index));
  for (let index = 0; index < 5; index += 1) {
    relations.push(relation(`self-${index}-a`, nodeIds[index]!, nodeIds[index]!, "ja", index + 20));
    relations.push(relation(`self-${index}-b`, nodeIds[index]!, nodeIds[index]!, "ja", index + 30));
  }
  return graphFromRelations("self-loop-pressure", "self-loop-heavy", "ja", nodeIds, relations, true);
}

async function canonicalCase(): Promise<BrowserCase> {
  const response = await fetch("/e2r-liaison-scape/lighthouse-restoration-demo.en.e2r.json");
  const raw = await response.json() as DatasetLike;
  const graph = buildEntityGraph(raw as never);
  const relations = raw.relations.filter(({ sourceId, targetId }) => graph.nodes.some(({ id }) => id === sourceId) && graph.nodes.some(({ id }) => id === targetId));
  const solveInput = { entities: graph.nodes.map(({ id }) => ({ id })), relations };
  const positions = settleInitialPlacement(solveInput);
  const byId = new Map(relations.map((item) => [item.id, item]));
  const edges = graph.edges.map((edge) => ({ ...edge, label: byId.get(edge.id)?.name ?? "" }));
  return {
    id: "canonical-lighthouse-en",
    category: "canonical",
    locale: "en",
    graph: {
      nodes: graph.nodes.map((node) => ({
        ...node,
        label: String(node.label ?? node.id),
        description: String(node.description ?? ""),
        ...(positions[node.id] ?? {}),
      })),
      edges,
    },
    positions,
    solveInput,
  };
}

function provisionalLabels(testCase: BrowserCase, positions: Record<string, Point>): LabelRect[] {
  const otherNodes = testCase.graph.nodes.map(({ id }) => positions[id]!);
  return testCase.graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!,
    String(node.label ?? node.id),
    String(node.description ?? ""),
    [],
    otherNodes.filter((other) => other !== positions[node.id]),
    [],
  ));
}

function candidatePositions(testCase: BrowserCase, candidateIndex: number): Record<string, Point> {
  const solved = solveAutoLayout(testCase.solveInput, { iterations: 3 + (candidateIndex % 3) });
  return Object.fromEntries(testCase.graph.nodes.map((node, index) => {
    const base = solved[node.id] ?? testCase.positions[node.id]!;
    const perturbation = candidateIndex === 0 ? 0 : ((candidateIndex * 7 + index * 3) % 9) - 4;
    return [node.id, { x: base.x + perturbation, y: base.y + ((candidateIndex + index) % 5) - 2 }];
  }));
}

function evaluateProduct(testCase: BrowserCase, candidateIndex: number): { elapsedMs: number; previewMs: number; positionCount: number; routeCount: number; labelCount: number } {
  const proposalStartedAt = performance.now();
  const positions = candidatePositions(testCase, candidateIndex);
  const proposalMs = performance.now() - proposalStartedAt;
  const provisional = provisionalLabels(testCase, positions);
  const presentationStartedAt = performance.now();
  const presentation = deriveBoundedAutomaticPresentation({
    graph: testCase.graph,
    positions,
    ...emptyMaps(),
    provisionalNodeLabels: provisional,
    feedbackEnabled: true,
  });
  const productMs = performance.now() - presentationStartedAt;
  const previewStartedAt = performance.now();
  deriveBoundedAutomaticPresentation({
    graph: testCase.graph,
    positions,
    ...emptyMaps(),
    provisionalNodeLabels: provisional,
    feedbackEnabled: true,
  });
  const previewMs = performance.now() - previewStartedAt;
  return { elapsedMs: proposalMs + productMs, previewMs, positionCount: Object.keys(positions).length, routeCount: presentation.routedEdges.length, labelCount: presentation.relationLabels.size + presentation.nodeLabels.size };
}

const intervalTicks: number[] = [];
setInterval(() => intervalTicks.push(performance.now()), 10);
const frameTicks: number[] = [];
const longTaskDurations: number[] = [];
if ("PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTaskDurations.push(Number(entry.duration.toFixed(3))); }).observe({ type: "longtask", buffered: true });
}
function frameTick(timestamp: number) {
  frameTicks.push(timestamp);
  requestAnimationFrame(frameTick);
}
requestAnimationFrame(frameTick);

function eventLoopEvidence(startedAt: number, endedAt: number) {
  const ticks = intervalTicks.filter((tick) => tick >= startedAt && tick <= endedAt);
  const gaps = ticks.slice(1).map((tick, index) => tick - ticks[index]!);
  const frames = frameTicks.filter((tick) => tick >= startedAt && tick <= endedAt);
  const frameGaps = frames.slice(1).map((tick, index) => tick - frames[index]!);
  return { maxIntervalGapMs: Number((Math.max(0, ...gaps)).toFixed(3)), maxRafGapMs: Number((Math.max(0, ...frameGaps)).toFixed(3)), intervalTickCount: ticks.length, frameTickCount: frames.length };
}

function runSynchronous(testCase: BrowserCase, candidateCount: number) {
  const startedAt = performance.now();
  const samples = [];
  for (let index = 0; index < candidateCount; index += 1) samples.push(evaluateProduct(testCase, index));
  const endedAt = performance.now();
  return { mechanism: "synchronous-main-thread", candidateCount, elapsedMs: Number((endedAt - startedAt).toFixed(3)), maxUninterruptedSliceMs: Number((endedAt - startedAt).toFixed(3)), eventLoop: eventLoopEvidence(startedAt, endedAt), samples };
}

function runCooperative(testCase: BrowserCase, candidateCount: number, cancelAfterMs = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const slices: number[] = [];
    let index = 0;
    let cancelRequestedAt: number | null = null;
    let cancelObservedAt: number | null = null;
    let cancelTimer: number | undefined;
    cancelTimer = window.setTimeout(() => { cancelRequestedAt = performance.now(); }, cancelAfterMs);
    const samples = [];
    const step = () => {
      const sliceStartedAt = performance.now();
      if (cancelRequestedAt !== null && cancelObservedAt === null) cancelObservedAt = performance.now();
      if (cancelObservedAt === null && index < candidateCount) {
        samples.push(evaluateProduct(testCase, index));
        index += 1;
      }
      slices.push(performance.now() - sliceStartedAt);
      if (cancelObservedAt !== null || index >= candidateCount) {
        if (cancelTimer !== undefined) window.clearTimeout(cancelTimer);
        const endedAt = performance.now();
        resolve({ mechanism: "cooperative-main-thread", candidateCount, completedCandidates: index, cancelled: cancelObservedAt !== null, cancelRequestDeliveryDelayMs: cancelRequestedAt === null ? null : Number((cancelObservedAt! - (startedAt + cancelAfterMs)).toFixed(3)), cancelStopLatencyMs: cancelRequestedAt === null ? null : Number((endedAt - cancelObservedAt!).toFixed(3)), elapsedMs: Number((endedAt - startedAt).toFixed(3)), maxUninterruptedSliceMs: Number(Math.max(...slices, 0).toFixed(3)), eventLoop: eventLoopEvidence(startedAt, endedAt), samples });
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

function workerSource() {
  return `self.onmessage = (event) => { const started = performance.now(); let checksum = 0; for (let i = 0; i < event.data.workUnits; i += 1) checksum = (checksum + ((i * 17) % 997)) % 1000003; self.postMessage({ token: event.data.token, checksum, started, ended: performance.now(), candidate: event.data.candidate }); };`;
}

function workerRoundTrip(payload: unknown, token: string, workUnits = 30000): Promise<{ elapsedMs: number; payloadBytes: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" })));
    const serialized = JSON.stringify(payload);
    const startedAt = performance.now();
    worker.onmessage = () => { const elapsedMs = performance.now() - startedAt; worker.terminate(); resolve({ elapsedMs: Number(elapsedMs.toFixed(3)), payloadBytes: new TextEncoder().encode(serialized).byteLength }); };
    worker.onerror = (error) => { worker.terminate(); reject(error); };
    worker.postMessage({ token, workUnits, candidate: payload });
  });
}

function workerCancellationEvidence(): Promise<{ requested: boolean; messageReceived: boolean; terminateCallLatencyMs: number }> {
  return new Promise((resolve) => {
    const worker = new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" })));
    let messageReceived = false;
    const cancelTimer = window.setTimeout(() => {
      const requestedAt = performance.now();
      worker.terminate();
      resolve({ requested: true, messageReceived, terminateCallLatencyMs: Number((performance.now() - requestedAt).toFixed(3)) });
    }, 8);
    worker.onmessage = () => {
      messageReceived = true;
      window.clearTimeout(cancelTimer);
      worker.terminate();
      resolve({ requested: false, messageReceived, terminateCallLatencyMs: 0 });
    };
    worker.postMessage({ token: "cancel-probe", workUnits: 20000000, candidate: { probe: true } });
  });
}

function browserLifecycleEvidence() {
  const input = createOperationSnapshot({
    datasetIdentity: "browser-study-dataset",
    datasetRevision: 1,
    graphFingerprint: "browser-study-graph",
    sessionPositions: { a: { x: 0, y: 0 } },
    storedCoordinateFingerprint: "stored",
    coordinatesDirty: false,
    adoptedCoordinateFingerprint: "none",
    coordinateOwnership: { a: "derived" },
    manualRelationRouteFingerprint: "routes",
    manualSelfLoopFingerprint: "loops",
    manualRelationLabelFingerprint: "relation-labels",
    manualNodeLabelFingerprint: "node-labels",
    locale: "en",
    algorithmVersion: "browser-study",
    budgetPolicy: { maxIterations: 1, maxMs: 20 },
  });
  const started = beginOperation(createLifecycleState(), input);
  const cancelled = requestCancellation(started);
  const cancellationResult = deliverCandidate(cancelled, jobEnvelope(started), { positions: { a: { x: 1, y: 1 } } }, input);
  const newer = beginOperation(started, createOperationSnapshot({ ...input, sessionPositions: { a: { x: 2, y: 2 } } }));
  const oldResult = deliverCandidate(newer, jobEnvelope(started), { positions: { a: { x: 1, y: 1 } } }, input);
  return {
    cancellationCompletion: cancellationResult.lastOutcome,
    oldGenerationOutcome: oldResult.lastOutcome,
    newerOperationRemainsActive: oldResult.active?.operationId === newer.active?.operationId,
  };
}

async function runHybrid(testCase: BrowserCase, candidateCount: number) {
  const startedAt = performance.now();
  const samples = [];
  const message = [];
  for (let index = 0; index < candidateCount; index += 1) {
    const positions = candidatePositions(testCase, index);
    const workerResult = await workerRoundTrip({ positions, graph: testCase.graph }, `${testCase.id}-${index}`);
    const verificationStartedAt = performance.now();
    const provisional = provisionalLabels(testCase, positions);
    const presentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions, ...emptyMaps(), provisionalNodeLabels: provisional, feedbackEnabled: true });
    message.push(workerResult);
    samples.push({ verificationMs: Number((performance.now() - verificationStartedAt).toFixed(3)), routeCount: presentation.routedEdges.length });
  }
  const endedAt = performance.now();
  return { mechanism: "hybrid-worker-proposal-main-thread-verification", candidateCount, elapsedMs: Number((endedAt - startedAt).toFixed(3)), maxUninterruptedSliceMs: Number(Math.max(...samples.map(({ verificationMs }) => verificationMs), 0).toFixed(3)), eventLoop: eventLoopEvidence(startedAt, endedAt), message, samples };
}

async function runStudy() {
  runButton.disabled = true;
  statusElement.textContent = "Running browser-native timing workload; keep this tab visible…";
  const cases = [await canonicalCase(), denseCase(), parallelCase(), longLabelCase(), selfLoopCase()];
  const results = [];
  for (const testCase of cases) {
    const candidateCounts = testCase.category === "dense" ? [1, 2] : [1, 2, 3];
    const representativeCandidateCount = testCase.category === "dense" ? 2 : 3;
    const sync = candidateCounts.map((candidateCount) => runSynchronous(testCase, candidateCount));
    const cooperative = await runCooperative(testCase, representativeCandidateCount);
    const hybrid = await runHybrid(testCase, representativeCandidateCount);
    const preview = evaluateProduct(testCase, 0).previewMs;
    results.push({ case: { id: testCase.id, category: testCase.category, locale: testCase.locale, nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length }, sync, cooperative, hybrid, previewMs: Number(preview.toFixed(3)) });
  }
  const workerCancellation = await workerCancellationEvidence();
  const artifact = {
    contract: "LIAISONSCAPE-EXPLICIT-HIGH-QUALITY-AUTO-LAYOUT-BROWSER-EXECUTION-BUDGET-STUDY-v1",
    diagnosticOnly: true,
    generatedAt: new Date().toISOString(),
    browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null, crossOriginIsolated: window.crossOriginIsolated, performanceMemory: "memory API not assumed", longTaskObserver: { supported: PerformanceObserver.supportedEntryTypes.includes("longtask"), durationsMs: longTaskDurations } },
    sourceBoundary: { proposal: "solveAutoLayout / deterministic fake candidate generation", productVerification: "deriveBoundedAutomaticPresentation on the current source", preview: "one additional current Product presentation derivation", worker: "transport and pure-work simulation only; Product verification remains main-thread" },
    cancellation: "cooperative run schedules cancellation after 8ms and records delivery delay, stop latency, and completed candidates; synchronous run exposes event-loop blocking through interval/rAF gaps",
    results,
    workerCancellation,
    lifecycleBrowserEvidence: browserLifecycleEvidence(),
    status: { executionArchitecture: "B: PROVISIONALLY ADOPT", qualitySolver: "HOLD / NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY" },
  };
  (window as Window & { __executionBudgetStudy?: unknown }).__executionBudgetStudy = artifact;
  resultsElement.textContent = JSON.stringify(artifact, null, 2);
  statusElement.textContent = "Completed. This is diagnostic browser evidence; no Product behavior was adopted.";
  runButton.disabled = false;
}

runButton.addEventListener("click", () => { void runStudy(); });
if (new URLSearchParams(window.location.search).get("autorun") === "1") void runStudy();
