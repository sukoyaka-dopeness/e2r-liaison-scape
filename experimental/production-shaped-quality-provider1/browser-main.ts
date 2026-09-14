import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect } from "../../src/viewport.ts";
import { solveAutoLayout } from "../../src/auto-layout.ts";
import { beginProvider, createProviderState, createProviderSnapshot, providerEnvelope, providerExecutionContract, requestProviderCancellation, stepProvider } from "./contract.mjs";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name: string };
type TestCase = { id: string; category: string; graph: { nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>; edges: RoutingGraphEdge[] }; input: { entities: Array<{ id: string }>; relations: Relation[] }; basePositions: Record<string, Point> };
type Candidate = { family: string; fingerprint: string; positions: Record<string, Point>; cheapFeatures: Record<string, number> };

const statusElement = document.querySelector<HTMLParagraphElement>("#status")!;
const resultsElement = document.querySelector<HTMLPreElement>("#results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const downloadLink = document.querySelector<HTMLAnchorElement>("#download")!;
const intervalTicks: number[] = [];
const frameTicks: number[] = [];
const longTasks: number[] = [];
setInterval(() => intervalTicks.push(performance.now()), 10);
if ("PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes.includes("longtask")) new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(Number(entry.duration.toFixed(3))); }).observe({ type: "longtask", buffered: true });
function frameTick(timestamp: number) { frameTicks.push(timestamp); requestAnimationFrame(frameTick); }
requestAnimationFrame(frameTick);

function relation(id: string, sourceId: string, targetId: string, index: number, long = false): Relation { return { id, sourceId, targetId, name: long ? `Relation ${index} with a deliberately long presentation label` : `Relation ${index}` }; }
function makeCase(id: string, category: string, nodeCount: number, edgeCount: number, long = false): TestCase {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations: Relation[] = [];
  for (let index = 0; index < edgeCount; index += 1) relations.push(relation(`${id}-r${index}`, ids[index % ids.length]!, ids[(index * 3 + 1) % ids.length]!, index, long));
  const input = { entities: ids.map((entityId) => ({ id: entityId })), relations };
  const basePositions = solveAutoLayout(input, { iterations: 3 });
  const groups = new Map<string, Relation[]>();
  for (const edge of relations) { const key = `${edge.sourceId}|${edge.targetId}`; groups.set(key, [...(groups.get(key) ?? []), edge]); }
  const edges = relations.map((edge) => { const group = groups.get(`${edge.sourceId}|${edge.targetId}`)!; return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, parallelIndex: group.findIndex(({ id: edgeId }) => edgeId === edge.id), parallelCount: group.length, label: edge.name }; });
  const nodes = ids.map((nodeId, index) => ({ id: nodeId, label: long ? `Node ${index} with a long label` : `Node ${index}`, description: long ? "Long description" : "", x: basePositions[nodeId]?.x ?? 160, y: basePositions[nodeId]?.y ?? 160 }));
  return { id, category, graph: { nodes, edges }, input, basePositions };
}
function cases(): TestCase[] { return [makeCase("canonical", "canonical", 8, 10), makeCase("dense", "dense", 14, 49), makeCase("label", "label-heavy", 10, 20, true)]; }
function fingerprint(positions: Record<string, Point>): string { return Object.keys(positions).sort().map((id) => `${id}:${positions[id]!.x.toFixed(3)},${positions[id]!.y.toFixed(3)}`).join("|"); }
function structuralCrossings(testCase: TestCase, positions: Record<string, Point>): number {
  const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const proper = (a: Point, b: Point, c: Point, d: Point) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
  let total = 0;
  for (let left = 0; left < testCase.graph.edges.length; left += 1) for (let right = left + 1; right < testCase.graph.edges.length; right += 1) {
    const first = testCase.graph.edges[left]!; const second = testCase.graph.edges[right]!;
    if (new Set([first.sourceId, first.targetId, second.sourceId, second.targetId]).size < 4) continue;
    if (proper(positions[first.sourceId]!, positions[first.targetId]!, positions[second.sourceId]!, positions[second.targetId]!)) total += 1;
  }
  return total;
}
function generateCandidates(testCase: TestCase, count: number): Candidate[] {
  const result: Candidate[] = [];
  for (let index = 0; index < count; index += 1) {
    const solved = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) });
    const positions = Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, { x: (solved[node.id] ?? testCase.basePositions[node.id]!).x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: (solved[node.id] ?? testCase.basePositions[node.id]!).y + ((index + nodeIndex) % 5) - 2 }]));
    const key = fingerprint(positions);
    const classFeatures = index < 4 ? { crossings: structuralCrossings(testCase, positions), separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 100 + testCase.graph.edges.length, angularPressure: 20 + testCase.graph.nodes.length, extentDiagonal: 800, edgeSpread: 400 } : { crossings: structuralCrossings(testCase, positions), separationDeficit: 0, labelSpanDeficit: 0, coarseCorridorPressure: 100 + testCase.graph.edges.length, angularPressure: 20 + testCase.graph.nodes.length, extentDiagonal: 800, edgeSpread: 400 };
    result.push({ family: `browser-existing-frontier-adapter-${index + 1}`, fingerprint: key, positions, cheapFeatures: classFeatures });
  }
  return result;
}
function emptyMaps() { return { edgeCurveOffsets: {}, selfLoopOverrides: {}, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map() }; }
function provisionalLabels(testCase: TestCase, positions: Record<string, Point>): LabelRect[] { return testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [])); }
function verifyCandidate(testCase: TestCase, candidate: Candidate) {
  const startedAt = performance.now();
  const presentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions: candidate.positions, ...emptyMaps(), provisionalNodeLabels: provisionalLabels(testCase, candidate.positions), feedbackEnabled: true });
  const elapsedMs = performance.now() - startedAt;
  const routeSamples = presentation.routedEdges.reduce((sum, edge) => sum + edge.samples.length, 0);
  return { status: "completed", product: { score: routeSamples + presentation.relationLabels.size * 10 + presentation.nodeLabels.size, crossings: 0 }, telemetry: { presentationMs: elapsedMs, routeCount: presentation.routedEdges.length, relationLabelCount: presentation.relationLabels.size, nodeLabelCount: presentation.nodeLabels.size } };
}
function eventLoopEvidence(startedAt: number, endedAt: number) { const interval = intervalTicks.filter((tick) => tick >= startedAt && tick <= endedAt); const frames = frameTicks.filter((tick) => tick >= startedAt && tick <= endedAt); const gaps = (values: number[]) => values.slice(1).map((value, index) => value - values[index]!); return { maxIntervalGapMs: Number(Math.max(0, ...gaps(interval)).toFixed(3)), maxRafGapMs: Number(Math.max(0, ...gaps(frames)).toFixed(3)), intervalTickCount: interval.length, frameTickCount: frames.length }; }
async function runProviderCase(testCase: TestCase, candidateCount: number) {
  const input = createProviderSnapshot({ datasetIdentity: testCase.id, datasetRevision: 1, graphFingerprint: testCase.id, sessionPositions: testCase.basePositions, storedCoordinateFingerprint: "none", adoptedCoordinateFingerprint: "none", coordinateOwnership: Object.fromEntries(Object.keys(testCase.basePositions).map((id) => [id, "derived"])), manualRelationRouteFingerprint: "routes", manualSelfLoopFingerprint: "loops", manualRelationLabelFingerprint: "labels", manualNodeLabelFingerprint: "node-labels", locale: "en", algorithmVersion: "browser-production-shaped-provider-v1", budgetPolicy: { maxWorkUnits: 1000 } });
  let state = beginProvider(createProviderState(), input); const envelope = providerEnvelope(state); const phaseMs: Record<string, number> = {}; const slices: number[] = []; const startedAt = performance.now(); let turns = 0;
  while (state.active) { const phase = state.active.phase; const turnStartedAt = performance.now(); state = stepProvider(state, envelope, { generateCandidates: () => generateCandidates(testCase, candidateCount), verifyCandidate: (candidate: Candidate) => verifyCandidate(testCase, candidate) }, { currentSnapshot: input, normalK: 4, maxWorkUnits: 1000 }); const elapsed = performance.now() - turnStartedAt; slices.push(elapsed); phaseMs[phase] = (phaseMs[phase] ?? 0) + elapsed; turns += 1; await new Promise((resolve) => setTimeout(resolve, 0)); }
  const endedAt = performance.now(); return { id: testCase.id, category: testCase.category, nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length, status: state.lastOutcome?.status, result: state.lastOutcome?.result ? { fingerprint: state.lastOutcome.result.fingerprint, family: state.lastOutcome.result.family, finalistCount: state.lastOutcome.result.finalistCount } : null, turns, elapsedMs: Number((endedAt - startedAt).toFixed(3)), maxSchedulerTurnMs: Number(Math.max(...slices, 0).toFixed(3)), maxMainThreadSliceMs: Number(Math.max(...slices, 0).toFixed(3)), phaseMs, eventLoop: eventLoopEvidence(startedAt, endedAt) };
}
async function runCancelled(testCase: TestCase) { const input = createProviderSnapshot({ datasetIdentity: `${testCase.id}-cancel`, datasetRevision: 1, graphFingerprint: testCase.id, sessionPositions: testCase.basePositions, budgetPolicy: { maxWorkUnits: 1000 } }); let state = beginProvider(createProviderState(), input); const envelope = providerEnvelope(state); state = stepProvider(state, envelope, { generateCandidates: () => generateCandidates(testCase, 12), verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: input }); state = requestProviderCancellation(state); state = stepProvider(state, envelope, { generateCandidates: () => [], verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: input }); return { status: state.lastOutcome?.status, resultExposed: Boolean(state.lastOutcome?.result) }; }
async function runCampaign() { runButton.disabled = true; statusElement.textContent = "Running browser-native provider campaign…"; const testCases = cases(); const results = []; for (const testCase of testCases) results.push(await runProviderCase(testCase, testCase.category === "dense" ? 12 : 8)); const cancellation = await runCancelled(testCases[1]!); const budgetInput = createProviderSnapshot({ datasetIdentity: "budget", datasetRevision: 1, graphFingerprint: "budget", sessionPositions: testCases[0]!.basePositions, budgetPolicy: { maxWorkUnits: 0 } }); let budgetState = beginProvider(createProviderState(), budgetInput); budgetState = stepProvider(budgetState, providerEnvelope(budgetState), { generateCandidates: () => generateCandidates(testCases[0]!, 8), verifyCandidate: () => ({ status: "failed" }) }, { currentSnapshot: budgetInput, maxWorkUnits: 0 }); const repeatA = await runProviderCase(testCases[0]!, 8); const repeatB = await runProviderCase(testCases[0]!, 8); const artifact = { contract: providerExecutionContract.contract, diagnosticOnly: true, browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null, longTaskObserverSupported: PerformanceObserver.supportedEntryTypes.includes("longtask"), longTasksMs: longTasks }, sourceBoundary: "Browser campaign uses the existing source Product presentation authority through deriveBoundedAutomaticPresentation. Candidate generation is a deterministic current-source adapter for execution measurement only; it is not a new solver family or Product acceptance.", cases: results, determinism: { repeatedCanonicalResultEqual: JSON.stringify(repeatA.result) === JSON.stringify(repeatB.result), first: repeatA, second: repeatB }, cancellation, budgetExhaustion: { status: budgetState.lastOutcome?.status, resultExposed: Boolean(budgetState.lastOutcome?.result) }, disposition: { providerExecution: "DIAGNOSTICALLY ESTABLISHED", browserCost: results.every((result) => result.status === "completed") ? "MEASURED / MAIN-THREAD SLICE OPEN" : "NOT ESTABLISHED", mainThreadViability: "WORKER OR FURTHER EXECUTION STUDY REQUIRED FOR DENSE QUALITY WORK", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", actualProductVisualEvaluation: "NOT READY", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
  const serialized = JSON.stringify(artifact, null, 2); resultsElement.textContent = serialized; downloadLink.href = URL.createObjectURL(new Blob([serialized], { type: "application/json" })); downloadLink.hidden = false; statusElement.textContent = "Browser campaign complete"; return artifact; }
runButton.addEventListener("click", () => { void runCampaign(); });
