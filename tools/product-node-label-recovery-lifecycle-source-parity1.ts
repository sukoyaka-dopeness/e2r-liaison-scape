import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import {
  deriveBoundedAutomaticPresentation,
  type AutomaticNodeLabelRecoveryTrace,
  type BoundedAutomaticPresentation,
  type DerivedAutomaticRoute,
} from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect, type Point } from "../src/viewport.ts";

type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { fixture: string; family: string; dataset: Dataset; positions: Record<string, Point>; productDerivedPrevious: Record<string, LabelRect> };
type LifecycleOptions = {
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

function mapFingerprint(values: ReadonlyMap<string, LabelRect>) {
  return JSON.stringify([...values.entries()]);
}

function routeFingerprint(routes: readonly DerivedAutomaticRoute[]) {
  return JSON.stringify(routes.map(({ id, sourceId, targetId, samples, controlPoint }) => ({ id, sourceId, targetId, samples, controlPoint })));
}

function relationFingerprint(presentation: BoundedAutomaticPresentation) {
  return mapFingerprint(presentation.relationLabels);
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

function deriveStep(
  fixture: Fixture,
  graph: ReturnType<typeof graphFor>,
  state: { previous: Map<string, LabelRect>; previousRelationLabels: Map<string, LabelRect>; previousRoutes: Map<string, DerivedAutomaticRoute>; generation: number },
  options: LifecycleOptions,
) {
  if (options.resetPrevious) {
    state.previous.clear();
    state.previousRelationLabels.clear();
    state.previousRoutes.clear();
  }
  const positions = options.positions ?? fixture.positions;
  const traces: AutomaticNodeLabelRecoveryTrace[] = [];
  const passSnapshots: Array<{ pass: string; routeFingerprint: string; relationFingerprint: string; nodeFingerprint: string }> = [];
  const built = buildEntityGraph(fixture.dataset as never);
  const inputPrevious = new Map(state.previous);
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(built, positions),
    previousNodeLabelPlacements: inputPrevious,
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
    nodeLabelRecoveryMode: "diagnostic-bounded",
    nodeLabelRecoveryTraceSink: (trace) => traces.push(trace),
    presentationPassSink: (snapshot) => passSnapshots.push({
      pass: passSnapshots.length === 0 ? "first" : "feedback",
      routeFingerprint: routeFingerprint(snapshot.route.routes),
      relationFingerprint: mapFingerprint(snapshot.relationLabel.labels),
      nodeFingerprint: mapFingerprint(snapshot.nodeLabel.labels),
    }),
  });
  const nextPrevious = new Map(presentation.nodeLabels);
  state.previous = nextPrevious;
  state.previousRelationLabels = new Map(presentation.relationLabels);
  state.previousRoutes = new Map(presentation.routedEdges.map((route) => [route.id, route]));
  state.generation += 1;
  return {
    generation: state.generation,
    phase: options.phase,
    previousSnapshotSize: inputPrevious.size,
    nextPreviousSnapshotSize: nextPrevious.size,
    previousSnapshotIdentity: mapFingerprint(inputPrevious),
    nextPreviousIdentity: mapFingerprint(nextPrevious),
    recovery: traceSummary(traces),
    traces,
    passSnapshots,
    feedbackApplied: presentation.feedbackApplied,
    routeFingerprint: routeFingerprint(presentation.routedEdges),
    relationFingerprint: relationFingerprint(presentation),
    nodeFingerprint: mapFingerprint(presentation.nodeLabels),
    presentation,
  };
}

function sequenceFor(fixture: Fixture) {
  const graph = graphFor(fixture);
  const firstNodeId = graph.nodes[0]?.id;
  const movedPositions = { ...fixture.positions, ...(firstNodeId ? { [firstNodeId]: { x: fixture.positions[firstNodeId]!.x + 70, y: fixture.positions[firstNodeId]!.y + 26 } } : {}) };
  const state = { previous: new Map<string, LabelRect>(), previousRelationLabels: new Map<string, LabelRect>(), previousRoutes: new Map<string, DerivedAutomaticRoute>(), generation: 0 };
  const clean = deriveStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true });
  const identical = deriveStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true });
  const identicalStable = deriveStep(fixture, graph, state, { phase: "idle", feedbackEnabled: true });
  const active = deriveStep(fixture, graph, state, { phase: "node-drag-active", positions: movedPositions, activeDraggedNodeId: firstNodeId, draggedNodeId: firstNodeId, feedbackEnabled: false });
  const move = deriveStep(fixture, graph, state, { phase: "node-drag-active", positions: { ...movedPositions, ...(firstNodeId ? { [firstNodeId]: { x: movedPositions[firstNodeId]!.x + 28, y: movedPositions[firstNodeId]!.y + 18 } } : {}) }, activeDraggedNodeId: firstNodeId, draggedNodeId: firstNodeId, feedbackEnabled: false });
  const finalized = deriveStep(fixture, graph, state, { phase: "node-drag-finalizing", positions: movedPositions, draggedNodeId: firstNodeId, preserveSafeIncidentPreviousRoute: true, feedbackEnabled: true });
  const relationChanged = deriveStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true });
  const stableAfterRecovery = deriveStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true });
  const stableAfterRecovery2 = deriveStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true });
  const stableAfterRecovery3 = deriveStep(fixture, graph, state, { phase: "idle", positions: movedPositions, relationLabelNormalOffsets: [-12, 0, 12], feedbackEnabled: true });
  const manual = deriveStep(fixture, graph, state, { phase: "idle", positions: movedPositions, manualOffsets: new Map(firstNodeId ? [[firstNodeId, { x: 19, y: -7 }]] : []), feedbackEnabled: true });
  const reset = deriveStep(fixture, graph, state, { phase: "idle", resetPrevious: true, feedbackEnabled: true });
  const steps = { clean, identical, identicalStable, active, move, finalized, relationChanged, stableAfterRecovery, stableAfterRecovery2, stableAfterRecovery3, manual, reset };
  const stable = identicalStable.nodeFingerprint === identical.nodeFingerprint
    && stableAfterRecovery.nodeFingerprint === stableAfterRecovery2.nodeFingerprint
    && stableAfterRecovery2.nodeFingerprint === stableAfterRecovery3.nodeFingerprint;
  const recoverySequence = [relationChanged.nodeFingerprint, stableAfterRecovery.nodeFingerprint, stableAfterRecovery2.nodeFingerprint, stableAfterRecovery3.nodeFingerprint];
  const oscillates = recoverySequence[0] === recoverySequence[2] && recoverySequence[1] === recoverySequence[3] && recoverySequence[0] !== recoverySequence[1];
  const routeChanged = relationChanged.routeFingerprint !== finalized.routeFingerprint;
  const relationChangedGeometry = relationChanged.relationFingerprint !== finalized.relationFingerprint;
  return {
    fixture: fixture.fixture,
    family: fixture.family,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    steps: Object.fromEntries(Object.entries(steps).map(([id, step]) => [id, {
      generation: step.generation,
      phase: step.phase,
      previousSnapshotSize: step.previousSnapshotSize,
      nextPreviousSnapshotSize: step.nextPreviousSnapshotSize,
      recovery: step.recovery,
      passSnapshots: step.passSnapshots,
      feedbackApplied: step.feedbackApplied,
      routeFingerprint: step.routeFingerprint,
      relationFingerprint: step.relationFingerprint,
      nodeFingerprint: step.nodeFingerprint,
      previousSnapshotIdentity: step.previousSnapshotIdentity,
      nextPreviousIdentity: step.nextPreviousIdentity,
    }])),
    controls: {
      cleanThenIdenticalStable: clean.nodeFingerprint === identical.nodeFingerprint && identicalStable.nodeFingerprint === identical.nodeFingerprint && identical.recovery.triggeredCount === 0,
      activeDraggedNodeSuppressed: active.recovery.activeSuppressionCount === 1,
      relationChangeObserved: routeChanged || relationChangedGeometry,
      recoveryStableAfterPresentationChange: stable,
      recoveryOscillationAfterPresentationChange: oscillates,
      manualOffsetVisibleAndAuthoritative: manual.recovery.manualAuthorityCount > 0,
      resetClearsPreviousInput: reset.previousSnapshotSize === 0,
      repeatedGenerationCount: state.generation,
    },
    traces: Object.fromEntries(Object.entries(steps).map(([id, step]) => [id, step.traces])),
  };
}

const rows = FIXTURE_IDS.map((fixtureId) => {
  const fixture = sourceArtifact.rows.find((row) => row.fixture === fixtureId)!;
  return sequenceFor(fixture);
});

const primaryFixture = sourceArtifact.rows.find(({ fixture }) => fixture === "horizontal-label-capacity")!;
const primaryGraph = graphFor(primaryFixture);
const primaryState = { previous: new Map(Object.entries(primaryFixture.productDerivedPrevious)), previousRelationLabels: new Map<string, LabelRect>(), previousRoutes: new Map<string, DerivedAutomaticRoute>(), generation: 0 } as { previous: Map<string, LabelRect>; previousRelationLabels: Map<string, LabelRect>; previousRoutes: Map<string, DerivedAutomaticRoute>; generation: number };
const primaryStale = deriveStep(primaryFixture, primaryGraph, primaryState, { phase: "idle", feedbackEnabled: true });
const primaryRecoveryArtifact = JSON.parse(fs.readFileSync(path.join(process.cwd(), "experimental", "product-node-label-hysteresis-recovery-attribution1", "result-summary.json"), "utf8"));
const primaryExpected = primaryRecoveryArtifact.rows.find((row: any) => row.fixture === "horizontal-label-capacity").arms["bounded-recovery"].labels;
const primaryExpectedFingerprint = JSON.stringify(Object.entries(primaryExpected));

const artifact = {
  contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-LIFECYCLE-SOURCE-PARITY-v1",
  diagnosticOnly: true,
  candidateIdentity: "product-node-label-recovery-lifecycle-source-parity1",
  sourceParity: {
    normalPresentationFunction: "deriveBoundedAutomaticPresentation",
    normalNodeLabelOrchestration: "deriveAutomaticNodeLabels -> stepAutomaticNodeLabelPlacement",
    previousSnapshotUpdate: "App presentation effect commits the displayed nodeLabels map after derivation; this harness applies the same commit boundary between derives",
    recoveryIntegration: "development-only nodeLabelRecoveryMode; omitted by normal Product callers",
  },
  sequenceOrder: ["clean", "identical", "identicalStable", "active", "move", "finalized", "relationChanged", "stableAfterRecovery", "stableAfterRecovery2", "stableAfterRecovery3", "manual", "reset"],
  rows,
  primaryProductDerivedStaleCase: {
    fixture: "horizontal-label-capacity",
    previousSource: "previous checkpoint Product current-previous output",
    recoveryTriggered: primaryStale.recovery.triggeredCount,
    candidateCounts: primaryStale.recovery.candidateCounts,
    matchesPriorBoundedRecoveryOutput: primaryStale.nodeFingerprint === primaryExpectedFingerprint,
    recoveryReasons: primaryStale.recovery.reasonCounts,
    nextPreviousMatchesRecoveredOutput: primaryStale.nextPreviousIdentity === primaryStale.nodeFingerprint,
  },
  standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN", adaptiveCascade: "NOT ENTERED" },
};

const target = path.join(process.cwd(), "experimental", "product-node-label-recovery-lifecycle-source-parity1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  rows: rows.map((row) => ({ fixture: row.fixture, controls: row.controls })),
  primaryProductDerivedStaleCase: artifact.primaryProductDerivedStaleCase,
}, null, 2));
