import { deriveAutomaticLayoutQualityMetrics, type AutomaticLayoutQualityMetrics } from "./automatic-layout-quality.ts";
import { compareAutomaticLayoutProposals, isAutomaticLayoutPresentationEligible } from "./automatic-layout-selection.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute, type RoutingGraphEdge, type SelfLoopOverride } from "./graph-presentation.ts";
import { generateFrontierCandidateSet, type FrontierCandidate, type FrontierCandidateSet, type FrontierGeneratorConfig } from "./frontier-candidate-generator.ts";
import { exactPinnedAnchors, generatePinnedFrontierCandidateSet, type PinnedFrontierCandidateSet } from "./pinned-frontier-candidate-generator.ts";
import { dependencyFingerprint } from "./presentation-dependency.ts";
import { placeNodeLabel, type LabelRect, type NodeLabelAngularEscapeInput, type Point, type RelationLabelWrapPolicy } from "./viewport.ts";
import type { ManualNodeLabelOffset, ManualRelationLabelAnchor } from "./relation-label-presentation.ts";
import type { Dataset, GraphNode } from "./dataset.ts";
import { resolveExplicitAutoLayoutPins, type ExplicitAutoLayoutPinDiagnostic, type ExplicitAutoLayoutStagedPin } from "./explicit-auto-layout-pin.ts";

export type ExplicitAutoLayoutCoordinateOwnership = "stored" | "derived" | "adopted";
export type ExplicitAutoLayoutPin = Readonly<{ x: number; y: number; source: "saved" | "staged" }>;

export type ExplicitAutoLayoutProductSnapshot = Readonly<{
  edgeCurveOffsets: Readonly<Record<string, number>>;
  selfLoopOverrides: Readonly<Record<string, SelfLoopOverride>>;
  provisionalNodeLabels: readonly LabelRect[];
  previousNodeLabelPlacements: Readonly<Record<string, LabelRect>>;
  previousRelationLabelPlacements: Readonly<Record<string, LabelRect>>;
  manualNodeLabelOffsets: Readonly<Record<string, ManualNodeLabelOffset>>;
  manualRelationLabelAnchors: Readonly<Record<string, ManualRelationLabelAnchor>>;
  previousAutomaticRoutes: Readonly<Record<string, DerivedAutomaticRoute>>;
  continuityNodeLabels?: readonly LabelRect[];
  previousContinuityNodeLabels?: Readonly<Record<string, LabelRect>>;
  draggedNodeId?: string;
  activeDraggedNodeId?: string;
  activelyDraggedNodeId?: string;
  preserveSafeIncidentPreviousRoute?: boolean;
  feedbackEnabled?: boolean;
  parallelBundleSpacing?: number;
  parallelBundleSpacingByKey?: Readonly<Record<string, number>>;
  relationLabelStaggerById?: Readonly<Record<string, number>>;
  relationLabelNormalOffsets?: readonly number[];
  relationLabelWrapPolicy?: RelationLabelWrapPolicy;
  nodeLabelAngularEscapeById?: Readonly<Record<string, NodeLabelAngularEscapeInput>>;
  parallelBundleMode?: "pair" | "bundle" | "corridor";
}>;

export type ExplicitAutoLayoutSnapshotInput = Readonly<{
  operationId: string;
  generation: number;
  datasetIdentity: string;
  datasetRevision: number;
  graphFingerprint: string;
  graph: Readonly<{ nodes: readonly GraphNode[]; edges: readonly RoutingGraphEdge[] }>;
  positions: Readonly<Record<string, Point>>;
  storedCoordinateFingerprint: string | null;
  adoptedCoordinateFingerprint: string | null;
  coordinatesDirty: boolean;
  coordinateOwnership: Readonly<Record<string, ExplicitAutoLayoutCoordinateOwnership>>;
  activePins: Readonly<Record<string, ExplicitAutoLayoutPin>>;
  product: ExplicitAutoLayoutProductSnapshot;
  locale: string;
  algorithmVersion: string;
  budgetPolicy: Readonly<Record<string, unknown>>;
}>;

export type ExplicitAutoLayoutSnapshot = Readonly<ExplicitAutoLayoutSnapshotInput & {
  snapshotIdentity: string;
}>;

export type ExplicitAutoLayoutConfig = Readonly<{
  frontier: FrontierGeneratorConfig;
  globalSpacingScale: number;
  globalSpacingY: number;
  finalCanonicalization: "round-once" | "none";
  pinnedRelaxationRounds?: number;
  pinnedVariantCount?: number;
}>;

export const DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG: ExplicitAutoLayoutConfig = Object.freeze({
  frontier: Object.freeze({ limit: 12, featureMode: "global" }),
  globalSpacingScale: 0.88,
  globalSpacingY: 1.12,
  finalCanonicalization: "round-once",
  pinnedRelaxationRounds: 18,
  pinnedVariantCount: 6,
});

export type ExplicitAutoLayoutFailure = Readonly<{
  code:
    | "INVALID_SNAPSHOT"
    | "PIN_RESOLUTION_FAILED"
    | "GENERATOR_FAILURE"
    | "INCOMPLETE_RESULT"
    | "NON_FINITE_RESULT"
    | "PIN_VIOLATION"
    | "EXECUTION_ERROR";
  message: string;
}>;

export type ExplicitAutoLayoutStructuralValidation = Readonly<{
  complete: boolean;
  finite: boolean;
  pinsPreserved: boolean;
  productEvaluationComplete: boolean;
}>;

export type ExplicitAutoLayoutProposal = Readonly<{
  candidateIndex: number;
  family: string;
  sourceIdentity: string;
  positions: Record<string, Point>;
  metrics: AutomaticLayoutQualityMetrics;
  eligible: boolean;
  presentationSignature: string;
}>;

export type ExplicitAutoLayoutPreviewProposal = Readonly<{
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  candidateFingerprint: string;
  selectedFamily: string;
  positions: Record<string, Point>;
  selectedCandidateProvenance: Readonly<{ sourceIdentity: string; candidateIndex: number }>;
  presentationEvidence: Readonly<{
    metrics: AutomaticLayoutQualityMetrics;
    eligible: boolean;
    presentationSignature: string;
  }>;
  structuralValidation: ExplicitAutoLayoutStructuralValidation;
  catastrophicPolicy: "structurally-valid-preview-admissible";
  warnings: readonly string[];
}>;

export type ExplicitAutoLayoutCalculationResult =
  | Readonly<{ status: "completed"; preview: ExplicitAutoLayoutPreviewProposal; candidateSet: FrontierCandidateSet | PinnedFrontierCandidateSet; proposals: readonly ExplicitAutoLayoutProposal[] }>
  | Readonly<{ status: "failed"; failure: ExplicitAutoLayoutFailure }>;

export type ExplicitAutoLayoutOutcome =
  | Readonly<{ status: "completed"; operationId: string; generation: number; snapshotIdentity: string; preview: ExplicitAutoLayoutPreviewProposal }>
  | Readonly<{ status: "cancelled" | "stale" | "failed"; operationId: string; generation: number; snapshotIdentity: string; reason: string; failure?: ExplicitAutoLayoutFailure }>;

export type ExplicitAutoLayoutProvenance = Readonly<{
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  datasetIdentity: string;
  datasetRevision: number;
  graphFingerprint: string;
  algorithmVersion: string;
  locale: string;
  inputFingerprint: string;
  candidateFingerprint: string;
  selectedFamily: string;
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stablePositions(positions: Readonly<Record<string, Point>>): string {
  return Object.keys(positions).sort(compareId).map((id) => `${id}:${positions[id]!.x},${positions[id]!.y}`).join("|");
}

function finitePoint(value: Point | undefined): boolean {
  return value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function completePositions(positions: Readonly<Record<string, Point>>, ids: readonly string[]): boolean {
  const keys = Object.keys(positions).sort(compareId);
  const expected = [...ids].sort(compareId);
  return keys.length === expected.length && keys.every((id, index) => id === expected[index] && finitePoint(positions[id]));
}

function cloneMapRecord<T>(record: Readonly<Record<string, T>> | undefined): Map<string, T> {
  return new Map(Object.entries(record ?? {}).map(([id, value]) => [id, clone(value)]));
}

function validateSnapshotInput(input: ExplicitAutoLayoutSnapshotInput): string | null {
  if (!input || !input.operationId || !Number.isInteger(input.generation) || input.generation < 0) return "Operation identity is invalid";
  if (!input.datasetIdentity || !Number.isInteger(input.datasetRevision) || !input.graphFingerprint) return "Dataset identity is incomplete";
  if (!input.graph || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) return "Graph snapshot is invalid";
  const nodeIds = input.graph.nodes.map((node) => node.id);
  if (nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length || nodeIds.some((id) => !id)) return "Graph nodes are invalid";
  if (input.graph.edges.some((edge) => !edge.id || !nodeIds.includes(edge.sourceId) || !nodeIds.includes(edge.targetId))) return "Graph edges are invalid";
  if (!completePositions(input.positions, nodeIds)) return "Working positions are incomplete or non-finite";
  if (Object.keys(input.coordinateOwnership).some((id) => !nodeIds.includes(id))) return "Coordinate ownership contains an unknown Entity";
  for (const [id, pin] of Object.entries(input.activePins)) {
    if (!nodeIds.includes(id) || !finitePoint(pin) || (pin.source !== "saved" && pin.source !== "staged")) return "Pin anchors are invalid";
  }
  if (!input.product || !Array.isArray(input.product.provisionalNodeLabels)) return "Product snapshot is incomplete";
  return null;
}

function snapshotSemanticInput(input: ExplicitAutoLayoutSnapshotInput): ExplicitAutoLayoutSnapshotInput {
  return clone(input);
}

/** Captures a serializable, immutable Explicit Auto Layout operation snapshot. */
export function captureExplicitAutoLayoutSnapshot(input: ExplicitAutoLayoutSnapshotInput): { snapshot: ExplicitAutoLayoutSnapshot } | { snapshot: null; failure: ExplicitAutoLayoutFailure } {
  const validation = validateSnapshotInput(input);
  if (validation) return { snapshot: null, failure: { code: "INVALID_SNAPSHOT", message: validation } };
  const semantic = snapshotSemanticInput(input);
  const snapshotIdentity = dependencyFingerprint(semantic).digest;
  return { snapshot: deepFreeze({ ...semantic, snapshotIdentity }) };
}

export type ExplicitAutoLayoutDatasetSnapshotInput = Omit<ExplicitAutoLayoutSnapshotInput, "activePins"> & Readonly<{
  dataset: Dataset;
  currentPositions: Readonly<Record<string, Point>>;
  stagedPins?: Readonly<Record<string, ExplicitAutoLayoutStagedPin | null>>;
  manuallyMovedEntityIds?: readonly string[];
}>;

export type ExplicitAutoLayoutDatasetSnapshotCapture =
  | Readonly<{ snapshot: ExplicitAutoLayoutSnapshot; pinDiagnostics: readonly ExplicitAutoLayoutPinDiagnostic[] }>
  | Readonly<{ snapshot: null; failure: ExplicitAutoLayoutFailure; pinDiagnostics: readonly ExplicitAutoLayoutPinDiagnostic[] }>;

/** Resolves current Dataset/working Pin state and then captures the operation snapshot. */
export function captureExplicitAutoLayoutSnapshotFromDataset(input: ExplicitAutoLayoutDatasetSnapshotInput): ExplicitAutoLayoutDatasetSnapshotCapture {
  const pins = resolveExplicitAutoLayoutPins({
    dataset: input.dataset,
    currentPositions: input.currentPositions,
    stagedPins: input.stagedPins,
    manuallyMovedEntityIds: input.manuallyMovedEntityIds,
  });
  if (pins.status !== "completed") return {
    snapshot: null,
    failure: { code: "PIN_RESOLUTION_FAILED", message: pins.failure?.message ?? "Active Pin resolution failed" },
    pinDiagnostics: pins.diagnostics,
  };
  const captured = captureExplicitAutoLayoutSnapshot({ ...input, activePins: pins.anchors });
  return "snapshot" in captured && captured.snapshot
    ? { snapshot: captured.snapshot, pinDiagnostics: pins.diagnostics }
    : { snapshot: null, failure: captured.failure, pinDiagnostics: pins.diagnostics };
}

function globallySpacePositions(positions: Readonly<Record<string, Point>>, scale: number, yScale: number): Record<string, Point> {
  const points = Object.values(positions);
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  };
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * yScale,
  }]));
}

function candidateFamily(index: number, candidate: { family: string }): string {
  return `structural-frontier-${index + 1}-${candidate.family}`;
}

function canonicalize(
  positions: Readonly<Record<string, Point>>,
  mode: ExplicitAutoLayoutConfig["finalCanonicalization"],
  fixedAnchors: Readonly<Record<string, ExplicitAutoLayoutPin>>,
): Record<string, Point> {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => {
    const anchor = fixedAnchors[id];
    if (anchor) return [id, { x: anchor.x, y: anchor.y }];
    return [id, mode === "none" ? { ...point } : { x: Math.round(point.x), y: Math.round(point.y) }];
  }));
}

function provisionalNodeLabels(snapshot: ExplicitAutoLayoutSnapshot, positions: Readonly<Record<string, Point>>): LabelRect[] {
  return snapshot.graph.nodes.map((node) => {
    const point = positions[node.id]!;
    const label = placeNodeLabel(
      point,
      node.label,
      node.description,
      [],
      snapshot.graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]!),
      [],
    );
    const offset = snapshot.product.manualNodeLabelOffsets[node.id];
    return offset ? { ...label, x: point.x + offset.x, y: point.y + offset.y } : label;
  });
}

function evaluateProductPresentation(snapshot: ExplicitAutoLayoutSnapshot, positions: Readonly<Record<string, Point>>): { presentation: BoundedAutomaticPresentation; metrics: AutomaticLayoutQualityMetrics; presentationSignature: string } {
  const presentation = deriveBoundedAutomaticPresentation({
    graph: snapshot.graph,
    positions,
    edgeCurveOffsets: snapshot.product.edgeCurveOffsets,
    selfLoopOverrides: snapshot.product.selfLoopOverrides,
    provisionalNodeLabels: provisionalNodeLabels(snapshot, positions),
    previousNodeLabelPlacements: cloneMapRecord(snapshot.product.previousNodeLabelPlacements),
    previousRelationLabelPlacements: cloneMapRecord(snapshot.product.previousRelationLabelPlacements),
    manualNodeLabelOffsets: cloneMapRecord(snapshot.product.manualNodeLabelOffsets),
    manualRelationLabelAnchors: cloneMapRecord(snapshot.product.manualRelationLabelAnchors),
    previousAutomaticRoutes: cloneMapRecord(snapshot.product.previousAutomaticRoutes),
    continuityNodeLabels: snapshot.product.continuityNodeLabels ? clone(snapshot.product.continuityNodeLabels) : undefined,
    previousContinuityNodeLabels: cloneMapRecord(snapshot.product.previousContinuityNodeLabels),
    draggedNodeId: snapshot.product.draggedNodeId,
    activeDraggedNodeId: snapshot.product.activeDraggedNodeId,
    activelyDraggedNodeId: snapshot.product.activelyDraggedNodeId,
    preserveSafeIncidentPreviousRoute: snapshot.product.preserveSafeIncidentPreviousRoute,
    feedbackEnabled: snapshot.product.feedbackEnabled ?? true,
    parallelBundleSpacing: snapshot.product.parallelBundleSpacing,
    parallelBundleSpacingByKey: snapshot.product.parallelBundleSpacingByKey,
    relationLabelStaggerById: snapshot.product.relationLabelStaggerById,
    relationLabelNormalOffsets: snapshot.product.relationLabelNormalOffsets,
    relationLabelWrapPolicy: snapshot.product.relationLabelWrapPolicy,
    nodeLabelAngularEscapeById: snapshot.product.nodeLabelAngularEscapeById,
    parallelBundleMode: snapshot.product.parallelBundleMode,
  });
  const metrics = deriveAutomaticLayoutQualityMetrics({ nodes: snapshot.graph.nodes, edges: snapshot.graph.edges, positions, presentation });
  const presentationSignature = JSON.stringify({
    routes: presentation.routedEdges.map((edge) => ({ id: edge.id, path: edge.path, samples: edge.samples, labelPoint: edge.labelPoint, controlPoint: edge.controlPoint })),
    relationLabels: [...presentation.relationLabels],
    nodeLabels: [...presentation.nodeLabels],
    feedbackApplied: presentation.feedbackApplied,
  });
  return { presentation, metrics, presentationSignature };
}

function structuralValidation(snapshot: ExplicitAutoLayoutSnapshot, positions: Readonly<Record<string, Point>>, productEvaluationComplete: boolean): ExplicitAutoLayoutStructuralValidation {
  const ids = snapshot.graph.nodes.map((node) => node.id);
  const complete = completePositions(positions, ids);
  const finite = Object.values(positions).every((point) => finitePoint(point));
  const pinsPreserved = Object.entries(snapshot.activePins).every(([id, pin]) => positions[id]?.x === pin.x && positions[id]?.y === pin.y);
  return { complete, finite, pinsPreserved, productEvaluationComplete };
}

function failureResult(code: ExplicitAutoLayoutFailure["code"], message: string): ExplicitAutoLayoutCalculationResult {
  return { status: "failed", failure: { code, message } };
}

/**
 * Calculates an Explicit Auto Layout proposal from the immutable snapshot.
 * This is a synchronous pure core; an adapter or Worker owns transport and
 * lifecycle. Product routing, labels, and Self-loop state stay downstream.
 */
export function runExplicitAutoLayoutOperation(snapshot: ExplicitAutoLayoutSnapshot, config: ExplicitAutoLayoutConfig = DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG): ExplicitAutoLayoutCalculationResult {
  const hasPins = Object.keys(snapshot.activePins).length > 0;
  const candidateSet = hasPins
    ? generatePinnedFrontierCandidateSet({
      graph: snapshot.graph,
      initialPositions: snapshot.positions,
      fixedAnchors: snapshot.activePins,
    }, { ...config.frontier, relaxationRounds: config.pinnedRelaxationRounds, variantCount: config.pinnedVariantCount })
    : generateFrontierCandidateSet({
      nodes: snapshot.graph.nodes.map(({ id }) => ({ id })),
      edges: snapshot.graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
    }, config.frontier);
  if (candidateSet.status !== "completed") return failureResult("GENERATOR_FAILURE", candidateSet.failure?.message ?? "Frontier candidate generation failed");
  const candidates = candidateSet.representatives.map((candidate, index) => ({
    family: hasPins ? `${candidate.family}-${index + 1}` : candidateFamily(index, candidate),
    sourceIdentity: candidate.identity,
    positions: hasPins ? clone(candidate.positions) : globallySpacePositions(candidate.positions, config.globalSpacingScale, config.globalSpacingY),
    structuralMetadata: {
      structuralCrossings: candidate.structuralCrossings,
      cheapScore: "cheapScore" in candidate ? candidate.cheapScore : 0,
      minNodeSeparation: candidate.minNodeSeparation,
      meanNodeSeparation: candidate.meanNodeSeparation,
      maxEdge: candidate.maxEdge,
      aspect: "aspect" in candidate ? candidate.aspect : 0,
    },
  }));
  const proposals: ExplicitAutoLayoutProposal[] = candidates.map((candidate, candidateIndex) => {
    const evaluated = evaluateProductPresentation(snapshot, candidate.positions);
    return { candidateIndex, family: candidate.family, sourceIdentity: candidate.sourceIdentity, positions: candidate.positions, metrics: evaluated.metrics, eligible: isAutomaticLayoutPresentationEligible(evaluated.metrics), presentationSignature: evaluated.presentationSignature };
  });
  proposals.sort(compareAutomaticLayoutProposals);
  const selectedFloat = proposals[0];
  if (!selectedFloat) return failureResult("INCOMPLETE_RESULT", "Frontier/Product evaluation produced no candidate");
  const selectedPositions = canonicalize(selectedFloat.positions, config.finalCanonicalization, snapshot.activePins);
  const selectedEvaluation = evaluateProductPresentation(snapshot, selectedPositions);
  const validation = structuralValidation(snapshot, selectedPositions, true);
  if (!validation.complete || !validation.finite) return failureResult("NON_FINITE_RESULT", "Selected Explicit Auto Layout positions are incomplete or non-finite");
  if (!validation.pinsPreserved || (hasPins && !exactPinnedAnchors(selectedPositions, snapshot.activePins))) return failureResult("PIN_VIOLATION", "Selected Explicit Auto Layout positions violate a fixed Pin anchor");
  const selected = {
    ...selectedFloat,
    positions: selectedPositions,
    metrics: selectedEvaluation.metrics,
    eligible: isAutomaticLayoutPresentationEligible(selectedEvaluation.metrics),
    presentationSignature: selectedEvaluation.presentationSignature,
  };
  const warnings = selected.eligible ? [] : ["strict-product-eligibility-false; structural-preview-policy-required"];
  return {
    status: "completed",
    candidateSet,
    proposals,
    preview: {
      operationId: snapshot.operationId,
      generation: snapshot.generation,
      snapshotIdentity: snapshot.snapshotIdentity,
      candidateFingerprint: stablePositions(selected.positions),
      selectedFamily: selected.family,
      positions: clone(selected.positions),
      selectedCandidateProvenance: { sourceIdentity: selected.sourceIdentity, candidateIndex: selected.candidateIndex },
      presentationEvidence: { metrics: selected.metrics, eligible: selected.eligible, presentationSignature: selected.presentationSignature },
      structuralValidation: validation,
      catastrophicPolicy: "structurally-valid-preview-admissible",
      warnings,
    },
  };
}

export function explicitAutoLayoutProvenance(snapshot: ExplicitAutoLayoutSnapshot, result: Extract<ExplicitAutoLayoutCalculationResult, { status: "completed" }>): ExplicitAutoLayoutProvenance {
  return {
    operationId: snapshot.operationId,
    generation: snapshot.generation,
    snapshotIdentity: snapshot.snapshotIdentity,
    datasetIdentity: snapshot.datasetIdentity,
    datasetRevision: snapshot.datasetRevision,
    graphFingerprint: snapshot.graphFingerprint,
    algorithmVersion: snapshot.algorithmVersion,
    locale: snapshot.locale,
    inputFingerprint: snapshot.snapshotIdentity,
    candidateFingerprint: result.preview.candidateFingerprint,
    selectedFamily: result.preview.selectedFamily,
  };
}

export type ExplicitAutoLayoutOperationExecutor = (snapshot: ExplicitAutoLayoutSnapshot) => ExplicitAutoLayoutCalculationResult | Promise<ExplicitAutoLayoutCalculationResult>;
export type ExplicitAutoLayoutOperationAdapterOptions = Readonly<{ execute: ExplicitAutoLayoutOperationExecutor; onState?: (state: "started" | "completed" | "cancelled" | "stale" | "failed") => void }>;

/** Transport-neutral lifecycle adapter. It never adopts positions or writes a Dataset. */
export class ExplicitAutoLayoutOperationAdapter {
  private readonly options: ExplicitAutoLayoutOperationAdapterOptions;
  private active: { snapshot: ExplicitAutoLayoutSnapshot; settle: (outcome: ExplicitAutoLayoutOutcome) => void } | null = null;
  private disposed = false;

  constructor(options: ExplicitAutoLayoutOperationAdapterOptions) {
    this.options = options;
  }

  start(snapshot: ExplicitAutoLayoutSnapshot): Promise<ExplicitAutoLayoutOutcome> {
    this.invalidate("replaced-by-new-operation");
    if (this.disposed) return Promise.resolve({ status: "cancelled", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: "adapter-disposed" });
    return new Promise((resolve) => {
      this.active = { snapshot, settle: resolve };
      this.options.onState?.("started");
      Promise.resolve().then(() => this.options.execute(snapshot)).then((result) => {
        if (!this.active || this.active.snapshot !== snapshot) return;
        if (result.status === "failed") {
          this.finish(snapshot, { status: "failed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: result.failure.code, failure: result.failure });
          return;
        }
        this.finish(snapshot, { status: "completed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, preview: result.preview });
      }).catch((error: unknown) => {
        if (!this.active || this.active.snapshot !== snapshot) return;
        const failure: ExplicitAutoLayoutFailure = { code: "EXECUTION_ERROR", message: error instanceof Error ? error.message : "Explicit Auto Layout execution failed" };
        this.finish(snapshot, { status: "failed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: failure.code, failure });
      });
    });
  }

  cancel(reason = "user-cancelled"): void {
    const active = this.active;
    if (!active) return;
    this.finish(active.snapshot, { status: "cancelled", operationId: active.snapshot.operationId, generation: active.snapshot.generation, snapshotIdentity: active.snapshot.snapshotIdentity, reason });
  }

  invalidate(reason = "input-changed"): void {
    const active = this.active;
    if (!active) return;
    this.finish(active.snapshot, { status: "stale", operationId: active.snapshot.operationId, generation: active.snapshot.generation, snapshotIdentity: active.snapshot.snapshotIdentity, reason });
  }

  dispose(): void {
    this.disposed = true;
    this.cancel("adapter-disposed");
  }

  private finish(snapshot: ExplicitAutoLayoutSnapshot, outcome: ExplicitAutoLayoutOutcome): void {
    if (!this.active || this.active.snapshot !== snapshot) return;
    const settle = this.active.settle;
    this.active = null;
    this.options.onState?.(outcome.status);
    settle(outcome);
  }
}
