import { compareFullVerificationWithSynchronous } from "../full-verification1/prototype.mjs";
import { createSchedulerEnvelope, requestSchedulerCancellation, runScheduledVerification, schedulerPolicies, stepScheduledTurn, tracesEquivalent } from "../scheduler-policy1/prototype.mjs";
import { compareNodeLabelAccumulatorWithSynchronous, createNodeLabelAccumulator, stepNodeLabelAccumulator } from "../node-label-accumulator1/prototype.mjs";
import { compareRelationLabelAccumulatorWithSynchronous, createRelationLabelAccumulator, stepRelationLabelAccumulator } from "../relation-label-accumulator1/prototype.mjs";
import { compareRouteAccumulatorWithSynchronous } from "../route-selection-accumulator1/prototype.mjs";
import { runVerification } from "../verification-interruptibility1/prototype.mjs";
import { placeNodeLabel, type LabelRect } from "../../src/viewport.ts";
import { solveAutoLayout } from "../../src/auto-layout.ts";
import type { GraphNode, RoutingGraphEdge } from "../../src/graph-presentation.ts";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name?: string };
type WorkloadFamily = "sparse" | "dense" | "parallel" | "label-heavy" | "self-loop" | "mixed";
type BrowserCase = {
  id: string;
  family: WorkloadFamily;
  level: "small" | "medium" | "large";
  locale: "en" | "ja";
  graph: { nodes: GraphNode[]; edges: RoutingGraphEdge[] };
  positions: Record<string, Point>;
  solveInput: { entities: Array<{ id: string }>; relations: Relation[] };
  dimensions: Record<string, unknown>;
};

const statusElement = document.querySelector<HTMLParagraphElement>("#status")!;
const resultsElement = document.querySelector<HTMLPreElement>("#results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const CASE_MAX_SOURCE_MS = 250;
const CASE_MAX_COOPERATIVE_MS = 3000;

function textOf(length: number, prefix: string) {
  if (length <= prefix.length) return prefix.slice(0, length);
  return `${prefix} ${"explanatory presentation text ".repeat(Math.ceil(length / 29))}`.slice(0, length);
}

function relation(id: string, sourceId: string, targetId: string, labelLength: number, index: number, locale: "en" | "ja" = "en"): Relation {
  const prefix = locale === "ja" ? `関係ラベル${index} ` : `Relation label ${index} `;
  return { id, sourceId, targetId, name: textOf(labelLength, prefix) };
}

function positionsFor(nodeIds: string[]) {
  const columns = Math.max(3, Math.ceil(Math.sqrt(nodeIds.length)));
  return Object.fromEntries(nodeIds.map((id, index) => [id, { x: 180 + (index % columns) * 150, y: 150 + Math.floor(index / columns) * 130 }]));
}

function graphFromRelations({ id, family, level, nodeIds, relations, labelLength = 0, locale = "en", dimensions }: { id: string; family: WorkloadFamily; level: "small" | "medium" | "large"; nodeIds: string[]; relations: Relation[]; labelLength?: number; locale?: "en" | "ja"; dimensions: Record<string, unknown> }): BrowserCase {
  const positions = solveAutoLayout({ entities: nodeIds.map((id) => ({ id })), relations }, { iterations: 3 });
  const groups = new Map<string, Relation[]>();
  for (const item of relations) {
    const key = `${item.sourceId}\u0000${item.targetId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const edges = relations.map((item) => {
    const group = groups.get(`${item.sourceId}\u0000${item.targetId}`)!;
    const sorted = [...group].sort((left, right) => left.id.localeCompare(right.id));
    return { id: item.id, sourceId: item.sourceId, targetId: item.targetId, parallelIndex: sorted.findIndex(({ id: itemId }) => itemId === item.id), parallelCount: group.length, label: item.name ?? "" };
  });
  const nodes = nodeIds.map((id, index) => ({ id, label: labelLength ? textOf(labelLength, `Node ${index}`) : `Node ${index}`, description: labelLength ? textOf(Math.max(0, Math.floor(labelLength / 2)), "Product label description") : "", ...positions[id] }));
  return { id, family, level, locale, graph: { nodes, edges }, positions, solveInput: { entities: nodeIds.map((id) => ({ id })), relations }, dimensions };
}

function levelName(index: number): "small" | "medium" | "large" { return ["small", "medium", "large"][index] as "small" | "medium" | "large"; }
function nodeIds(prefix: string, count: number) { return Array.from({ length: count }, (_, index) => `${prefix}-${index}`); }

function sparseCase(index: number): BrowserCase {
  const level = levelName(index); const count = [8, 16, 24][index]!; const ids = nodeIds(`sparse-${index}`, count); const relations = ids.slice(1).map((target, i) => relation(`sparse-${index}-r${i}`, ids[i]!, target, 18, i));
  return graphFromRelations({ id: `sparse-${level}`, family: "sparse", level, nodeIds: ids, relations, dimensions: { growth: "N with E=N-1", pattern: "chain" } });
}

function denseCase(index: number): BrowserCase {
  const level = levelName(index); const count = [8, 12, 16][index]!; const targetOffsets = [3, 4, 5][index]!; const ids = nodeIds(`dense-${index}`, count); const relations: Relation[] = [];
  for (let source = 0; source < count; source += 1) for (let offset = 1; offset <= targetOffsets; offset += 1) relations.push(relation(`dense-${index}-r${relations.length}`, ids[source]!, ids[(source + offset) % count]!, 18, relations.length));
  return graphFromRelations({ id: `dense-${level}`, family: "dense", level, nodeIds: ids, relations, dimensions: { growth: "edge density and occupied-path prefix", targetOffsets } });
}

function parallelCase(index: number): BrowserCase {
  const level = levelName(index); const count = [8, 12, 16][index]!; const bundleCount = [4, 8, 12][index]!; const ids = nodeIds(`parallel-${index}`, count); const relations = Array.from({ length: bundleCount }, (_, i) => relation(`parallel-${index}-bundle-${i}`, ids[0]!, ids[1]!, 18, i));
  relations.push(...ids.slice(1, -1).map((source, i) => relation(`parallel-${index}-support-${i}`, source, ids[i + 2]!, 18, bundleCount + i)));
  return graphFromRelations({ id: `parallel-${level}`, family: "parallel", level, nodeIds: ids, relations, dimensions: { growth: "same-endpoint bundle count", bundleCount, supportEdges: count - 2 } });
}

function labelHeavyCase(index: number): BrowserCase {
  const level = levelName(index); const count = [8, 16, 24][index]!; const labelLength = [40, 120, 240][index]!; const ids = nodeIds(`label-${index}`, count); const relations = ids.map((source, i) => relation(`label-${index}-r${i}`, source, ids[(i + 1) % count]!, labelLength, i));
  return graphFromRelations({ id: `label-heavy-${level}`, family: "label-heavy", level, nodeIds: ids, relations, labelLength, dimensions: { growth: "node/relation label length and count", labelLength } });
}

function selfLoopCase(index: number): BrowserCase {
  const level = levelName(index); const count = [8, 16, 24][index]!; const loopCount = [2, 8, 16][index]!; const ids = nodeIds(`loop-${index}`, count); const relations = ids.slice(1).map((target, i) => relation(`loop-${index}-edge-${i}`, ids[i]!, target, 18, i, "ja"));
  for (let i = 0; i < loopCount; i += 1) relations.push(relation(`loop-${index}-self-${i}`, ids[i % Math.min(count, 8)]!, ids[i % Math.min(count, 8)]!, 24, i + count, "ja"));
  return graphFromRelations({ id: `self-loop-${level}`, family: "self-loop", level, nodeIds: ids, relations, locale: "ja", dimensions: { growth: "Self-loop count and owner reuse", loopCount, ownerCount: Math.min(count, 8) } });
}

function mixedCase(index: number): BrowserCase {
  const level = levelName(index); const count = [10, 16, 22][index]!; const ids = nodeIds(`mixed-${index}`, count); const relations = ids.slice(1).map((target, i) => relation(`mixed-${index}-chain-${i}`, ids[i]!, target, 48, i));
  for (let i = 0; i < 2; i += 1) for (let j = 0; j < [2, 4, 6][index]!; j += 1) relations.push(relation(`mixed-${index}-bundle-${i}-${j}`, ids[i * 2]!, ids[i * 2 + 1]!, 64, relations.length));
  for (let i = 0; i < [1, 3, 5][index]!; i += 1) relations.push(relation(`mixed-${index}-self-${i}`, ids[(i * 3) % count]!, ids[(i * 3) % count]!, 64, relations.length, "ja"));
  return graphFromRelations({ id: `mixed-${level}`, family: "mixed", level, nodeIds: ids, relations, labelLength: 28, dimensions: { growth: "sparse ordinary edges plus parallel groups, labels, and Self-loops", parallelGroups: 2, loops: [1, 3, 5][index] } });
}

function allCases() { return Array.from({ length: 3 }, (_, index) => [sparseCase(index), denseCase(index), parallelCase(index), labelHeavyCase(index), selfLoopCase(index), mixedCase(index)]).flat(); }

function provisionalLabels(testCase: BrowserCase, positions: Record<string, Point>): LabelRect[] {
  return testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, String(node.label ?? node.id), String(node.description ?? ""), [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
}

function verificationInput(testCase: BrowserCase) {
  const positions = Object.fromEntries(Object.entries(testCase.positions).map(([id, point]) => [id, { ...point }]));
  return { graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(testCase, positions), previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true };
}

function relationLabelInput(testCase: BrowserCase, routedEdges: readonly RoutingGraphEdge[], pass: "first" | "feedback") {
  return { routedEdges, nodes: testCase.graph.nodes.map(({ id }) => testCase.positions[id]!), previousPlacements: new Map<string, LabelRect>(), manualAnchors: new Map(), pass };
}

function nodeLabelInput(testCase: BrowserCase, routedEdges: readonly RoutingGraphEdge[], occupiedRelationLabels: ReadonlyMap<string, LabelRect>, pass: "first" | "feedback") {
  return { nodes: testCase.graph.nodes, positions: testCase.positions, routedEdges, occupiedRelationLabels, previousPlacements: new Map<string, LabelRect>(), manualOffsets: new Map(), yieldingRoutes: [], pass };
}

function sum(values: number[]) { return Number(values.reduce((total, value) => total + value, 0).toFixed(3)); }
function max(values: number[]) { return Number(Math.max(...values, 0).toFixed(3)); }

function sourceAttribution(run: any) {
  const sourceSteps = run.turns.flatMap((turn: any) => turn.sourceSteps);
  const workUnits = sourceSteps.filter((step: any) => step.kind === "work-unit");
  const transitions = sourceSteps.filter((step: any) => step.kind === "phase-transition");
  const byAuthority = Object.fromEntries(["Route", "Relation-label", "Node-label", "orchestration"].map((authority) => [authority, max(workUnits.filter((step: any) => step.authority === authority).map((step: any) => step.elapsedMs))]));
  const phaseMax = Object.fromEntries([...new Set(transitions.map((step: any) => step.phase))].map((phase) => [phase, max(transitions.filter((step: any) => step.phase === phase).map((step: any) => step.elapsedMs))]));
  return { maxTurnMs: run.maxTurnMs, maxSourceStepSumMs: max(run.turns.map((turn: any) => turn.sourceStepElapsedMs)), maxSchedulerGapMs: max(run.turns.map((turn: any) => turn.schedulerGapMs)), maxWorkUnitMs: run.maxWorkUnitMs, maxPhaseTransitionMs: run.maxPhaseTransitionMs, totalAuthoritativeComputeMs: run.totalTurnComputeMs, scheduledTurnCount: run.scheduledTurnCount, workUnitAuthorityMaxMs: byAuthority, transitionMaxMs: phaseMax, phaseNamespaceMaxMs: Object.fromEntries([...new Set(sourceSteps.map((step: any) => step.phase))].map((phase) => [phase, max(sourceSteps.filter((step: any) => step.phase === phase).map((step: any) => step.elapsedMs))])) };
}

async function cooperative(testCase: BrowserCase, policy: Record<string, any>, cancelAfterMs: number | null = null) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const envelope = createSchedulerEnvelope(verificationInput(testCase), { policy, captureDiagnostics: false, maxWallMs: CASE_MAX_COOPERATIVE_MS });
    const startedAt = performance.now(); let requestedAt: number | null = null;
    const timer = cancelAfterMs === null ? null : window.setTimeout(() => { requestedAt = performance.now(); requestSchedulerCancellation(envelope); }, cancelAfterMs);
    const finish = () => {
      const observedAt = performance.now(); if (timer !== null) window.clearTimeout(timer);
      const elapsedMs = observedAt - startedAt; const schedulerWorkMs = envelope.schedulerTurns.reduce((total: number, turn: any) => total + turn.elapsedMs, 0);
      resolve({ status: envelope.state.status, completedWorkUnits: envelope.state.completedWorkUnits, scheduledTurnCount: envelope.schedulerTurns.length, maxSchedulerStepMs: max(envelope.schedulerTurns.map((turn: any) => turn.elapsedMs)), schedulerWorkMs: Number(schedulerWorkMs.toFixed(3)), schedulerOverheadMs: Number(Math.max(0, elapsedMs - schedulerWorkMs).toFixed(3)), cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)), elapsedMs: Number(elapsedMs.toFixed(3)), partialProductResultExposed: envelope.state.result !== null && envelope.state.status !== "completed" });
    };
    const step = () => { if (envelope.state.status === "running" || envelope.cancelRequested) stepScheduledTurn(envelope); if (envelope.state.status !== "running") { finish(); return; } window.setTimeout(step, 0); };
    window.setTimeout(step, 0);
  });
}

async function measure(testCase: BrowserCase, runIndex: number) {
  const input = verificationInput(testCase);
  const staged = runVerification(input, { maxStepMs: CASE_MAX_SOURCE_MS });
  const full = compareFullVerificationWithSynchronous(input, { maxSteps: 200000 });
  const route = compareRouteAccumulatorWithSynchronous(input, { maxStepMs: CASE_MAX_SOURCE_MS });
  const relationInputs = [staged.state.firstRoutes ? { pass: "first" as const, routedEdges: staged.state.firstRoutes } : null, staged.state.feedbackRoutes ? { pass: "feedback" as const, routedEdges: staged.state.feedbackRoutes } : null].filter(Boolean) as Array<{ pass: "first" | "feedback"; routedEdges: readonly RoutingGraphEdge[] }>;
  const relation = relationInputs.map(({ pass, routedEdges }) => compareRelationLabelAccumulatorWithSynchronous(relationLabelInput(testCase, routedEdges, pass), { maxStepMs: CASE_MAX_SOURCE_MS }));
  const nodeInputs = relationInputs.map(({ pass, routedEdges }) => ({ pass, routedEdges, relationLabels: pass === "first" ? staged.state.firstRelationLabels : staged.state.feedbackRelationLabels })).filter(({ relationLabels }) => relationLabels) as Array<{ pass: "first" | "feedback"; routedEdges: readonly RoutingGraphEdge[]; relationLabels: ReadonlyMap<string, LabelRect> }>;
  const node = nodeInputs.map(({ pass, routedEdges, relationLabels }) => compareNodeLabelAccumulatorWithSynchronous(nodeLabelInput(testCase, routedEdges, relationLabels, pass), { maxStepMs: CASE_MAX_SOURCE_MS }));
  const off = runScheduledVerification(input, { policy: schedulerPolicies.oneUnit, maxTurns: 200000, captureDiagnostics: false });
  const on = runScheduledVerification(input, { policy: schedulerPolicies.oneUnit, maxTurns: 200000, captureDiagnostics: true });
  const offAttribution = sourceAttribution(off); const onAttribution = sourceAttribution(on);
  const large = testCase.level === "large";
  return {
    runIndex,
    id: testCase.id,
    family: testCase.family,
    level: testCase.level,
    dimensions: testCase.dimensions,
    graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length },
    pressure: { parallelGroups: new Set(testCase.graph.edges.filter((edge) => edge.parallelCount > 1).map((edge) => `${edge.sourceId}\u0000${edge.targetId}`)).size, maxParallelBundle: Math.max(...testCase.graph.edges.map((edge) => edge.parallelCount), 0), selfLoops: testCase.graph.edges.filter((edge) => edge.sourceId === edge.targetId).length, labelCount: testCase.graph.nodes.length + testCase.graph.edges.length, representativeLabelChars: Math.max(...testCase.graph.nodes.map((node) => `${node.label ?? ""}${node.description ?? ""}`.length), ...testCase.graph.edges.map((edge) => String(edge.label ?? "").length), 0) },
    exact: { stagedSemanticEquivalent: full.semanticEquivalent, schedulerOffSemanticEquivalent: JSON.stringify(off.semanticResult) === JSON.stringify(full.referenceSignature), schedulerOnSemanticEquivalent: JSON.stringify(on.semanticResult) === JSON.stringify(full.referenceSignature), schedulerOnTraceEquivalent: tracesEquivalent(on.traces, full.referenceTraces), feedbackApplied: off.feedbackApplied },
    source: { route: { status: route.status, semanticEquivalent: route.semanticEquivalent, initializeMs: route.initializeMs, maxStepMs: route.maxStepMs, totalStepMs: sum(route.steps.map(({ elapsedMs }) => elapsedMs)), candidateEvaluations: sum(Object.values(route.candidateCounts).map(Number)), orderedEdgeCount: route.orderedEdgeCount }, relationLabel: { passes: relation.map((item) => ({ status: item.status, semanticEquivalent: item.semanticEquivalent, maxStepMs: item.maxStepMs, totalStepMs: sum(item.steps.map(({ elapsedMs }) => elapsedMs)), candidateEvaluations: item.candidateEvaluations, occupiedLabelChecks: item.occupiedLabelChecks, edgePathPointChecks: item.edgePathPointChecks })) }, nodeLabel: { passes: node.map((item) => ({ status: item.status, semanticEquivalent: item.semanticEquivalent, maxStepMs: item.maxStepMs, totalStepMs: sum(item.steps.map(({ elapsedMs }) => elapsedMs)), candidateEvaluations: item.candidateEvaluations, occupiedLabelChecks: item.occupiedLabelChecks, edgePathPointChecks: item.edgePathPointChecks, yieldingRoutePointChecks: item.yieldingRoutePointChecks })) } },
    diagnosticsOff: { ...offAttribution, totalVerificationMs: full.totalVerificationMs, phaseCounts: off.phaseCostSummary, sourceStepOverPreferred16Ms: offAttribution.maxSourceStepSumMs >= 16, sourceStepOver50Ms: offAttribution.maxSourceStepSumMs >= 50 },
    diagnosticsOn: { ...onAttribution, traceSample: true },
    cooperative: large ? { oneUnit: await cooperative(testCase, schedulerPolicies.oneUnit), elapsedEight: await cooperative(testCase, schedulerPolicies.elapsedEight) } : null,
    cancellation: large ? await cooperative(testCase, schedulerPolicies.oneUnit, 8) : null,
  };
}

async function runStudy() {
  runButton.disabled = true; statusElement.textContent = "Running bounded source-faithful scaling envelope; no Product state is changed...";
  const cases = allCases(); const results = [];
  for (let index = 0; index < cases.length; index += 1) { statusElement.textContent = `Running bounded scaling case ${index + 1}/${cases.length}: ${cases[index]!.id}`; results.push(await measure(cases[index]!, index + 1)); }
  const artifact = { contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-VERIFICATION-SCALING-ENVELOPE-v1", diagnosticOnly: true, generatedAt: new Date().toISOString(), sourceBoundary: "The current synchronous Product authority and existing one-unit/elapsed-eight scheduler policies are measured without changing App.tsx, Product defaults, Dataset, persistence, routing, label, Parallel, Incident, or Self-loop authority.", campaign: { bounded: true, families: 6, levels: 3, cases: cases.length, diagnosticsOffPrimary: true, diagnosticsOnTraceSample: true, sourceStepLimitMs: CASE_MAX_SOURCE_MS, cooperativeLimitMs: CASE_MAX_COOPERATIVE_MS, stopConditions: ["do not exceed declared graph sizes", "stop a case classification at observed source step >= 50ms", "stop cooperative measurement at budget-exhausted/cancelled or declared wall cap"] }, results, status: { executionArchitecture: "B: PROVISIONALLY ADOPT", qualitySolver: "HOLD / NOT ESTABLISHED", productIntegration: "HOLD", productionProvider: "NOT ESTABLISHED", adaptiveCascade: "INACTIVE", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
  (window as Window & { __verificationScalingEnvelope?: unknown }).__verificationScalingEnvelope = artifact; resultsElement.textContent = JSON.stringify(artifact, null, 2); statusElement.textContent = "Completed. Diagnostic-only scaling evidence; no Product behavior was adopted."; runButton.disabled = false;
}

runButton.addEventListener("click", () => { void runStudy(); });
if (new URLSearchParams(window.location.search).get("autorun") === "1") void runStudy();
