import { INITIAL_ENTITY_CLEARANCE } from "./initial-entity-placement.ts";

export type FrontierPlacementInput = {
  nodes: readonly { id: string }[];
  edges: readonly { id: string; sourceId: string; targetId: string }[];
};

export type FrontierCandidate = {
  family: "circular-order" | "grid-structural";
  positions: Record<string, { x: number; y: number }>;
  identity: string;
  structuralCrossings: number;
  cheapScore: number;
  minNodeSeparation: number;
  meanNodeSeparation: number;
  medianEdge: number;
  maxEdge: number;
  width: number;
  height: number;
  aspect: number;
  featureVector: number[];
  topologyFeatureVector: number[];
};

export type FrontierCandidateSet = {
  status: "completed" | "failed";
  representatives: FrontierCandidate[];
  poolCandidates: FrontierCandidate[];
  frontierCandidates: FrontierCandidate[];
  summary: Record<string, unknown>;
  failure?: { code: string; message: string };
};

export type FrontierGeneratorConfig = {
  limit?: number;
  featureMode?: "global" | "topology-aware" | "adaptive-frontier";
  circularMaximum?: number;
  circularSeeds?: number;
  circularRounds?: number;
  gridSeeds?: number;
  gridRounds?: number;
};

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clonePositions = (positions: Record<string, { x: number; y: number }>) => Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }])) as Record<string, { x: number; y: number }>;
const positionsKey = (positions: Record<string, { x: number; y: number }>) => Object.entries(positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x},${point.y}`).join("|");

function segmentIntersection(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const rx = b.x - a.x; const ry = b.y - a.y; const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return false;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator; const u = (qpx * ry - qpy * rx) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

export function seededFrontierRandom(seed: number) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; }; }
export function chordCrossings(order: string[], edges: readonly FrontierPlacementInput["edges"][number][]) {
  const index = new Map(order.map((id, position) => [id, position])); let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]!; const second = edges[right]!;
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    const [a, b] = [index.get(first.sourceId)!, index.get(first.targetId)!].sort((x, y) => x - y);
    const [c, d] = [index.get(second.sourceId)!, index.get(second.targetId)!].sort((x, y) => x - y);
    if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) crossings += 1;
  }
  return crossings;
}
function permutations(items: string[], visitor: (items: string[]) => void) {
  const working = items.slice(); let count = 0;
  function visit(index: number) { if (index === working.length) { count += 1; visitor(working.slice()); return; } for (let next = index; next < working.length; next += 1) { [working[index], working[next]] = [working[next]!, working[index]!]; visit(index + 1); [working[index], working[next]] = [working[next]!, working[index]!]; } }
  visit(0); return count;
}
export function exactCircularOrders(ids: string[], edges: readonly FrontierPlacementInput["edges"][number][], maximum = 12) {
  const anchor = ids[0]; const rest = ids.slice(1); const orders: { order: string[]; chordCrossings: number }[] = []; let best = Infinity;
  const evaluated = permutations(rest, (permutation) => { if (compareId(permutation[0]!, permutation.at(-1)!) > 0) return; const order = [anchor!, ...permutation]; const crossings = chordCrossings(order, edges); if (crossings < best) { best = crossings; orders.length = 0; } if (crossings === best && orders.length < maximum) orders.push({ order, chordCrossings: crossings }); });
  return { mode: "EXACT_CIRCULAR_ORDER", evaluated, bestChordCrossings: best, orders };
}
export function heuristicCircularOrders(ids: string[], edges: readonly FrontierPlacementInput["edges"][number][], seeds = 8, rounds = 80) {
  const results: { order: string[]; chordCrossings: number }[] = []; let evaluated = 0;
  for (let seed = 0; seed < seeds; seed += 1) { const random = seededFrontierRandom(9001 + seed); const order = ids.slice(); for (let index = order.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [order[index], order[swap]] = [order[swap]!, order[index]!]; } let current = chordCrossings(order, edges); evaluated += 1; for (let round = 0; round < rounds; round += 1) { const left = Math.floor(random() * order.length); const right = Math.floor(random() * order.length); if (left === right) continue; [order[left], order[right]] = [order[right]!, order[left]!]; const candidate = chordCrossings(order, edges); evaluated += 1; if (candidate <= current || random() < 0.025) current = candidate; else [order[left], order[right]] = [order[right]!, order[left]!]; } results.push({ order: order.slice(), chordCrossings: current }); }
  results.sort((left, right) => left.chordCrossings - right.chordCrossings || left.order.join("\0").localeCompare(right.order.join("\0")));
  return { mode: "HEURISTIC_CIRCULAR_ORDER", evaluated, bestChordCrossings: results[0]?.chordCrossings ?? Infinity, orders: results.slice(0, 12) };
}
export function ellipsePositions(order: string[], variant: { aspect: number; scale: number; phase: number }) { const minimumNeighborGap = INITIAL_ENTITY_CLEARANCE * 1.8; const radiusY = Math.max(160, minimumNeighborGap / (2 * Math.sin(Math.PI / Math.max(3, order.length))) * variant.scale); const radiusX = radiusY * variant.aspect; return Object.fromEntries(order.map((id, index) => { const angle = variant.phase + 2 * Math.PI * index / order.length; return [id, { x: radiusX + radiusX * Math.cos(angle), y: radiusY + radiusY * Math.sin(angle) }]; })); }
export function straightCrossings(positions: Record<string, { x: number; y: number }>, edges: readonly FrontierPlacementInput["edges"][number][]) { let crossings = 0; for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) { const first = edges[left]!; const second = edges[right]!; if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue; if (segmentIntersection(positions[first.sourceId]!, positions[first.targetId]!, positions[second.sourceId]!, positions[second.targetId]!)) crossings += 1; } return crossings; }
function gridSlots(nodeCount: number) { const columns = Math.max(3, Math.ceil(Math.sqrt(nodeCount * 1.35))); const rows = Math.max(2, Math.ceil(nodeCount / columns)); const horizontalGap = Math.max(196, INITIAL_ENTITY_CLEARANCE * 2.55); const verticalGap = Math.max(164, INITIAL_ENTITY_CLEARANCE * 2.15); return Array.from({ length: columns * rows }, (_, index) => ({ x: (index % columns) * horizontalGap, y: Math.floor(index / columns) * verticalGap })); }
function makeGridState(ids: string[], random: () => number) { const slots = gridSlots(ids.length); const assignment = [...ids]; for (let index = assignment.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [assignment[index], assignment[swap]] = [assignment[swap]!, assignment[index]!]; } return { slots, occupied: assignment.map((id, index) => ({ id, slot: index })) }; }
function positionsFromGridState(state: ReturnType<typeof makeGridState>) { return Object.fromEntries(state.occupied.map(({ id, slot }) => [id, state.slots[slot]!])) as Record<string, { x: number; y: number }>; }
function mutateGridState(state: ReturnType<typeof makeGridState>, random: () => number) { const next = { slots: state.slots, occupied: state.occupied.map((entry) => ({ ...entry })) }; const used = new Set(next.occupied.map((entry) => entry.slot)); const left = Math.floor(random() * next.occupied.length); const available = next.slots.map((_, slot) => slot).filter((slot) => !used.has(slot)); if (available.length > 0 && random() < 0.42) next.occupied[left]!.slot = available[Math.floor(random() * available.length)]!; else { const right = Math.floor(random() * next.occupied.length); [next.occupied[left]!.slot, next.occupied[right]!.slot] = [next.occupied[right]!.slot, next.occupied[left]!.slot]; } return next; }
function cheapGridObjective(positions: Record<string, { x: number; y: number }>, edges: readonly FrontierPlacementInput["edges"][number][]) { const crossings = straightCrossings(positions, edges); const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId]!.x - positions[edge.targetId]!.x, positions[edge.sourceId]!.y - positions[edge.targetId]!.y)); const shortEdges = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.65).length; const longEdgePenalty = hopLengths.reduce((sum, length) => sum + Math.max(0, length - 480) ** 2, 0); return crossings * 1000000 + shortEdges * 20000 + longEdgePenalty; }
export function genericGridSearch(ids: string[], edges: readonly FrontierPlacementInput["edges"][number][], seeds = 16, rounds = 1200) { const finalists: { positions: Record<string, { x: number; y: number }>; cheapScore: number; straightCrossings: number }[] = []; let evaluated = 0; for (let seed = 0; seed < seeds; seed += 1) { const random = seededFrontierRandom(17041 + seed); let current = makeGridState(ids, random); let currentScore = cheapGridObjective(positionsFromGridState(current), edges); evaluated += 1; let best = current; let bestScore = currentScore; for (let round = 0; round < rounds; round += 1) { const candidate = mutateGridState(current, random); const candidateScore = cheapGridObjective(positionsFromGridState(candidate), edges); evaluated += 1; const temperature = Math.max(0.001, 0.04 * (1 - round / rounds)); if (candidateScore <= currentScore || random() < temperature) { current = candidate; currentScore = candidateScore; } if (candidateScore < bestScore) { best = candidate; bestScore = candidateScore; } } const positions = positionsFromGridState(best); finalists.push({ positions, cheapScore: bestScore, straightCrossings: straightCrossings(positions, edges) }); } const unique = new Map<string, typeof finalists[number]>(); for (const candidate of finalists) { const key = positionsKey(candidate.positions); if (!unique.has(key) || unique.get(key)!.cheapScore > candidate.cheapScore) unique.set(key, candidate); } return { mode: "GRID_SWAP_AND_EMPTY_SLOT_SEARCH", evaluated, seeds, rounds, finalists: [...unique.values()].sort((left, right) => left.cheapScore - right.cheapScore).slice(0, 12) }; }
function featureVector(positions: Record<string, { x: number; y: number }>, structuralCrossings: number, cheapScore: number, input: FrontierPlacementInput) { const nodeDistances: number[] = []; for (let left = 0; left < input.nodes.length; left += 1) for (let right = left + 1; right < input.nodes.length; right += 1) { const first = positions[input.nodes[left]!.id]!; const second = positions[input.nodes[right]!.id]!; nodeDistances.push(Math.hypot(first.x - second.x, first.y - second.y)); } const edgeLengths = input.edges.map((edge) => Math.hypot(positions[edge.sourceId]!.x - positions[edge.targetId]!.x, positions[edge.sourceId]!.y - positions[edge.targetId]!.y)); const xs = Object.values(positions).map(({ x }) => x); const ys = Object.values(positions).map(({ y }) => y); const width = Math.max(...xs) - Math.min(...xs); const height = Math.max(...ys) - Math.min(...ys); const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); const sortedEdges = edgeLengths.slice().sort((left, right) => left - right); const medianEdge = sortedEdges.length ? sortedEdges[Math.floor(sortedEdges.length / 2)]! : 0; const minNodeSeparation = nodeDistances.length ? Math.min(...nodeDistances) : 0; const meanNodeSeparation = mean(nodeDistances); const aspect = height > 0 ? width / height : 0; const crossingSignature: number[] = []; for (let left = 0; left < input.edges.length; left += 1) for (let right = left + 1; right < input.edges.length; right += 1) { const first = input.edges[left]!; const second = input.edges[right]!; crossingSignature.push(![first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId) && segmentIntersection(positions[first.sourceId]!, positions[first.targetId]!, positions[second.sourceId]!, positions[second.targetId]!) ? 1 : 0); } const base = [structuralCrossings, cheapScore / 1000000, minNodeSeparation / 100, meanNodeSeparation / 100, medianEdge / 100, (edgeLengths.length ? Math.max(...edgeLengths) : 0) / 100, width / 100, height / 100, aspect]; return { identity: positionsKey(positions), structuralCrossings, cheapScore, minNodeSeparation, meanNodeSeparation, medianEdge, maxEdge: edgeLengths.length ? Math.max(...edgeLengths) : 0, width, height, aspect, featureVector: base, topologyFeatureVector: [...base, ...crossingSignature] }; }
function candidateDominates(left: FrontierCandidate, right: FrontierCandidate) { const noWorse = left.structuralCrossings <= right.structuralCrossings && left.cheapScore <= right.cheapScore && left.minNodeSeparation >= right.minNodeSeparation && left.maxEdge <= right.maxEdge; const strict = left.structuralCrossings < right.structuralCrossings || left.cheapScore < right.cheapScore || left.minNodeSeparation > right.minNodeSeparation || left.maxEdge < right.maxEdge; return noWorse && strict; }
export function selectFrontierRepresentatives(candidates: FrontierCandidate[], frontier: FrontierCandidate[], limit: number, featureMode: string) { if (candidates.length <= limit) return candidates.slice(); if (featureMode === "adaptive-frontier" && limit === frontier.length) return frontier.slice(); const pool = [...frontier, ...candidates.filter((candidate) => !frontier.includes(candidate))]; const vectorFor = (candidate: FrontierCandidate) => featureMode === "topology-aware" ? candidate.topologyFeatureVector : candidate.featureVector; const ranges = vectorFor(candidates[0]!).map((_, index) => Math.max(1, ...candidates.map((candidate) => Math.abs(vectorFor(candidate)[index]!)))); const selected: FrontierCandidate[] = []; const anchor = pool.slice().sort((left, right) => left.structuralCrossings - right.structuralCrossings || left.cheapScore - right.cheapScore || right.minNodeSeparation - left.minNodeSeparation)[0]; if (anchor) selected.push(anchor); while (selected.length < limit && selected.length < pool.length) { const available = pool.filter((candidate) => !selected.includes(candidate)); available.sort((left, right) => { const distance = (candidate: FrontierCandidate) => Math.min(...selected.map((chosen) => Math.sqrt(vectorFor(candidate).reduce((sum, value, index) => sum + ((value - vectorFor(chosen)[index]!) / ranges[index]!) ** 2, 0)))); return distance(right) - distance(left) || left.structuralCrossings - right.structuralCrossings || left.cheapScore - right.cheapScore; }); selected.push(available[0]!); } return selected; }

function failedResult(code: string, message: string): FrontierCandidateSet {
  return { status: "failed", representatives: [], poolCandidates: [], frontierCandidates: [], summary: { mode: "structural-frontier-farthest-point", failureCode: code }, failure: { code, message } };
}

function hasFinitePositions(positions: Record<string, { x: number; y: number }>, ids: string[]) {
  return Object.keys(positions).length === ids.length && ids.every((id) => Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y));
}

function validateCandidateSet(candidates: FrontierCandidate[], ids: string[]) {
  return candidates.length > 0 && candidates.every((candidate) => hasFinitePositions(candidate.positions, ids)
    && Number.isFinite(candidate.structuralCrossings)
    && Number.isFinite(candidate.cheapScore)
    && Number.isFinite(candidate.minNodeSeparation)
    && Number.isFinite(candidate.meanNodeSeparation)
    && Number.isFinite(candidate.maxEdge));
}

export function generateFrontierCandidateSet(input: FrontierPlacementInput, config: FrontierGeneratorConfig = {}): FrontierCandidateSet {
  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) return failedResult("INVALID_INPUT", "Frontier placement input must contain node and edge arrays");
  const nodes = [...input.nodes].sort((left, right) => compareId(left.id, right.id)); const edges = input.edges.slice(); const ids = nodes.map(({ id }) => id); const uniqueIds = new Set(ids);
  if (ids.length === 0 || ids.some((id) => typeof id !== "string" || id.length === 0) || uniqueIds.size !== ids.length || edges.some((edge) => typeof edge.id !== "string" || edge.id.length === 0 || !uniqueIds.has(edge.sourceId) || !uniqueIds.has(edge.targetId))) return failedResult("INVALID_INPUT", "Frontier placement input contains missing, duplicate, or unknown identifiers");
  const limitValue = config.limit ?? 12;
  if (!Number.isFinite(limitValue) || limitValue < 1) return failedResult("INVALID_CONFIG", "Frontier candidate limit must be a positive finite number");
  const limit = Math.max(1, Math.floor(limitValue)); const featureMode = config.featureMode ?? "global";
  const orderSearch = ids.length <= 9 ? exactCircularOrders(ids, edges, config.circularMaximum ?? 12) : heuristicCircularOrders(ids, edges, config.circularSeeds ?? 8, config.circularRounds ?? 80); const variants = [{ aspect: 1.18, scale: 1, phase: -Math.PI / 2 }, { aspect: 1.30, scale: 1, phase: -Math.PI / 2 }, { aspect: 1.30, scale: 1.1, phase: -Math.PI / 2 }, { aspect: 1.18, scale: 1.1, phase: -Math.PI / 2 }]; const candidates: FrontierCandidate[] = [];
  for (const orderResult of orderSearch.orders) for (const variant of variants) { const positions = ellipsePositions(orderResult.order, variant); const cheapScore = orderResult.chordCrossings * 1000000; candidates.push({ family: "circular-order", positions, ...featureVector(positions, orderResult.chordCrossings, cheapScore, { nodes, edges }) }); }
  const gridSearch = genericGridSearch(ids, edges, config.gridSeeds ?? 16, config.gridRounds ?? 1200); for (const finalist of gridSearch.finalists) candidates.push({ family: "grid-structural", positions: clonePositions(finalist.positions), ...featureVector(finalist.positions, finalist.straightCrossings, finalist.cheapScore, { nodes, edges }) });
  const frontier = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => otherIndex !== index && candidateDominates(other, candidate))); const selected = selectFrontierRepresentatives(candidates, frontier, limit, featureMode); const familyCounts = Object.fromEntries([...new Set(candidates.map(({ family }) => family))].map((family) => [family, candidates.filter((candidate) => candidate.family === family).length]));
  if (!validateCandidateSet(candidates, ids) || !validateCandidateSet(frontier, ids) || !validateCandidateSet(selected, ids)) return failedResult("INVALID_OUTPUT", "Frontier candidate generation did not produce a complete finite candidate set");
  return { status: "completed", representatives: selected, poolCandidates: candidates, frontierCandidates: frontier, summary: { mode: featureMode === "topology-aware" ? "structural-topology-frontier-farthest-point" : "structural-frontier-farthest-point", evaluated: gridSearch.evaluated, poolCount: candidates.length, frontierCount: frontier.length, representativeCount: selected.length, limit, familyCounts, featureNames: featureMode === "topology-aware" ? ["structuralCrossings", "cheapScore", "minNodeSeparation", "meanNodeSeparation", "medianEdge", "maxEdge", "width", "height", "aspect", "crossing-relation-pair-signature"] : ["structuralCrossings", "cheapScore", "minNodeSeparation", "meanNodeSeparation", "medianEdge", "maxEdge", "width", "height", "aspect"], featureMode, orderMode: orderSearch.mode, gridMode: gridSearch.mode, gridZeroCrossingFinalistCount: gridSearch.finalists.filter((candidate) => candidate.straightCrossings === 0).length, representativeFamilies: selected.map(({ family }) => family), frontierSourceIdentities: frontier.map(({ identity }) => identity) } }; }
