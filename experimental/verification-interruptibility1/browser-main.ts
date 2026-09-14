import { settleInitialPlacement, solveAutoLayout } from "../../src/auto-layout.ts";
import { buildEntityGraph, type GraphNode } from "../../src/dataset.ts";
import type { RoutingGraphEdge } from "../../src/graph-presentation.ts";
import { compareRouteGeometry, placeNodeLabel, type LabelRect } from "../../src/viewport.ts";
import { compareNodeLabelAccumulatorWithSynchronous, createNodeLabelAccumulator, stepNodeLabelAccumulator } from "../node-label-accumulator1/prototype.mjs";
import { compareRelationLabelAccumulatorWithSynchronous, createRelationLabelAccumulator, stepRelationLabelAccumulator } from "../relation-label-accumulator1/prototype.mjs";
import { compareRouteAccumulatorWithSynchronous, createRouteAccumulator, stepRouteAccumulator } from "../route-selection-accumulator1/prototype.mjs";
import { compareFullVerificationWithSynchronous, createFullVerificationState, presentationSignature, requestFullVerificationCancellation, stepFullVerification } from "../full-verification1/prototype.mjs";
import { createSchedulerEnvelope, requestSchedulerCancellation, runScheduledVerification, schedulerPolicies, stepScheduledTurn, tracesEquivalent } from "../scheduler-policy1/prototype.mjs";
import { createVerificationState, requestVerificationCancellation, runVerification, stepVerification } from "./prototype.mjs";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name?: string };
type DatasetLike = { entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Relation[] };
type BrowserCase = { id: string; category: string; locale: "en" | "ja"; graph: { nodes: GraphNode[]; edges: RoutingGraphEdge[] }; positions: Record<string, Point>; solveInput: { entities: Array<{ id: string }>; relations: Relation[] } };

const statusElement = document.querySelector<HTMLParagraphElement>("#status")!;
const resultsElement = document.querySelector<HTMLPreElement>("#results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;

function relation(id: string, sourceId: string, targetId: string, locale: "en" | "ja", index: number): Relation {
  const label = locale === "ja" ? `関係ラベル ${index} 長い説明文` : `Relation label ${index} with explanatory text`;
  return { id, sourceId, targetId, name: label };
}

function graphFromRelations(id: string, category: string, locale: "en" | "ja", nodeIds: string[], relations: Relation[], longLabels = false): BrowserCase {
  const solveInput = { entities: nodeIds.map((nodeId) => ({ id: nodeId })), relations };
  const positions = solveAutoLayout(solveInput, { iterations: 3 });
  const entities = nodeIds.map((nodeId, index) => ({
    id: nodeId,
    name: longLabels ? (locale === "ja" ? `長いノード名称 ${index} 追加説明` : `Long Node ${index} with an explanatory presentation label`) : `Node ${index}`,
    description: longLabels ? "Additional description used by the Product label placement authority." : "",
  }));
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
  const nodes = entities.map((entity) => ({ id: entity.id, label: String(entity.name ?? entity.id), description: String(entity.description ?? ""), x: positions[entity.id]?.x ?? 160, y: positions[entity.id]?.y ?? 160 }));
  return { id, category, locale, graph: { nodes, edges }, positions, solveInput };
}

function denseCase() {
  const nodeIds = Array.from({ length: 14 }, (_, index) => `dense-${index}`);
  const relations: Relation[] = [];
  let index = 0;
  for (let source = 0; source < 7; source += 1) for (let offset = 1; offset <= 7; offset += 1) {
    relations.push(relation(`dense-r${index}`, nodeIds[source]!, nodeIds[(source + offset) % 14]!, "en", index));
    index += 1;
  }
  return graphFromRelations("dense-k7-7", "dense", "en", nodeIds, relations);
}

function parallelCase() {
  const nodeIds = Array.from({ length: 8 }, (_, index) => `parallel-${index}`);
  const relations = Array.from({ length: 10 }, (_, index) => relation(`parallel-bundle-${index}`, "parallel-0", "parallel-1", "en", index));
  relations.push(...nodeIds.slice(1, -1).map((nodeId, index) => relation(`parallel-support-${index}`, nodeId, nodeIds[index + 2]!, "en", index + 10)));
  return graphFromRelations("parallel-pressure", "parallel", "en", nodeIds, relations);
}

function longLabelCase() {
  const nodeIds = Array.from({ length: 10 }, (_, index) => `label-${index}`);
  return graphFromRelations("long-label-pressure", "label-heavy", "en", nodeIds, nodeIds.map((nodeId, index) => relation(`label-ring-${index}`, nodeId, nodeIds[(index + 1) % nodeIds.length]!, "en", index)), true);
}

function selfLoopCase() {
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
  return { id: "canonical-lighthouse-en", category: "canonical", locale: "en", graph: { nodes: graph.nodes.map((node) => ({ ...node, label: String(node.label ?? node.id), description: String(node.description ?? ""), ...(positions[node.id] ?? {}) })), edges }, positions, solveInput };
}

function provisionalLabels(testCase: BrowserCase, positions: Record<string, Point>): LabelRect[] {
  return testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, String(node.label ?? node.id), String(node.description ?? ""), [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
}

function cooperativeRouteAccumulator(testCase: BrowserCase, cancelAfterMs = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const state = createRouteAccumulator(verificationInput(testCase));
    const startedAt = performance.now();
    let cancelRequested = false;
    let requestedAt: number | null = null;
    const timer = window.setTimeout(() => { requestedAt = performance.now(); cancelRequested = true; }, cancelAfterMs);
    const step = () => {
      if (cancelRequested) {
        const observedAt = performance.now();
        window.clearTimeout(timer);
        resolve({ status: "cancelled", completedUnits: state.nextIndex, cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)), elapsedMs: Number((observedAt - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      if (!state.done) stepRouteAccumulator(state);
      if (state.done) {
        window.clearTimeout(timer);
        resolve({ status: "completed", completedUnits: state.nextIndex, cancelDeliveryMs: null, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

function verificationInput(testCase: BrowserCase) {
  const positions = Object.fromEntries(Object.entries(testCase.positions).map(([id, point]) => [id, { ...point }]));
  return { graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(testCase, positions), previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true };
}

function relationLabelInput(testCase: BrowserCase, routedEdges: readonly RoutingGraphEdge[], pass: "first" | "feedback") {
  return {
    routedEdges,
    nodes: testCase.graph.nodes.map(({ id }) => testCase.positions[id]!),
    previousPlacements: new Map<string, LabelRect>(),
    manualAnchors: new Map(),
    pass,
  };
}

function routeDeviation(left: readonly Point[], right: readonly Point[]) {
  const count = Math.min(left.length, right.length);
  if (count === 0) return 0;
  return left.slice(0, count).reduce((total, point, index) => total + Math.hypot(point.x - right[index]!.x, point.y - right[index]!.y), 0) / count;
}

function yieldingRoutesForNodePass(labelFreeRoutes: readonly RoutingGraphEdge[], routes: readonly RoutingGraphEdge[]) {
  return routes.flatMap((route) => {
    const labelFreeRoute = labelFreeRoutes.find((candidate) => candidate.id === route.id);
    if (!labelFreeRoute || compareRouteGeometry(route.samples, labelFreeRoute.samples).equivalent) return [];
    const deviation = routeDeviation(route.samples, labelFreeRoute.samples);
    return deviation >= 12 ? [{ samples: labelFreeRoute.samples, deviation }] : [];
  });
}

function nodeLabelInput(testCase: BrowserCase, routedEdges: readonly RoutingGraphEdge[], occupiedRelationLabels: ReadonlyMap<string, LabelRect>, yieldingRoutes: readonly { samples: Point[]; deviation: number }[], pass: "first" | "feedback") {
  return {
    nodes: testCase.graph.nodes,
    positions: testCase.positions,
    routedEdges,
    occupiedRelationLabels,
    previousPlacements: new Map<string, LabelRect>(),
    manualOffsets: new Map(),
    yieldingRoutes,
    pass,
  };
}

function cooperativeNodeLabelAccumulator(input: ReturnType<typeof nodeLabelInput>, cancelAfterMs = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const state = createNodeLabelAccumulator(input);
    const startedAt = performance.now();
    let cancelRequested = false;
    let requestedAt: number | null = null;
    const timer = window.setTimeout(() => { requestedAt = performance.now(); cancelRequested = true; }, cancelAfterMs);
    const step = () => {
      if (cancelRequested) {
        const observedAt = performance.now();
        window.clearTimeout(timer);
        resolve({ status: "cancelled", completedUnits: state.nextIndex, acceptedPrefixLength: state.acceptedNodeLabels.length, cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)), elapsedMs: Number((observedAt - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      if (!state.done) stepNodeLabelAccumulator(state);
      if (state.done) {
        window.clearTimeout(timer);
        resolve({ status: "completed", completedUnits: state.nextIndex, acceptedPrefixLength: state.acceptedNodeLabels.length, cancelDeliveryMs: null, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

function cooperativeRelationLabelAccumulator(testCase: BrowserCase, routedEdges: readonly RoutingGraphEdge[], pass: "first" | "feedback", cancelAfterMs = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const state = createRelationLabelAccumulator(relationLabelInput(testCase, routedEdges, pass));
    const startedAt = performance.now();
    let cancelRequested = false;
    let requestedAt: number | null = null;
    const timer = window.setTimeout(() => { requestedAt = performance.now(); cancelRequested = true; }, cancelAfterMs);
    const step = () => {
      if (cancelRequested) {
        const observedAt = performance.now();
        window.clearTimeout(timer);
        resolve({ status: "cancelled", completedUnits: state.nextIndex, acceptedPrefixLength: state.occupiedLabels.length, cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)), elapsedMs: Number((observedAt - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      if (!state.done) stepRelationLabelAccumulator(state);
      if (state.done) {
        window.clearTimeout(timer);
        resolve({ status: "completed", completedUnits: state.nextIndex, acceptedPrefixLength: state.occupiedLabels.length, cancelDeliveryMs: null, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), partialProductResultExposed: false });
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

async function summarize(testCase: BrowserCase) {
  const input = verificationInput(testCase);
  const result = runVerification(input, { maxStepMs: 50 });
  const fullVerification = compareFullVerificationWithSynchronous(input, { maxSteps: 100000 });
  const routeResult = compareRouteAccumulatorWithSynchronous(input, { maxStepMs: 50 });
  const relationPassInputs = [
    result.state.firstRoutes ? { pass: "first" as const, routedEdges: result.state.firstRoutes } : null,
    result.state.feedbackRoutes ? { pass: "feedback" as const, routedEdges: result.state.feedbackRoutes } : null,
  ].filter((value): value is { pass: "first" | "feedback"; routedEdges: readonly RoutingGraphEdge[] } => value !== null);
  const relationPassResults = relationPassInputs.map(({ pass, routedEdges }) => compareRelationLabelAccumulatorWithSynchronous(relationLabelInput(testCase, routedEdges, pass), { maxStepMs: 50 }));
  const nodePassInputs = [
    result.state.firstRoutes && result.state.firstRelationLabels ? { pass: "first" as const, routedEdges: result.state.firstRoutes, relationLabels: result.state.firstRelationLabels } : null,
    result.state.feedbackRoutes && result.state.feedbackRelationLabels ? { pass: "feedback" as const, routedEdges: result.state.feedbackRoutes, relationLabels: result.state.feedbackRelationLabels } : null,
  ].filter((value): value is { pass: "first" | "feedback"; routedEdges: readonly RoutingGraphEdge[]; relationLabels: ReadonlyMap<string, LabelRect> } => value !== null);
  const nodePassInputsWithYieldingRoutes = nodePassInputs.map(({ pass, routedEdges, relationLabels }) => ({
    pass,
    routedEdges,
    relationLabels,
    yieldingRoutes: yieldingRoutesForNodePass(result.state.labelFreeRoutes ?? [], routedEdges),
  }));
  const nodePassResults = nodePassInputsWithYieldingRoutes.map(({ pass, routedEdges, relationLabels, yieldingRoutes }) => compareNodeLabelAccumulatorWithSynchronous(nodeLabelInput(testCase, routedEdges, relationLabels, yieldingRoutes, pass), { maxStepMs: 50 }));
  return {
    id: testCase.id,
    category: testCase.category,
    nodes: testCase.graph.nodes.length,
    edges: testCase.graph.edges.length,
    status: result.status,
    stageCount: result.stageCount,
    maxStageMs: result.maxStageMs,
    overBudgetStages: result.overBudgetStages,
    stageTimings: result.stageTimings,
    partialResultExposed: result.status !== "completed" && result.result !== null,
    routeAccumulator: {
      status: routeResult.status,
      semanticEquivalent: routeResult.semanticEquivalent,
      orderedEdgeCount: routeResult.orderedEdgeCount,
      maxStepMs: routeResult.maxStepMs,
      initializeMs: routeResult.initializeMs,
      initializeOverBudget: routeResult.initializeOverBudget,
      overBudgetSteps: routeResult.overBudgetSteps,
      acceptedPrefixLength: routeResult.acceptedPrefixLength,
      futureEdgesRetainedDuringInitialization: routeResult.orderedEdgeCount > 1,
      steps: routeResult.steps.map(({ edgeId, elapsedMs, acceptedPrefixLength }) => ({ edgeId, elapsedMs, acceptedPrefixLength })),
      cooperative: await cooperativeRouteAccumulator(testCase),
    },
    relationLabelAccumulator: {
      passes: relationPassResults.map((passResult, index) => ({
        pass: relationPassInputs[index]!.pass,
        status: passResult.status,
        semanticEquivalent: passResult.semanticEquivalent,
        traceEquivalent: passResult.traceEquivalent,
        orderedEdgeCount: passResult.orderedEdgeCount,
        labelledEdgeCount: passResult.labelledEdgeCount,
        initializeMs: passResult.initializeMs,
        initializeOverBudget: passResult.initializeOverBudget,
        maxStepMs: passResult.maxStepMs,
        overBudgetSteps: passResult.overBudgetSteps,
        acceptedPrefixLength: passResult.acceptedPrefixLength,
        pathBoundsBuildCount: passResult.pathBoundsBuildCount,
        pathBoundsPointVisits: passResult.pathBoundsPointVisits,
        candidateEvaluations: passResult.candidateEvaluations,
        occupiedLabelChecks: passResult.occupiedLabelChecks,
        edgePathPointChecks: passResult.edgePathPointChecks,
        pathBroadPhaseRejects: passResult.pathBroadPhaseRejects,
        manualAnchorReconstructions: passResult.manualAnchorReconstructions,
        steps: passResult.steps.map(({ relationId, skipped, elapsedMs, acceptedPrefixLength }) => ({ relationId, skipped, elapsedMs, acceptedPrefixLength })),
      })),
      cooperative: relationPassInputs[0] ? await cooperativeRelationLabelAccumulator(testCase, relationPassInputs[0].routedEdges, relationPassInputs[0].pass) : null,
    },
    nodeLabelAccumulator: {
      passes: nodePassResults.map((passResult, index) => ({
        pass: nodePassInputsWithYieldingRoutes[index]!.pass,
        status: passResult.status,
        semanticEquivalent: passResult.semanticEquivalent,
        traceEquivalent: passResult.traceEquivalent,
        orderedNodeCount: passResult.orderedNodeCount,
        initialRelationLabelCount: passResult.initialRelationLabelCount,
        yieldingRouteCount: passResult.yieldingRouteCount,
        initializeMs: passResult.initializeMs,
        initializeOverBudget: passResult.initializeOverBudget,
        maxStepMs: passResult.maxStepMs,
        overBudgetSteps: passResult.overBudgetSteps,
        acceptedPrefixLength: passResult.acceptedPrefixLength,
        edgePathCount: passResult.edgePathCount,
        pathBoundsBuildCount: passResult.pathBoundsBuildCount,
        pathBoundsPointVisits: passResult.pathBoundsPointVisits,
        candidateEvaluations: passResult.candidateEvaluations,
        occupiedLabelChecks: passResult.occupiedLabelChecks,
        otherNodeChecks: passResult.otherNodeChecks,
        edgePathPointChecks: passResult.edgePathPointChecks,
        yieldingRoutePointChecks: passResult.yieldingRoutePointChecks,
        pathBroadPhaseRejects: passResult.pathBroadPhaseRejects,
        yieldingRouteBroadPhaseRejects: passResult.yieldingRouteBroadPhaseRejects,
        previousPlacementEvaluations: passResult.previousPlacementEvaluations,
        steps: passResult.steps.map(({ nodeId, elapsedMs, acceptedPrefixLength, occupiedSequenceLength }) => ({ nodeId, elapsedMs, acceptedPrefixLength, occupiedSequenceLength })),
      })),
      cooperative: nodePassInputsWithYieldingRoutes[0] ? await cooperativeNodeLabelAccumulator(nodeLabelInput(testCase, nodePassInputsWithYieldingRoutes[0].routedEdges, nodePassInputsWithYieldingRoutes[0].relationLabels, nodePassInputsWithYieldingRoutes[0].yieldingRoutes, nodePassInputsWithYieldingRoutes[0].pass)) : null,
    },
    fullVerification: {
      status: fullVerification.status,
      semanticEquivalent: fullVerification.semanticEquivalent,
      traceEquivalent: fullVerification.traceEquivalent,
      initializationMs: fullVerification.initializationMs,
      scheduledStepCount: fullVerification.scheduledStepCount,
      completedWorkUnits: fullVerification.completedWorkUnits,
      completedPhaseTransitions: fullVerification.completedPhaseTransitions,
      maxWorkUnitMs: fullVerification.maxWorkUnitMs,
      maxScheduledSliceMs: fullVerification.maxScheduledSliceMs,
      totalVerificationMs: fullVerification.totalVerificationMs,
      partialResultExposed: fullVerification.partialResultExposed,
      feedbackApplied: fullVerification.feedbackApplied,
      phaseCounts: Object.fromEntries([...new Set(fullVerification.steps.map(({ phase }) => phase))].map((phase) => [phase, fullVerification.steps.filter((step) => step.phase === phase).length])),
      phaseCostSummary: Object.fromEntries([...new Set(fullVerification.steps.map(({ phase }) => phase))].map((phase) => {
        const phaseSteps = fullVerification.steps.filter((step) => step.phase === phase);
        return [phase, {
          kind: phaseSteps[0]?.kind,
          count: phaseSteps.length,
          maxMs: Number(Math.max(...phaseSteps.map(({ elapsedMs }) => elapsedMs), 0).toFixed(3)),
          totalMs: Number(phaseSteps.reduce((sum, { elapsedMs }) => sum + elapsedMs, 0).toFixed(3)),
        }];
      })),
      cooperativeCancel: await cooperativeFullVerification(testCase),
      cooperativeComplete: await cooperativeFullVerification(testCase, null),
      schedulerPolicyStudy: await schedulerPolicyStudy(testCase, fullVerification),
    },
  };
}

function cooperative(testCase: BrowserCase, cancelAfterMs = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let state = createVerificationState(verificationInput(testCase), { maxStepMs: 50 });
    const startedAt = performance.now();
    let requestedAt: number | null = null;
    let observedAt: number | null = null;
    const timer = window.setTimeout(() => { requestedAt = performance.now(); state = requestVerificationCancellation(state); }, cancelAfterMs);
    const step = () => {
      if (state.status === "running") state = stepVerification(state);
      if (state.status === "cancelled") {
        observedAt = performance.now();
        window.clearTimeout(timer);
        resolve({ status: state.status, completedStages: state.stageTimings.length, stageTimings: state.stageTimings, cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)), elapsedMs: Number((observedAt - startedAt).toFixed(3)), partialResultExposed: state.result !== null });
        return;
      }
      if (state.status === "completed") {
        window.clearTimeout(timer);
        resolve({ status: state.status, completedStages: state.stageTimings.length, stageTimings: state.stageTimings, cancelDeliveryMs: null, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), partialResultExposed: false });
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

function cooperativeFullVerification(testCase: BrowserCase, cancelAfterMs: number | null = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const envelope = createFullVerificationState(verificationInput(testCase));
    const startedAt = performance.now();
    let requestedAt: number | null = null;
    const timer = cancelAfterMs === null ? null : window.setTimeout(() => {
      requestedAt = performance.now();
      requestFullVerificationCancellation(envelope);
    }, cancelAfterMs);
    const finish = (status: string, partialProductResultExposed: boolean) => {
      const observedAt = performance.now();
      if (timer !== null) window.clearTimeout(timer);
      const elapsedMs = observedAt - startedAt;
      const schedulerWorkMs = envelope.schedulerSlices.reduce((sum, { elapsedMs: sliceMs }) => sum + sliceMs, 0);
      resolve({
        status,
        completedWorkUnits: envelope.state.completedWorkUnits,
        completedPhaseTransitions: envelope.state.completedPhaseTransitions,
        scheduledStepCount: envelope.state.scheduledStepCount,
        maxSchedulerStepMs: Math.max(...envelope.schedulerSlices.map(({ elapsedMs: sliceMs }) => sliceMs), 0),
        schedulerWorkMs: Number(schedulerWorkMs.toFixed(3)),
        schedulerOverheadMs: Number(Math.max(0, elapsedMs - schedulerWorkMs).toFixed(3)),
        cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)),
        elapsedMs: Number(elapsedMs.toFixed(3)),
        partialProductResultExposed,
      });
    };
    const step = () => {
      if (envelope.state.status === "running") stepFullVerification(envelope);
      if (envelope.state.status === "cancelled") {
        finish(envelope.state.status, envelope.state.result !== null);
        return;
      }
      if (envelope.state.status === "completed") {
        finish(envelope.state.status, false);
        return;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

function diagnosticEventCount(traces: Record<string, unknown[]>) {
  return Object.values(traces).reduce((sum, values) => sum + values.length, 0);
}

function schedulerDirectSummary(result: Record<string, any>) {
  return {
    status: result.status,
    semanticEquivalent: result.semanticEquivalent,
    traceEquivalent: result.traceEquivalent,
    initializationMs: result.initializationMs,
    scheduledTurnCount: result.scheduledTurnCount,
    scheduledStepCount: result.scheduledStepCount,
    completedWorkUnits: result.completedWorkUnits,
    completedPhaseTransitions: result.completedPhaseTransitions,
    maxWorkUnitMs: result.maxWorkUnitMs,
    maxPhaseTransitionMs: result.maxPhaseTransitionMs,
    maxTurnMs: result.maxTurnMs,
    totalTurnComputeMs: result.totalTurnComputeMs,
    maxUnitsPerTurnObserved: result.maxUnitsPerTurnObserved,
    longestSteps: result.longestSteps,
    phaseCostSummary: result.phaseCostSummary,
    partialResultExposed: result.partialResultExposed,
    feedbackApplied: result.feedbackApplied,
    diagnosticEventCount: diagnosticEventCount(result.traces),
  };
}

function sourceStepAttributionRun(testCase: BrowserCase, captureDiagnostics: boolean, reference: Record<string, any>) {
  const policy = schedulerPolicies.oneUnit;
  const first = runScheduledVerification(verificationInput(testCase), { policy, maxTurns: 100000, captureDiagnostics });
  const repeat = runScheduledVerification(verificationInput(testCase), { policy, maxTurns: 100000, captureDiagnostics });
  const summarize = (result: Record<string, any>) => {
    const exact = {
      semanticEquivalent: result.status === "completed" && JSON.stringify(result.semanticResult) === JSON.stringify(reference.semanticResult),
      traceEquivalent: captureDiagnostics && tracesEquivalent(result.traces, reference.referenceTraces),
    };
    const allTurns = result.turns.map(({ turnId, startedAt, endedAt, elapsedMs, sourceStepCount, sourceSteps, sourceStepElapsedMs, schedulerGapMs, workUnits, phaseTransitions, cancelObserved }) => ({
      turnId,
      startedAt,
      endedAt,
      elapsedMs,
      sourceStepCount,
      sourceSteps,
      sourceStepElapsedMs,
      schedulerGapMs,
      workUnits,
      phaseTransitions,
      cancelObserved,
    }));
    const retainedTurnIds = new Set(allTurns.slice().sort((left, right) => right.elapsedMs - left.elapsedMs).slice(0, 3).map(({ turnId }) => turnId));
    const turns = allTurns.filter(({ turnId, elapsedMs }) => retainedTurnIds.has(turnId) || elapsedMs >= 16);
    return {
      ...schedulerDirectSummary({ ...result, ...exact }),
      ...exact,
      maxSchedulerGapMs: Math.max(...allTurns.map(({ schedulerGapMs }) => schedulerGapMs), 0),
      maxSourceStepSumMs: Math.max(...allTurns.map(({ sourceStepElapsedMs }) => sourceStepElapsedMs), 0),
      outlierTurnsAt16ms: turns.filter(({ elapsedMs }) => elapsedMs >= 16).map(({ turnId, elapsedMs, sourceSteps, sourceStepElapsedMs, schedulerGapMs }) => ({ turnId, elapsedMs, sourceSteps, sourceStepElapsedMs, schedulerGapMs })),
      outlierTurnsAt50ms: turns.filter(({ elapsedMs }) => elapsedMs >= 50).map(({ turnId, elapsedMs, sourceSteps, sourceStepElapsedMs, schedulerGapMs }) => ({ turnId, elapsedMs, sourceSteps, sourceStepElapsedMs, schedulerGapMs })),
      turns,
    };
  };
  return { first: summarize(first), repeat: summarize(repeat) };
}

function sourceStepAttribution(testCase: BrowserCase, reference: Record<string, any>) {
  const diagnosticsOff = sourceStepAttributionRun(testCase, false, reference);
  const diagnosticsOn = sourceStepAttributionRun(testCase, true, reference);
  const allRuns = [diagnosticsOff.first, diagnosticsOff.repeat, diagnosticsOn.first, diagnosticsOn.repeat];
  return {
    policy: schedulerPolicies.oneUnit,
    diagnosticsOff,
    diagnosticsOn,
    semanticEquivalent: allRuns.every(({ status, semanticEquivalent }) => status === "completed" && semanticEquivalent === true),
    traceEquivalent: [diagnosticsOn.first, diagnosticsOn.repeat].every(({ traceEquivalent }) => traceEquivalent === true),
    attributionRule: "state.steps and scheduler turns are recorded in the same run; diagnostics-off/on and first/repeat are compared without changing the state machine",
  };
}

function cooperativeSchedulerPolicy(testCase: BrowserCase, policy: Record<string, any>, referenceSignature: unknown, cancelAfterMs: number | null = 8): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const envelope = createSchedulerEnvelope(verificationInput(testCase), { policy, captureDiagnostics: false });
    const startedAt = performance.now();
    let requestedAt: number | null = null;
    const timer = cancelAfterMs === null ? null : window.setTimeout(() => {
      requestedAt = performance.now();
      requestSchedulerCancellation(envelope);
    }, cancelAfterMs);
    const finish = () => {
      const observedAt = performance.now();
      if (timer !== null) window.clearTimeout(timer);
      const elapsedMs = observedAt - startedAt;
      const schedulerWorkMs = envelope.schedulerTurns.reduce((sum, { elapsedMs: turnMs }) => sum + turnMs, 0);
      const completed = envelope.state.status === "completed";
      resolve({
        status: envelope.state.status,
        semanticEquivalent: completed ? JSON.stringify(envelope.state.result ? presentationSignature(envelope.state.result) : null) === JSON.stringify(referenceSignature) : null,
        completedWorkUnits: envelope.state.completedWorkUnits,
        completedPhaseTransitions: envelope.state.completedPhaseTransitions,
        scheduledTurnCount: envelope.schedulerTurns.length,
        scheduledStepCount: envelope.state.scheduledStepCount,
        maxSchedulerStepMs: Math.max(...envelope.schedulerTurns.map(({ elapsedMs: turnMs }) => turnMs), 0),
        schedulerWorkMs: Number(schedulerWorkMs.toFixed(3)),
        schedulerOverheadMs: Number(Math.max(0, elapsedMs - schedulerWorkMs).toFixed(3)),
        cancelDeliveryMs: requestedAt === null ? null : Number((observedAt - requestedAt).toFixed(3)),
        elapsedMs: Number(elapsedMs.toFixed(3)),
        partialProductResultExposed: envelope.state.result !== null && !completed,
      });
    };
    const step = () => {
      if (envelope.state.status === "running" || envelope.cancelRequested) stepScheduledTurn(envelope);
      if (envelope.state.status !== "running") { finish(); return; }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  });
}

async function schedulerPolicyStudy(testCase: BrowserCase, reference: Record<string, any>) {
  const input = verificationInput(testCase);
  const policies = [];
  for (const policy of Object.values(schedulerPolicies) as Array<Record<string, any>>) {
    const instrumented = runScheduledVerification(input, { policy, maxTurns: 100000, captureDiagnostics: true });
    const runtime = runScheduledVerification(input, { policy, maxTurns: 100000, captureDiagnostics: false });
    const exact = {
      semanticEquivalent: JSON.stringify(instrumented.semanticResult) === JSON.stringify(reference.semanticResult),
      traceEquivalent: tracesEquivalent(instrumented.traces, reference.referenceTraces),
    };
    policies.push({
      id: policy.id,
      mode: policy.mode,
      policy,
      exact,
      instrumented: schedulerDirectSummary({ ...instrumented, ...exact }),
      runtime: schedulerDirectSummary(runtime),
      instrumentationDeltaMs: Number((instrumented.totalTurnComputeMs - runtime.totalTurnComputeMs).toFixed(3)),
      cooperativeCancel: await cooperativeSchedulerPolicy(testCase, policy, reference.semanticResult),
      cooperativeComplete: await cooperativeSchedulerPolicy(testCase, policy, reference.semanticResult, null),
    });
  }
  return {
    contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-SCHEDULER-POLICY-STUDY-v1",
    policies,
    baseline: "one-unit",
    sourceStepAttribution: sourceStepAttribution(testCase, reference),
    partialProductCommit: false,
    authorityMigration: false,
  };
}

async function runStudy() {
  runButton.disabled = true;
  statusElement.textContent = "Running source-faithful staged verification; no Product state is changed…";
  const cases = [await canonicalCase(), denseCase(), parallelCase(), longLabelCase(), selfLoopCase()];
  const results = [];
  for (const testCase of cases) results.push({ wholePassStageModel: await summarize(testCase), cooperative: await cooperative(testCase), fullVerificationCooperative: await cooperativeFullVerification(testCase) });
  const artifact = {
    contract: "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-FULL-VERIFICATION-RESUMABLE-v1",
    diagnosticOnly: true,
    generatedAt: new Date().toISOString(),
    sourceBoundary: "The full verification accumulator composes the existing Product-owned Route, Relation-label, and Node-label accumulators; it does not change App.tsx or move authority.",
    executionModel: "one route/Relation-label/Node-label work unit or explicit phase transition per scheduler turn; yielding-route derivation and feedback decision remain measured orchestration boundaries",
    results,
    status: { executionArchitecture: "B: PROVISIONALLY ADOPT", fullVerification: "DIAGNOSTIC BUDGET STUDY", qualitySolver: "HOLD / NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY" },
  };
  (window as Window & { __verificationInterruptibilityStudy?: unknown }).__verificationInterruptibilityStudy = artifact;
  resultsElement.textContent = JSON.stringify(artifact, null, 2);
  statusElement.textContent = "Completed. Diagnostic-only staged evidence; no Product behavior was adopted.";
  runButton.disabled = false;
}

runButton.addEventListener("click", () => { void runStudy(); });
if (new URLSearchParams(window.location.search).get("autorun") === "1") void runStudy();
