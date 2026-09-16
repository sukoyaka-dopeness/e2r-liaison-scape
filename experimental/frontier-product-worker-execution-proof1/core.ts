import { deriveAutomaticLayoutQualityMetrics, type AutomaticLayoutQualityMetrics } from "../../src/automatic-layout-quality.ts";
import { compareAutomaticLayoutProposals, isAutomaticLayoutPresentationEligible } from "../../src/automatic-layout-selection.ts";
import { generateFrontierCandidateSet, type FrontierCandidate, type FrontierCandidateSet } from "../../src/frontier-candidate-generator.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type RoutingGraphEdge } from "../../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect } from "../../src/viewport.ts";

export type Point = { x: number; y: number };
export type WorkerGraph = {
  nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>;
  edges: Array<RoutingGraphEdge>;
};
export type FrontierWorkerConfig = {
  limit: number;
  featureMode: "global" | "topology-aware" | "adaptive-frontier";
  globalSpacingScale: number;
  globalSpacingY: number;
  finalCanonicalization: "round-once";
};
export type ProductProposal = {
  candidateIndex: number;
  family: string;
  sourceIdentity: string;
  positions: Record<string, Point>;
  metrics: AutomaticLayoutQualityMetrics;
  eligible: boolean;
  presentationSignature: string;
};
export type FrontierProductResult = {
  candidateSet: FrontierCandidateSet;
  candidates: Array<{
    family: string;
    sourceIdentity: string;
    positions: Record<string, Point>;
    structuralMetadata: Pick<FrontierCandidate, "structuralCrossings" | "cheapScore" | "minNodeSeparation" | "meanNodeSeparation" | "maxEdge" | "aspect">;
  }>;
  proposals: ProductProposal[];
  selected: ProductProposal | null;
  selectedPositionFingerprint: string | null;
};
export type FrontierProductTimingHooks = {
  onCandidateGeneration?: (elapsedMs: number) => void;
  onProductEvaluation?: (elapsedMs: number) => void;
};

export const DEFAULT_FRONTIER_WORKER_CONFIG: FrontierWorkerConfig = {
  limit: 12,
  featureMode: "global",
  globalSpacingScale: 0.88,
  globalSpacingY: 1.12,
  finalCanonicalization: "round-once",
};

function clonePositions(positions: Record<string, Point>): Record<string, Point> {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x, y: point.y }]));
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function globallySpacePositions(positions: Record<string, Point>, scale: number, yScale: number): Record<string, Point> {
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

function emptyPresentationState() {
  return {
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    previousNodeLabelPlacements: new Map<string, LabelRect>(),
    previousRelationLabelPlacements: new Map<string, LabelRect>(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  };
}

export function presentationSignature(presentation: BoundedAutomaticPresentation): string {
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

function provisionalNodeLabels(graph: WorkerGraph, positions: Record<string, Point>): LabelRect[] {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!,
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]!),
    [],
  ));
}

export function evaluateProductPresentation(graph: WorkerGraph, positions: Record<string, Point>) {
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges: graph.edges },
    positions,
    ...emptyPresentationState(),
    provisionalNodeLabels: provisionalNodeLabels(graph, positions),
    feedbackEnabled: true,
  });
  return {
    presentation,
    metrics: deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions, presentation }),
    presentationSignature: presentationSignature(presentation),
  };
}

function candidateFamily(index: number, candidate: FrontierCandidate): string {
  return `structural-frontier-${index + 1}-${candidate.family}`;
}

function canonicalize(positions: Record<string, Point>): Record<string, Point> {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: Math.round(point.x), y: Math.round(point.y) }]));
}

function candidateSetFor(graph: WorkerGraph, config: FrontierWorkerConfig): FrontierCandidateSet {
  return generateFrontierCandidateSet({
    nodes: graph.nodes.map(({ id }) => ({ id })),
    edges: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
  }, { limit: config.limit, featureMode: config.featureMode });
}

export function computeFrontierProductProposals(graph: WorkerGraph, config: FrontierWorkerConfig = DEFAULT_FRONTIER_WORKER_CONFIG, hooks: FrontierProductTimingHooks = {}): FrontierProductResult {
  const candidateStartedAt = performance.now();
  const candidateSet = candidateSetFor(graph, config);
  hooks.onCandidateGeneration?.(performance.now() - candidateStartedAt);
  if (candidateSet.status !== "completed") return { candidateSet, candidates: [], proposals: [], selected: null, selectedPositionFingerprint: null };
  const candidates = candidateSet.representatives.map((candidate, index) => ({
    family: candidateFamily(index, candidate),
    sourceIdentity: candidate.identity,
    positions: globallySpacePositions(candidate.positions, config.globalSpacingScale, config.globalSpacingY),
    structuralMetadata: {
      structuralCrossings: candidate.structuralCrossings,
      cheapScore: candidate.cheapScore,
      minNodeSeparation: candidate.minNodeSeparation,
      meanNodeSeparation: candidate.meanNodeSeparation,
      maxEdge: candidate.maxEdge,
      aspect: candidate.aspect,
    },
  }));
  const productStartedAt = performance.now();
  const proposals = candidates.map((candidate, candidateIndex) => {
    const evaluated = evaluateProductPresentation(graph, candidate.positions);
    return { candidateIndex, family: candidate.family, sourceIdentity: candidate.sourceIdentity, positions: candidate.positions, metrics: evaluated.metrics, eligible: isAutomaticLayoutPresentationEligible(evaluated.metrics), presentationSignature: evaluated.presentationSignature };
  });
  hooks.onProductEvaluation?.(performance.now() - productStartedAt);
  proposals.sort(compareAutomaticLayoutProposals);
  const selectedFloat = proposals[0] ?? null;
  if (!selectedFloat) return { candidateSet, candidates, proposals, selected: null, selectedPositionFingerprint: null };
  const canonicalPositions = config.finalCanonicalization === "round-once" ? canonicalize(selectedFloat.positions) : clonePositions(selectedFloat.positions);
  const canonical = evaluateProductPresentation(graph, canonicalPositions);
  const selected: ProductProposal = { ...selectedFloat, positions: canonicalPositions, metrics: canonical.metrics, eligible: isAutomaticLayoutPresentationEligible(canonical.metrics), presentationSignature: canonical.presentationSignature };
  return { candidateSet, candidates, proposals, selected, selectedPositionFingerprint: positionsFingerprint(canonicalPositions) };
}

export function serializeCandidateSet(result: FrontierProductResult): string {
  return JSON.stringify({
    representatives: result.candidateSet.representatives.map((candidate) => ({
      family: candidate.family,
      identity: candidate.identity,
      positions: candidate.positions,
      structuralCrossings: candidate.structuralCrossings,
      cheapScore: candidate.cheapScore,
      minNodeSeparation: candidate.minNodeSeparation,
      meanNodeSeparation: candidate.meanNodeSeparation,
      maxEdge: candidate.maxEdge,
      aspect: candidate.aspect,
    })),
    candidates: result.candidates,
  });
}

export function validateFrontierProductResult(result: FrontierProductResult): { ok: true } | { ok: false; code: string; message: string } {
  if (result.candidateSet.status !== "completed") return { ok: false, code: "GENERATOR_FAILURE", message: result.candidateSet.failure?.message ?? "Frontier candidate generation failed" };
  if (!result.selected || result.candidates.length === 0 || result.proposals.length !== result.candidates.length) return { ok: false, code: "INCOMPLETE_RESULT", message: "Frontier/Product result is incomplete" };
  const finite = result.selected.positions && Object.values(result.selected.positions).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!finite) return { ok: false, code: "NON_FINITE_RESULT", message: "Selected Frontier/Product positions are non-finite" };
  return { ok: true };
}
