import { deriveAutomaticLayoutQualityMetrics, type AutomaticLayoutQualityMetrics } from "../../src/automatic-layout-quality.ts";
import { compareAutomaticLayoutProposals, isAutomaticLayoutPresentationEligible } from "../../src/automatic-layout-selection.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute, type RoutingGraphEdge, type SelfLoopOverride } from "../../src/graph-presentation.ts";
import { deriveManualRelationLabelAnchor, type ManualNodeLabelOffset, type ManualRelationLabelAnchor } from "../../src/relation-label-presentation.ts";
import { exactPinnedAnchors, generatePinnedFrontierCandidateSet as generateSharedPinnedFrontierCandidateSet, type PinnedFrontierAnchor, type PinnedFrontierCandidate, type PinnedFrontierCandidateSet, type PinnedFrontierGeneratorConfig } from "../../src/pinned-frontier-candidate-generator.ts";
import { placeNodeLabel, type LabelRect } from "../../src/viewport.ts";

export type Point = { x: number; y: number };
export type PinnedSource = PinnedFrontierAnchor["source"];
export type FixedAnchor = PinnedFrontierAnchor;
export type PinnedFrontierGraph = {
  nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>;
  edges: Array<RoutingGraphEdge>;
};

/** Plain-data snapshot of the Product presentation state supplied to the experiment. */
export type SerializablePresentationSnapshot = {
  edgeCurveOffsets: Record<string, number>;
  selfLoopOverrides: Record<string, SelfLoopOverride>;
  previousNodeLabelPlacements: Record<string, LabelRect>;
  previousRelationLabelPlacements: Record<string, LabelRect>;
  manualNodeLabelOffsets: Record<string, ManualNodeLabelOffset>;
  manualRelationLabelAnchors: Record<string, ManualRelationLabelAnchor>;
  previousAutomaticRoutes: Record<string, DerivedAutomaticRoute>;
};

export type PinnedFrontierConfig = PinnedFrontierGeneratorConfig & {
  globalSpacingScale?: number;
  globalSpacingY?: number;
  relaxationRounds?: number;
  variantCount?: number;
  finalCanonicalization?: "round-once" | "none";
};

export type PinnedFrontierInput = {
  graph: PinnedFrontierGraph;
  initialPositions: Record<string, Point>;
  fixedAnchors: Record<string, FixedAnchor>;
  presentationSnapshot: SerializablePresentationSnapshot;
};

export type PinnedCandidate = PinnedFrontierCandidate;
export type PinnedCandidateSet = PinnedFrontierCandidateSet;

export type PinnedProductProposal = {
  candidateIndex: number;
  family: string;
  sourceIdentity: string;
  positions: Record<string, Point>;
  metrics: AutomaticLayoutQualityMetrics;
  eligible: boolean;
  presentationSignature: string;
};

export type PinnedFrontierResult = {
  candidateSet: PinnedCandidateSet;
  candidates: Array<{ family: string; sourceIdentity: string; positions: Record<string, Point>; structuralMetadata: Omit<PinnedCandidate, "positions" | "identity" | "family" | "variant"> & { variant: number } }>;
  proposals: PinnedProductProposal[];
  selected: PinnedProductProposal | null;
  selectedPositionFingerprint: string | null;
  snapshotFingerprint: string;
};

const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const clonePositions = (positions: Record<string, Point>): Record<string, Point> => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x, y: point.y }])) as Record<string, Point>;

function emptyPresentationSnapshot(): SerializablePresentationSnapshot {
  return {
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    previousNodeLabelPlacements: {},
    previousRelationLabelPlacements: {},
    manualNodeLabelOffsets: {},
    manualRelationLabelAnchors: {},
    previousAutomaticRoutes: {},
  };
}

function mapValues<T>(values: Readonly<Record<string, T>>): Map<string, T> {
  return new Map(Object.entries(values));
}

function presentationSignature(presentation: BoundedAutomaticPresentation): string {
  return JSON.stringify({
    routes: presentation.routedEdges.map((edge) => ({ id: edge.id, path: edge.path, samples: edge.samples, labelPoint: edge.labelPoint, controlPoint: edge.controlPoint })),
    relationLabels: [...presentation.relationLabels],
    nodeLabels: [...presentation.nodeLabels],
    feedbackApplied: presentation.feedbackApplied,
  });
}

export function positionsFingerprint(positions: Record<string, Point>): string {
  return Object.entries(positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x},${point.y}`).join("|");
}

export function snapshotFingerprint(snapshot: SerializablePresentationSnapshot): string {
  return JSON.stringify(snapshot);
}

function provisionalNodeLabels(graph: PinnedFrontierGraph, positions: Record<string, Point>): LabelRect[] {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!,
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]!),
    [],
  ));
}

export function evaluateProductPresentation(
  graph: PinnedFrontierGraph,
  positions: Record<string, Point>,
  snapshot: SerializablePresentationSnapshot = emptyPresentationSnapshot(),
) {
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges: graph.edges },
    positions,
    edgeCurveOffsets: snapshot.edgeCurveOffsets,
    selfLoopOverrides: snapshot.selfLoopOverrides,
    provisionalNodeLabels: provisionalNodeLabels(graph, positions),
    previousNodeLabelPlacements: mapValues(snapshot.previousNodeLabelPlacements),
    previousRelationLabelPlacements: mapValues(snapshot.previousRelationLabelPlacements),
    manualNodeLabelOffsets: mapValues(snapshot.manualNodeLabelOffsets),
    manualRelationLabelAnchors: mapValues(snapshot.manualRelationLabelAnchors),
    previousAutomaticRoutes: mapValues(snapshot.previousAutomaticRoutes),
    feedbackEnabled: true,
  });
  return {
    presentation,
    metrics: deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions, presentation }),
    presentationSignature: presentationSignature(presentation),
  };
}

/** Builds a non-empty snapshot from an actual Product-derived presentation. */
export function buildPresentationSnapshot(graph: PinnedFrontierGraph, positions: Record<string, Point>): SerializablePresentationSnapshot {
  const baseline = evaluateProductPresentation(graph, positions, emptyPresentationSnapshot()).presentation;
  const ordinary = graph.edges.find((edge) => edge.sourceId !== edge.targetId);
  const selfLoop = graph.edges.find((edge) => edge.sourceId === edge.targetId);
  const firstNode = graph.nodes[0];
  const firstRoute = baseline.routedEdges[0];
  const firstLabel = firstRoute ? baseline.relationLabels.get(firstRoute.id) : undefined;
  return {
    edgeCurveOffsets: ordinary ? { [ordinary.id]: 24 } : {},
    selfLoopOverrides: selfLoop ? { [selfLoop.id]: { orientation: -Math.PI / 2, radius: 72 } } : {},
    previousNodeLabelPlacements: Object.fromEntries(baseline.nodeLabels),
    previousRelationLabelPlacements: Object.fromEntries(baseline.relationLabels),
    manualNodeLabelOffsets: firstNode ? { [firstNode.id]: { x: 12, y: -16 } } : {},
    manualRelationLabelAnchors: firstRoute && firstLabel ? { [firstRoute.id]: deriveManualRelationLabelAnchor(firstRoute.samples, firstLabel) } : {},
    previousAutomaticRoutes: Object.fromEntries(baseline.routedEdges.map((route) => [route.id, route])),
  };
}

function finitePoint(point: Point | undefined): boolean {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function globallySpacePositions(positions: Record<string, Point>, scale: number, yScale: number): Record<string, Point> {
  const points = Object.values(positions); const center = { x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length), y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length) };
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * yScale }])) as Record<string, Point>;
}

/** Compatibility export: the experiment now consumes the shared source generator. */
export function generatePinnedFrontierCandidateSet(input: PinnedFrontierInput, config: PinnedFrontierConfig = {}): PinnedCandidateSet {
  return generateSharedPinnedFrontierCandidateSet(input, config);
}

export function computePinnedFrontierProductProposals(input: PinnedFrontierInput, config: PinnedFrontierConfig = {}): PinnedFrontierResult {
  const snapshotId = snapshotFingerprint(input.presentationSnapshot);
  const candidateSet = generateSharedPinnedFrontierCandidateSet(input, config);
  if (candidateSet.status !== "completed") return { candidateSet, candidates: [], proposals: [], selected: null, selectedPositionFingerprint: null, snapshotFingerprint: snapshotId };
  const hasPins = Object.keys(input.fixedAnchors).length > 0;
  const candidates = candidateSet.representatives.map((candidate, index) => {
    const positions = hasPins ? candidate.positions : globallySpacePositions(candidate.positions, config.globalSpacingScale ?? 0.88, config.globalSpacingY ?? 1.12);
    const family = hasPins ? `${candidate.family}-${index + 1}` : `structural-frontier-${index + 1}-${candidate.family}`;
    return { family, sourceIdentity: candidate.identity, positions, structuralMetadata: { structuralCrossings: candidate.structuralCrossings, minNodeSeparation: candidate.minNodeSeparation, meanNodeSeparation: candidate.meanNodeSeparation, maxEdge: candidate.maxEdge, variant: candidate.variant } };
  });
  const proposals = candidates.map((candidate, candidateIndex) => {
    const evaluated = evaluateProductPresentation(input.graph, candidate.positions, input.presentationSnapshot);
    return { candidateIndex, family: candidate.family, sourceIdentity: candidate.sourceIdentity, positions: candidate.positions, metrics: evaluated.metrics, eligible: isAutomaticLayoutPresentationEligible(evaluated.metrics), presentationSignature: evaluated.presentationSignature };
  }).sort(compareAutomaticLayoutProposals);
  const selectedFloat = proposals[0] ?? null;
  if (!selectedFloat) return { candidateSet, candidates, proposals, selected: null, selectedPositionFingerprint: null, snapshotFingerprint: snapshotId };
  const canonicalPositions = hasPins
    ? Object.fromEntries(Object.entries(selectedFloat.positions).map(([id, point]) => [id, input.fixedAnchors[id] ? { ...point } : config.finalCanonicalization === "round-once" ? { x: Math.round(point.x), y: Math.round(point.y) } : { ...point }])) as Record<string, Point>
    : config.finalCanonicalization === "round-once" ? Object.fromEntries(Object.entries(selectedFloat.positions).map(([id, point]) => [id, { x: Math.round(point.x), y: Math.round(point.y) }])) as Record<string, Point> : clonePositions(selectedFloat.positions);
  if (!exactPinnedAnchors(canonicalPositions, input.fixedAnchors) || Object.keys(canonicalPositions).length !== input.graph.nodes.length || Object.values(canonicalPositions).some((point) => !finitePoint(point))) return { candidateSet: { status: "failed", representatives: [], poolCandidates: [], summary: { mode: "pinned-frontier-anchor-aware-v1", failureCode: "INVALID_OUTPUT" }, failure: { code: "INVALID_OUTPUT", message: "Pinned Frontier produced an incomplete or non-finite position map" } }, candidates, proposals, selected: null, selectedPositionFingerprint: null, snapshotFingerprint: snapshotId };
  const canonical = evaluateProductPresentation(input.graph, canonicalPositions, input.presentationSnapshot);
  const selected = { ...selectedFloat, positions: canonicalPositions, metrics: canonical.metrics, eligible: isAutomaticLayoutPresentationEligible(canonical.metrics), presentationSignature: canonical.presentationSignature };
  return { candidateSet, candidates, proposals, selected, selectedPositionFingerprint: positionsFingerprint(canonicalPositions), snapshotFingerprint: snapshotId };
}

export function validatePinnedFrontierResult(result: PinnedFrontierResult, input: PinnedFrontierInput): { ok: true } | { ok: false; code: string; message: string } {
  if (result.candidateSet.status !== "completed") return { ok: false, code: "GENERATOR_FAILURE", message: result.candidateSet.failure?.message ?? "Pinned Frontier generation failed" };
  if (!result.selected) return { ok: false, code: "INCOMPLETE_RESULT", message: "Pinned Frontier/Product selection returned no selected result" };
  const selected = result.selected.positions;
  if (Object.keys(selected).length !== input.graph.nodes.length || Object.values(selected).some((point) => !finitePoint(point))) return { ok: false, code: "NON_FINITE_RESULT", message: "Pinned Frontier selected positions are not complete and finite" };
  for (const [id, anchor] of Object.entries(input.fixedAnchors)) if (selected[id]?.x !== anchor.x || selected[id]?.y !== anchor.y) return { ok: false, code: "PIN_MOVED", message: `Pinned coordinate changed for ${id}` };
  return { ok: true };
}
