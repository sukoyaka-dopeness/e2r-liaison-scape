import { compareAutomaticLayoutProposals, isAutomaticLayoutPresentationEligible } from "../../src/automatic-layout-selection.ts";
import { generateFrontierCandidateSet, type FrontierCandidateSet } from "../../src/frontier-candidate-generator.ts";
import { deriveTopologyAwareFreeFormCandidates, type FreeFormCandidate } from "../../src/topology-aware-free-form-placement.ts";
import { buildPresentationSnapshot, computePinnedFrontierProductProposals, evaluateProductPresentation, positionsFingerprint, type FixedAnchor, type PinnedFrontierGraph, type SerializablePresentationSnapshot } from "../pinned-frontier-feasibility1/core.ts";
import { generateSeparatedPositions } from "../density-adaptive-node-separation-experiment1/core.ts";

export type Point = { x: number; y: number };
export type PortfolioFamily = "pinned-frontier" | "density-adaptive" | "topology-aware-free-form";
export type PortfolioGraph = PinnedFrontierGraph;
export type PortfolioConfig = {
  frontierLimit?: number;
  freeFormLimit?: number;
  adaptiveRounds?: number;
  finalCanonicalization?: "round-once" | "none";
};
export type PortfolioCandidate = {
  family: PortfolioFamily;
  identity: string;
  positions: Record<string, Point>;
  sourceLineage: string;
  structuralMetadata: Record<string, unknown>;
  anchorsPreserved: boolean;
};
export type PortfolioProposal = PortfolioCandidate & {
  metrics: ReturnType<typeof evaluateProductPresentation>["metrics"];
  eligible: boolean;
  presentationSignature: string;
};

const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const clonePositions = (positions: Record<string, Point>) => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x, y: point.y }])) as Record<string, Point>;
const finitePoint = (point: Point | undefined) => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

function structuralMetadata(graph: PortfolioGraph, positions: Record<string, Point>) {
  const ids = graph.nodes.map(({ id }) => id).sort(compareId);
  const distances: number[] = [];
  for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) {
    const first = positions[ids[left]!]!; const second = positions[ids[right]!]!;
    distances.push(Math.hypot(first.x - second.x, first.y - second.y));
  }
  const edgeLengths = graph.edges.filter((edge) => edge.sourceId !== edge.targetId).map((edge) => Math.hypot(positions[edge.sourceId]!.x - positions[edge.targetId]!.x, positions[edge.sourceId]!.y - positions[edge.targetId]!.y));
  return { minNodeSeparation: distances.length ? Math.min(...distances) : 0, meanNodeSeparation: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : 0, maxEdge: edgeLengths.length ? Math.max(...edgeLengths) : 0 };
}

function anchorsPreserved(positions: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>) {
  return Object.entries(anchors).every(([id, anchor]) => positions[id]?.x === anchor.x && positions[id]?.y === anchor.y);
}

function lockAnchors(positions: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>) {
  for (const [id, anchor] of Object.entries(anchors)) positions[id] = { x: anchor.x, y: anchor.y };
}

function anchorAwareFreeForm(graph: PortfolioGraph, candidate: FreeFormCandidate, anchors: Readonly<Record<string, FixedAnchor>>, variant: number, rounds: number) {
  const ids = graph.nodes.map(({ id }) => id).sort(compareId);
  const positions = clonePositions(candidate.positions);
  lockAnchors(positions, anchors);
  const movable = ids.filter((id) => !anchors[id]);
  for (let round = 0; round < rounds; round += 1) {
    const next = clonePositions(positions);
    for (const id of movable) {
      const point = positions[id]!;
      let dx = Math.cos((variant + 1) * 0.71 + round * 0.13 + id.length) * 0.6;
      let dy = Math.sin((variant + 1) * 0.43 + round * 0.11 + id.length) * 0.6;
      for (const otherId of ids) {
        if (otherId === id) continue;
        const other = positions[otherId]!; const deltaX = point.x - other.x; const deltaY = point.y - other.y; const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        if (distance < 150) {
          const pressure = (150 - distance) / 150;
          dx += deltaX / distance * pressure * 9;
          dy += deltaY / distance * pressure * 9;
        }
      }
      next[id] = { x: point.x + Math.max(-16, Math.min(16, dx)), y: point.y + Math.max(-16, Math.min(16, dy)) };
    }
    lockAnchors(next, anchors);
    Object.assign(positions, next);
  }
  return positions;
}

function canonicalize(positions: Record<string, Point>, anchors: Readonly<Record<string, FixedAnchor>>, mode: PortfolioConfig["finalCanonicalization"]) {
  if (mode === "none") return clonePositions(positions);
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, anchors[id] ? { ...point } : { x: Math.round(point.x), y: Math.round(point.y) }])) as Record<string, Point>;
}

function frontierCandidates(graph: PortfolioGraph, anchors: Readonly<Record<string, FixedAnchor>>, config: PortfolioConfig) {
  const initialPositions = Object.fromEntries(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }])) as Record<string, Point>;
  const result = computePinnedFrontierProductProposals({ graph, initialPositions, fixedAnchors: anchors, presentationSnapshot: emptySnapshot() }, { limit: config.frontierLimit ?? 4, variantCount: config.frontierLimit ?? 4, relaxationRounds: config.adaptiveRounds ?? 12, globalSpacingScale: 0.88, globalSpacingY: 1.12, finalCanonicalization: "none" });
  return result.candidates.map((candidate) => ({ family: "pinned-frontier" as const, identity: `pinned-frontier:${candidate.sourceIdentity}`, positions: clonePositions(candidate.positions), sourceLineage: anchors && Object.keys(anchors).length > 0 ? "pinned-frontier-feasibility1 anchor-aware Frontier diagnostic" : "generateFrontierCandidateSet via pinned-frontier-feasibility1", structuralMetadata: candidate.structuralMetadata, anchorsPreserved: anchorsPreserved(candidate.positions, anchors) }));
}

function densityCandidates(graph: PortfolioGraph, anchors: Readonly<Record<string, FixedAnchor>>, base: FrontierCandidateSet, config: PortfolioConfig) {
  const selected = base.representatives.slice(0, config.frontierLimit ?? 4);
  return selected.map((candidate, index) => {
    const generated = generateSeparatedPositions(graph, candidate.positions, anchors, "density-adaptive", { adaptiveRounds: config.adaptiveRounds ?? 10 });
    return { family: "density-adaptive" as const, identity: `density-adaptive:${index + 1}:${positionsFingerprint(generated.positions)}`, positions: generated.positions, sourceLineage: "density-adaptive-node-separation-experiment1 current diagnostic policy; anchors locked during construction", structuralMetadata: { density: generated.density, baseIdentity: candidate.identity }, anchorsPreserved: generated.fixedAnchorsPreserved };
  });
}

function freeFormCandidates(graph: PortfolioGraph, anchors: Readonly<Record<string, FixedAnchor>>, config: PortfolioConfig) {
  const freeForm = deriveTopologyAwareFreeFormCandidates(graph.nodes.map(({ id }) => ({ id })), graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })), config.freeFormLimit ?? 4);
  return freeForm.map((candidate, index) => {
    const positions = Object.keys(anchors).length > 0 ? anchorAwareFreeForm(graph, candidate, anchors, index, config.adaptiveRounds ?? 10) : clonePositions(candidate.positions);
    return { family: "topology-aware-free-form" as const, identity: `topology-aware-free-form:${candidate.family}:${positionsFingerprint(positions)}`, positions, sourceLineage: Object.keys(anchors).length > 0 ? "topology-aware-free-form current source seed + bounded anchor-aware adapter; diagnostic only" : "deriveTopologyAwareFreeFormCandidates current source", structuralMetadata: { seed: candidate.seed, iterations: candidate.iterations, topology: candidate.topology, cheapMetrics: candidate.cheapMetrics }, anchorsPreserved: anchorsPreserved(positions, anchors) };
  });
}

function emptySnapshot(): SerializablePresentationSnapshot {
  return { edgeCurveOffsets: {}, selfLoopOverrides: {}, previousNodeLabelPlacements: {}, previousRelationLabelPlacements: {}, manualNodeLabelOffsets: {}, manualRelationLabelAnchors: {}, previousAutomaticRoutes: {} };
}

export function buildPortfolioCandidates(graph: PortfolioGraph, anchors: Readonly<Record<string, FixedAnchor>>, config: PortfolioConfig = {}) {
  const base = generateFrontierCandidateSet({ nodes: graph.nodes.map(({ id }) => ({ id })), edges: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) }, { limit: config.frontierLimit ?? 4 });
  if (base.status !== "completed") return { status: "failed" as const, candidates: [], failure: base.failure ?? { code: "GENERATOR_FAILURE", message: "Frontier baseline generation failed" } };
  const candidates = [...frontierCandidates(graph, anchors, config), ...densityCandidates(graph, anchors, base, config), ...freeFormCandidates(graph, anchors, config)];
  const ids = graph.nodes.map(({ id }) => id).sort(compareId);
  const valid = candidates.length > 0 && candidates.every((candidate) => Object.keys(candidate.positions).length === ids.length && ids.every((id) => finitePoint(candidate.positions[id])) && candidate.anchorsPreserved);
  return valid ? { status: "completed" as const, candidates, base } : { status: "failed" as const, candidates: [], failure: { code: "INVALID_OUTPUT", message: "Pinned cross-family generation produced an incomplete, non-finite, or moved-anchor candidate" }, base };
}

export function evaluatePortfolioWithAnchors(graph: PortfolioGraph, candidates: PortfolioCandidate[], anchors: Readonly<Record<string, FixedAnchor>>, snapshot: SerializablePresentationSnapshot, config: PortfolioConfig = {}) {
  const proposals = candidates.map((candidate) => {
    const evaluated = evaluateProductPresentation(graph, candidate.positions, snapshot);
    return { ...candidate, metrics: evaluated.metrics, eligible: isAutomaticLayoutPresentationEligible(evaluated.metrics), presentationSignature: evaluated.presentationSignature };
  }).sort(compareAutomaticLayoutProposals);
  const selected = proposals[0] ? { ...proposals[0], positions: canonicalize(proposals[0].positions, anchors, config.finalCanonicalization ?? "round-once") } : null;
  return { proposals, selected };
}

export function createNonEmptySnapshot(graph: PortfolioGraph, positions: Record<string, Point>) { return buildPresentationSnapshot(graph, positions); }
export { emptySnapshot, structuralMetadata, positionsFingerprint };
