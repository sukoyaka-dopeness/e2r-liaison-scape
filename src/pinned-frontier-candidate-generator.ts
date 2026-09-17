import { generateFrontierCandidateSet, type FrontierGeneratorConfig } from "./frontier-candidate-generator.ts";
import type { RoutingGraphEdge } from "./graph-presentation.ts";
import type { Point } from "./viewport.ts";

export type PinnedFrontierAnchor = Readonly<{ x: number; y: number; source: "saved" | "staged" }>;
export type PinnedFrontierInput = Readonly<{
  graph: Readonly<{ nodes: readonly { id: string }[]; edges: readonly RoutingGraphEdge[] }>;
  initialPositions: Readonly<Record<string, Point>>;
  fixedAnchors: Readonly<Record<string, PinnedFrontierAnchor>>;
}>;

export type PinnedFrontierCandidate = Readonly<{
  family: "circular-order" | "grid-structural" | "anchor-aware-relaxation" | "pinned-fixed";
  identity: string;
  positions: Record<string, Point>;
  structuralCrossings: number;
  minNodeSeparation: number;
  meanNodeSeparation: number;
  maxEdge: number;
  variant: number;
}>;

export type PinnedFrontierCandidateSet = Readonly<{
  status: "completed" | "failed";
  representatives: readonly PinnedFrontierCandidate[];
  poolCandidates: readonly PinnedFrontierCandidate[];
  summary: Readonly<Record<string, unknown>>;
  failure?: Readonly<{ code: string; message: string }>;
}>;

export type PinnedFrontierGeneratorConfig = FrontierGeneratorConfig & Readonly<{
  relaxationRounds?: number;
  variantCount?: number;
}>;

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clonePositions(positions: Readonly<Record<string, Point>>): Record<string, Point> {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x, y: point.y }]));
}

function finitePoint(point: Point | undefined): boolean {
  return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function positionsFingerprint(positions: Readonly<Record<string, Point>>): string {
  return Object.keys(positions).sort(compareId).map((id) => `${id}:${positions[id]!.x},${positions[id]!.y}`).join("|");
}

function failedCandidateSet(code: string, message: string): PinnedFrontierCandidateSet {
  return { status: "failed", representatives: [], poolCandidates: [], summary: { mode: "pinned-frontier-anchor-aware-v1", failureCode: code }, failure: { code, message } };
}

function validateInput(input: PinnedFrontierInput): { ids: string[]; anchors: Map<string, PinnedFrontierAnchor> } | { failure: { code: string; message: string } } {
  const ids = input.graph.nodes.map(({ id }) => id).sort(compareId);
  if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some((id) => !id)) return { failure: { code: "INVALID_INPUT", message: "Pinned Frontier input requires unique non-empty node IDs" } };
  if (Object.keys(input.initialPositions).length !== ids.length || ids.some((id) => !finitePoint(input.initialPositions[id]))) return { failure: { code: "INVALID_INPUT", message: "Pinned Frontier input requires finite positions for every node" } };
  if (input.graph.edges.some((edge) => !edge.id || !ids.includes(edge.sourceId) || !ids.includes(edge.targetId))) return { failure: { code: "INVALID_INPUT", message: "Pinned Frontier input contains an edge with an unknown endpoint" } };
  const anchors = new Map<string, PinnedFrontierAnchor>();
  for (const [id, anchor] of Object.entries(input.fixedAnchors)) {
    if (!ids.includes(id) || !finitePoint(anchor) || (anchor.source !== "saved" && anchor.source !== "staged")) return { failure: { code: "INVALID_ANCHOR", message: `Invalid fixed anchor for ${id}` } };
    anchors.set(id, { x: anchor.x, y: anchor.y, source: anchor.source });
  }
  return { ids, anchors };
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const rx = b.x - a.x; const ry = b.y - a.y; const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return false;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator; const u = (qpx * ry - qpy * rx) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function structuralMetadata(positions: Readonly<Record<string, Point>>, graph: PinnedFrontierInput["graph"]): Pick<PinnedFrontierCandidate, "structuralCrossings" | "minNodeSeparation" | "meanNodeSeparation" | "maxEdge"> {
  const pairDistances: number[] = [];
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left]!.id]!; const second = positions[graph.nodes[right]!.id]!;
    pairDistances.push(Math.hypot(first.x - second.x, first.y - second.y));
  }
  let crossings = 0;
  for (let left = 0; left < graph.edges.length; left += 1) for (let right = left + 1; right < graph.edges.length; right += 1) {
    const first = graph.edges[left]!; const second = graph.edges[right]!;
    if (first.sourceId === first.targetId || second.sourceId === second.targetId || [first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (segmentIntersection(positions[first.sourceId]!, positions[first.targetId]!, positions[second.sourceId]!, positions[second.targetId]!)) crossings += 1;
  }
  const lengths = graph.edges.filter((edge) => edge.sourceId !== edge.targetId).map((edge) => Math.hypot(positions[edge.sourceId]!.x - positions[edge.targetId]!.x, positions[edge.sourceId]!.y - positions[edge.targetId]!.y));
  return {
    structuralCrossings: crossings,
    minNodeSeparation: pairDistances.length ? Math.min(...pairDistances) : 0,
    meanNodeSeparation: pairDistances.length ? pairDistances.reduce((sum, value) => sum + value, 0) / pairDistances.length : 0,
    maxEdge: lengths.length ? Math.max(...lengths) : 0,
  };
}

function anchorAwareRelaxation(input: PinnedFrontierInput, anchors: Map<string, PinnedFrontierAnchor>, variant: number, rounds: number): Record<string, Point> {
  const ids = input.graph.nodes.map(({ id }) => id).sort(compareId);
  const result = clonePositions(input.initialPositions);
  const movable = ids.filter((id) => !anchors.has(id));
  const targetDistance = 180 + (variant % 3) * 24;
  for (let round = 0; round < rounds; round += 1) {
    const next = clonePositions(result);
    for (const id of movable) {
      const point = result[id]!;
      let dx = Math.cos((variant + 1) * 0.73 + round * 0.11 + id.length) * 0.8;
      let dy = Math.sin((variant + 1) * 0.47 + round * 0.09 + id.length) * 0.8;
      for (const otherId of ids) {
        if (otherId === id) continue;
        const other = result[otherId]!;
        const deltaX = point.x - other.x; const deltaY = point.y - other.y; const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        if (distance < targetDistance) {
          const pressure = (targetDistance - distance) / targetDistance;
          dx += deltaX / distance * pressure * 10;
          dy += deltaY / distance * pressure * 10;
        }
      }
      for (const edge of input.graph.edges) {
        if (edge.sourceId === edge.targetId) continue;
        const otherId = edge.sourceId === id ? edge.targetId : edge.targetId === id ? edge.sourceId : undefined;
        if (!otherId) continue;
        const other = result[otherId]!; const deltaX = other.x - point.x; const deltaY = other.y - point.y; const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        const attraction = Math.max(-6, Math.min(6, (distance - 280) / 120));
        dx += deltaX / distance * attraction;
        dy += deltaY / distance * attraction;
      }
      next[id] = { x: point.x + Math.max(-18, Math.min(18, dx)), y: point.y + Math.max(-18, Math.min(18, dy)) };
    }
    for (const [id, anchor] of anchors) next[id] = { x: anchor.x, y: anchor.y };
    Object.assign(result, next);
  }
  return result;
}

function completeCandidate(candidate: Omit<PinnedFrontierCandidate, "identity"> & { positions: Record<string, Point> }): PinnedFrontierCandidate | null {
  const ids = Object.keys(candidate.positions);
  if (ids.length === 0 || ids.some((id) => !finitePoint(candidate.positions[id]))) return null;
  return { ...candidate, identity: positionsFingerprint(candidate.positions) };
}

/** Fixed-anchor candidate generation extracted from the bounded feasibility evidence. */
export function generatePinnedFrontierCandidateSet(input: PinnedFrontierInput, config: PinnedFrontierGeneratorConfig = {}): PinnedFrontierCandidateSet {
  const validated = validateInput(input);
  if ("failure" in validated) return failedCandidateSet(validated.failure.code, validated.failure.message);
  const { ids, anchors } = validated;
  if (anchors.size === 0) {
    const shared = generateFrontierCandidateSet({ nodes: ids.map((id) => ({ id })), edges: input.graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) }, config);
    if (shared.status !== "completed") return { ...shared, representatives: [], poolCandidates: [] };
    const poolCandidates = shared.poolCandidates.map((candidate, variant) => completeCandidate({
      family: candidate.family,
      positions: clonePositions(candidate.positions),
      ...structuralMetadata(candidate.positions, input.graph),
      variant,
    })).filter((candidate): candidate is PinnedFrontierCandidate => candidate !== null);
    const representatives = shared.representatives.map((candidate, variant) => completeCandidate({
      family: candidate.family,
      positions: clonePositions(candidate.positions),
      ...structuralMetadata(candidate.positions, input.graph),
      variant,
    })).filter((candidate): candidate is PinnedFrontierCandidate => candidate !== null);
    return { status: "completed", representatives, poolCandidates, summary: { mode: "shared-frontier-no-pins", sourceGenerator: "generateFrontierCandidateSet", representativeCount: representatives.length, poolCount: poolCandidates.length } };
  }
  const variantCount = Math.max(1, Math.floor(config.variantCount ?? 6));
  const rounds = Math.max(0, Math.floor(config.relaxationRounds ?? 18));
  const poolCandidates: PinnedFrontierCandidate[] = [];
  for (let variant = 0; variant < variantCount; variant += 1) {
    const positions = anchors.size === ids.length
      ? Object.fromEntries(ids.map((id) => [id, { x: anchors.get(id)!.x, y: anchors.get(id)!.y }])) as Record<string, Point>
      : anchorAwareRelaxation(input, anchors, variant, rounds);
    const candidate = completeCandidate({
      family: anchors.size === ids.length ? "pinned-fixed" : "anchor-aware-relaxation",
      positions,
      ...structuralMetadata(positions, input.graph),
      variant,
    });
    if (candidate) poolCandidates.push(candidate);
  }
  const limit = Math.max(1, Math.floor(config.limit ?? 12));
  return {
    status: poolCandidates.length > 0 ? "completed" : "failed",
    representatives: poolCandidates.slice(0, limit),
    poolCandidates,
    summary: { mode: anchors.size === ids.length ? "all-pinned-fixed" : "anchor-aware-relaxation-v1", fixedAnchorCount: anchors.size, movableNodeCount: ids.length - anchors.size, variantCount, relaxationRounds: rounds, representativeCount: Math.min(limit, poolCandidates.length), anchorSources: Object.fromEntries([...anchors].map(([id, anchor]) => [id, anchor.source])) },
    ...(poolCandidates.length > 0 ? {} : { failure: { code: "INVALID_OUTPUT", message: "Pinned Frontier produced no complete finite candidates" } }),
  };
}

export function exactPinnedAnchors(positions: Readonly<Record<string, Point>>, anchors: Readonly<Record<string, PinnedFrontierAnchor>>): boolean {
  return Object.entries(anchors).every(([id, anchor]) => positions[id]?.x === anchor.x && positions[id]?.y === anchor.y);
}
