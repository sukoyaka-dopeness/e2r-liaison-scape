import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import {
  createAutomaticPresentationProfiler,
  deriveBoundedAutomaticPresentation,
  type AutomaticNodeLabelRecoveryTrace,
  type BoundedAutomaticPresentation,
  type DerivedAutomaticRoute,
} from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect, type Point } from "../src/viewport.ts";

type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { fixture: string; family: string; dataset: Dataset; positions: Record<string, Point>; productDerivedPrevious: Record<string, LabelRect> };
type RecoveryMode = "baseline" | "product-candidate";
type State = { previous: Map<string, LabelRect>; previousRelationLabels: Map<string, LabelRect>; previousRoutes: Map<string, DerivedAutomaticRoute>; generation: number };
type StepOptions = {
  phase: "idle" | "node-drag-active" | "node-drag-finalizing";
  positions?: Record<string, Point>;
  activeDraggedNodeId?: string;
  draggedNodeId?: string;
  preserveSafeIncidentPreviousRoute?: boolean;
  feedbackEnabled?: boolean;
  manualOffsets?: ReadonlyMap<string, { x: number; y: number }>;
  relationLabelNormalOffsets?: readonly number[];
  resetPrevious?: boolean;
};

const sourceArtifactPath = path.join(process.cwd(), "experimental", "product-node-label-hysteresis-recovery-attribution1", "result-summary.json");
const sourceArtifact = JSON.parse(fs.readFileSync(sourceArtifactPath, "utf8")) as { rows: Fixture[] };
const FIXTURE_IDS = [
  "horizontal-label-capacity",
  "high-degree-angular-capacity",
  "parallel-self-loop-control",
  "lighthouse-en",
  "lighthouse-ja",
];

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function graphFor(fixture: Fixture) {
  const graph = buildEntityGraph(fixture.dataset as never);
  const labels = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name ?? ""]));
  return { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? "" })) };
}

function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!, node.label, node.description, [],
    graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [],
  ));
}

function nodeFingerprint(values: ReadonlyMap<string, LabelRect>) {
  return digest([...values.entries()]);
}

function routeFingerprint(routes: readonly DerivedAutomaticRoute[]) {
  return digest(routes.map(({ id, sourceId, targetId, samples, controlPoint }) => ({ id, sourceId, targetId, samples, controlPoint })));
}

function relationFingerprint(presentation: BoundedAutomaticPresentation) {
  return digest([...presentation.relationLabels.entries()]);
}

function traceSummary(traces: readonly AutomaticNodeLabelRecoveryTrace[]) {
  const reasonCounts: Record<string, number> = {};
  for (const trace of traces) reasonCounts[trace.recoveryReason] = (reasonCounts[trace.recoveryReason] ?? 0) + 1;
  return {
    count: traces.length,
    candidateCounts: [...new Set(traces.map(({ candidateCount }) => candidateCount))],
    triggeredCount: traces.filter(({ recoveryTriggered }) => recoveryTriggered).length,
    reasonCounts,
    activeSuppressionCount: traces.filter(({ recoveryReason }) => recoveryReason === "active-drag-suppressed").length,
    manualAuthorityCount: traces.filter(({ recoveryReason }) => recoveryReason === "manual-offset-authoritative").length,
  };
}

function deriveOnce(
  fixture: Fixture,
  graph: ReturnType<typeof graphFor>,
  state: Pick<State, "previous" | "previousRelationLabels" | "previousRoutes">,
  options: StepOptions,
  mode: RecoveryMode,
  collectTraces: boolean,
) {
  const positions = options.positions ?? fixture.positions;
  const built = buildEntityGraph(fixture.dataset as never);
  const traces: AutomaticNodeLabelRecoveryTrace[] = [];
  const passSnapshots: Array<{ pass: string; route: string; relation: string; node: string }> = [];
  const profiler = createAutomaticPresentationProfiler();
  const startedAt = performance.now();
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(built, positions),
    previousNodeLabelPlacements: new Map(state.previous),
    previousRelationLabelPlacements: new Map(state.previousRelationLabels),
    manualNodeLabelOffsets: options.manualOffsets ?? new Map(),
    manualRelationLabelAnchors: new Map(),
    previousAutomaticRoutes: new Map(state.previousRoutes),
    draggedNodeId: options.draggedNodeId,
    activeDraggedNodeId: options.activeDraggedNodeId,
    activelyDraggedNodeId: options.activeDraggedNodeId,
    preserveSafeIncidentPreviousRoute: options.preserveSafeIncidentPreviousRoute,
    feedbackEnabled: options.feedbackEnabled ?? true,
    relationLabelNormalOffsets: options.relationLabelNormalOffsets,
    profiler,
    nodeLabelRecoveryMode: mode === "product-candidate" ? "product-candidate" : undefined,
    nodeLabelRecoveryTraceSink: collectTraces ? (trace) => traces.push(trace) : undefined,
    presentationPassSink: (snapshot) => passSnapshots.push({
      pass: passSnapshots.length === 0 ? "first" : "feedback",
      route: routeFingerprint(snapshot.route.routes),
      relation: digest([...snapshot.relationLabel.labels.entries()]),
      node: digest([...snapshot.nodeLabel.labels.entries()]),
    }),
  });
  return {
    presentation,
    elapsedMs: performance.now() - startedAt,
    profiler,
    traces,
    passSnapshots,
  };
}

function summarizeStep(
  fixture: Fixture,
  graph: ReturnType<typeof graphFor>,
  state: State,
  options: StepOptions,
  mode: RecoveryMode,
) {
  if (options.resetPrevious) {
    state.previous.clear();
    state.previousRelationLabels.clear();
    state.previousRoutes.clear();
  }
  const inputPrevious = new Map(state.previous);
  const derived = deriveOnce(fixture, graph, state, options, mode, true);
  state.previous = new Map(derived.presentation.nodeLabels);
  state.previousRelationLabels = new Map(derived.presentation.relationLabels);
  state.previousRoutes = new Map(derived.presentation.routedEdges.map((route) => [route.id, route]));
  state.generation += 1;
  const firstProfile = derived.profiler.passes.first;
  const feedbackProfile = derived.profiler.passes.feedback;
  return {
    generation: state.generation,
    phase: options.phase,
    previousSnapshotSize: inputPrevious.size,
    nextPreviousSnapshotSize: state.previous.size,
    recovery: traceSummary(derived.traces),
    passSnapshots: derived.passSnapshots,
    feedbackApplied: derived.presentation.feedbackApplied,
    routeFingerprint: routeFingerprint(derived.presentation.routedEdges),
    relationFingerprint: relationFingerprint(derived.presentation),
    nodeFingerprint: nodeFingerprint(derived.presentation.nodeLabels),
    metrics: {
      elapsedMs: derived.elapsedMs,
      firstPassNodeLabelMs: firstProfile.nodeLabelMs,
      feedbackPassNodeLabelMs: feedbackProfile.nodeLabelMs,
      firstPassCandidateEvaluations: firstProfile.nodeLabel.candidateEvaluations,
      feedbackPassCandidateEvaluations: feedbackProfile.nodeLabel.candidateEvaluations,
      recoveryComparisonMs: firstProfile.nodeLabel.recoveryComparisonMs + feedbackProfile.nodeLabel.recoveryComparisonMs,
      recoveryCandidateRows: firstProfile.nodeLabel.recoveryCandidateRows + feedbackProfile.nodeLabel.recoveryCandidateRows,
    },
  };
}

function sequenceFor(fixture: Fixture, mode: RecoveryMode) {
  const graph = graphFor(fixture);
  const firstNodeId = graph.nodes[0]?.id;
  const movedPositions = { ...fixture.positions, ...(firstNodeId ? { [firstNodeId]: { x: fixture.positions[firstNodeId]!.x + 70, y: fixture.positions[firstNodeId]!.y + 26 } } : {}) };
  const state: State = { previous: new Map(), previousRelationLabels: new Map(), previousRoutes: new Map(), generation: 0 };
  const clean = summarizeStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true }, mode);
  const identical = summarizeStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true }, mode);
  const identicalStable = summarizeStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true }, mode);
  const active = summarizeStep(fixture, graph, state, { phase: "node-drag-active", positions: movedPositions, activeDraggedNodeId: firstNodeId, draggedNodeId: firstNodeId, feedbackEnabled: false }, mode);
  const move = summarizeStep(fixture, graph, state, { phase: "node-drag-active", positions: { ...movedPositions, ...(firstNodeId ? { [firstNodeId]: { x: movedPositions[firstNodeId]!.x + 28, y: movedPositions[firstNodeId]!.y + 18 } } : {}) }, activeDraggedNodeId: firstNodeId, draggedNodeId: firstNodeId, feedbackEnabled: false }, mode);
  const finalized = summarizeStep(fixture, graph, state, { phase: "node-drag-finalizing", positions: movedPositions, draggedNodeId: firstNodeId, preserveSafeIncidentPreviousRoute: true, feedbackEnabled: true }, mode);
  const relationChanged = summarizeStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true }, mode);
  const stableAfterRecovery = summarizeStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true }, mode);
  const stableAfterRecovery2 = summarizeStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true }, mode);
  const stableAfterRecovery3 = summarizeStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true }, mode);
  const manual = summarizeStep(fixture, graph, state, { phase: "idle", positions: movedPositions, manualOffsets: new Map(firstNodeId ? [[firstNodeId, { x: 19, y: -7 }]] : []), feedbackEnabled: true }, mode);
  const reset = summarizeStep(fixture, graph, state, { phase: "idle", resetPrevious: true, feedbackEnabled: true }, mode);
  const steps = { clean, identical, identicalStable, active, move, finalized, relationChanged, stableAfterRecovery, stableAfterRecovery2, stableAfterRecovery3, manual, reset };
  const recoverySequence = [relationChanged.nodeFingerprint, stableAfterRecovery.nodeFingerprint, stableAfterRecovery2.nodeFingerprint, stableAfterRecovery3.nodeFingerprint];
  return {
    fixture: fixture.fixture,
    family: fixture.family,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    steps,
    controls: {
      cleanThenIdenticalStable: clean.nodeFingerprint === identical.nodeFingerprint && identicalStable.nodeFingerprint === identical.nodeFingerprint,
      activeDraggedNodeSuppressed: active.recovery.activeSuppressionCount === 1,
      relationChangeObserved: relationChanged.routeFingerprint !== finalized.routeFingerprint || relationChanged.relationFingerprint !== finalized.relationFingerprint,
      recoveryStableAfterPresentationChange: stableAfterRecovery.nodeFingerprint === stableAfterRecovery2.nodeFingerprint && stableAfterRecovery2.nodeFingerprint === stableAfterRecovery3.nodeFingerprint,
      recoveryOscillationAfterPresentationChange: recoverySequence[0] === recoverySequence[2] && recoverySequence[1] === recoverySequence[3] && recoverySequence[0] !== recoverySequence[1],
      manualOffsetVisibleAndAuthoritative: manual.recovery.manualAuthorityCount > 0,
      resetClearsPreviousInput: reset.previousSnapshotSize === 0,
      candidateCountBounded: [...new Set(Object.values(steps).flatMap((step) => step.recovery.candidateCounts))].every((count) => count === 32),
    },
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function performanceCase(fixture: Fixture, previous: Map<string, LabelRect>, previousRelationLabels: Map<string, LabelRect>, previousRoutes: Map<string, DerivedAutomaticRoute>) {
  const graph = graphFor(fixture);
  const arms = (mode: RecoveryMode) => {
    const samples = [];
    for (let index = 0; index < 6; index += 1) {
      const derived = deriveOnce(fixture, graph, { previous, previousRelationLabels, previousRoutes }, { phase: "idle", feedbackEnabled: true }, mode, false);
      if (index > 0) samples.push({ elapsedMs: derived.elapsedMs, nodeLabelMs: derived.profiler.passes.first.nodeLabelMs + derived.profiler.passes.feedback.nodeLabelMs, candidateEvaluations: derived.profiler.passes.first.nodeLabel.candidateEvaluations + derived.profiler.passes.feedback.nodeLabel.candidateEvaluations, recoveryComparisonMs: derived.profiler.passes.first.nodeLabel.recoveryComparisonMs + derived.profiler.passes.feedback.nodeLabel.recoveryComparisonMs });
    }
    return {
      elapsedMsMedian: median(samples.map(({ elapsedMs }) => elapsedMs)),
      nodeLabelMsMedian: median(samples.map(({ nodeLabelMs }) => nodeLabelMs)),
      candidateEvaluations: samples[0]?.candidateEvaluations ?? 0,
      recoveryComparisonMsMedian: median(samples.map(({ recoveryComparisonMs }) => recoveryComparisonMs)),
    };
  };
  const baseline = arms("baseline");
  const productCandidate = arms("product-candidate");
  return {
    baseline,
    productCandidate,
    candidateEvaluationDelta: productCandidate.candidateEvaluations - baseline.candidateEvaluations,
    nodeLabelMsDelta: productCandidate.nodeLabelMsMedian - baseline.nodeLabelMsMedian,
    recoveryComparisonMs: productCandidate.recoveryComparisonMsMedian,
  };
}

const rows = FIXTURE_IDS.map((fixtureId) => {
  const fixture = sourceArtifact.rows.find((row) => row.fixture === fixtureId)!;
  const candidate = sequenceFor(fixture, "product-candidate");
  const baseline = sequenceFor(fixture, "baseline");
  const graph = graphFor(fixture);
  const initial = deriveOnce(fixture, graph, { previous: new Map(), previousRelationLabels: new Map(), previousRoutes: new Map() }, { phase: "idle", feedbackEnabled: true }, "baseline", false);
  const settledState = {
    previous: new Map(initial.presentation.nodeLabels),
    previousRelationLabels: new Map(initial.presentation.relationLabels),
    previousRoutes: new Map(initial.presentation.routedEdges.map((route) => [route.id, route])),
  };
  return {
    fixture: candidate.fixture,
    family: candidate.family,
    graph: candidate.graph,
    candidate,
    baseline,
    outputDifference: {
      clean: candidate.steps.clean.nodeFingerprint !== baseline.steps.clean.nodeFingerprint,
      identical: candidate.steps.identical.nodeFingerprint !== baseline.steps.identical.nodeFingerprint,
      settled: candidate.steps.stableAfterRecovery3.nodeFingerprint !== baseline.steps.stableAfterRecovery3.nodeFingerprint,
    },
    performance: {
      clean: performanceCase(fixture, new Map(), new Map(), new Map()),
      settled: performanceCase(fixture, settledState.previous, settledState.previousRelationLabels, settledState.previousRoutes),
      stale: performanceCase(fixture, new Map(Object.entries(fixture.productDerivedPrevious)), settledState.previousRelationLabels, settledState.previousRoutes),
    },
  };
});

const primary = rows.find(({ fixture }) => fixture === "horizontal-label-capacity")!;
const artifact = {
  contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-INTEGRATION-FEASIBILITY-v1",
  diagnosticOnly: true,
  defaultEnabled: false,
  integration: {
    mode: "product-candidate",
    activation: "development-only URL switch node-label-recovery=candidate",
    AppPropRequired: false,
    normalCallerUsesPreviousRef: true,
    diagnosticPreviousOverrideUsed: false,
    normalFeedbackPolicy: "App default feedback; no diagnosticFeedbackEnabled override",
  },
  formulation: {
    firstPass: "continuity-only",
    settledPass: "hard-safe recovery or strict fresh non-movement gain",
    activeDrag: "recovery suppressed",
    manualOffset: "manual geometry authoritative",
    movementCoefficient: "distance * 4 unchanged",
  },
  sequenceOrder: ["clean", "identical", "identicalStable", "active", "move", "finalized", "relationChanged", "stableAfterRecovery", "stableAfterRecovery2", "stableAfterRecovery3", "manual", "reset"],
  rows,
  primaryProductDerivedStaleCase: {
    fixture: primary.fixture,
    recoveryTriggered: primary.candidate.steps.relationChanged.recovery.triggeredCount + primary.candidate.steps.finalized.recovery.triggeredCount,
    candidateCounts: primary.candidate.steps.relationChanged.recovery.candidateCounts,
    nextPreviousMatchesRecoveredOutput: primary.candidate.steps.stableAfterRecovery.nodeFingerprint === primary.candidate.steps.stableAfterRecovery2.nodeFingerprint,
    stalePerformance: primary.performance.stale,
  },
  performanceGate: {
    maxCandidateCountPerNode: 32,
    candidateEvaluationDeltaMustBeZero: true,
    repeatedStableDeriveDoesNotIncreaseCandidateCount: true,
    mainThreadMeasurement: "Node process/source profiler only; browser responsiveness is checked separately by Actual Product smoke",
  },
  standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN", adaptiveCascade: "NOT ENTERED" },
};

const target = path.join(process.cwd(), "experimental", "product-node-label-recovery-integration1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  rows: rows.map((row) => ({ fixture: row.fixture, controls: row.candidate.controls, performance: row.performance })),
  primaryProductDerivedStaleCase: artifact.primaryProductDerivedStaleCase,
}, null, 2));
