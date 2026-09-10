import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";
import { INITIAL_ENTITY_CLEARANCE } from "../src/initial-entity-placement.ts";

const fixturePath = process.argv[2] ?? "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
const dataset = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function compareId(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function clonePositions(positions) { return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }])); }
function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}
function nodeFeasibility(positions) {
  let overlapPairs = 0; let minimumSeparation = Infinity;
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    const separation = Math.hypot(first.x - second.x, first.y - second.y);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  return { overlapPairs, minimumSeparation };
}
function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  const firstLength = Math.hypot(rx, ry); const secondLength = Math.hypot(sx, sy);
  return {
    x: a.x + t * rx,
    y: a.y + t * ry,
    angleDegrees: Math.asin(Math.min(1, Math.abs(denominator) / Math.max(1e-9, firstLength * secondLength))) * 180 / Math.PI,
  };
}
function crossingDetails(routes, relationLabels) {
  const labels = [...relationLabels.values()]; const details = [];
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let hit = null;
    for (let a = 1; a < first.samples.length && !hit; a += 1) for (let b = 1; b < second.samples.length && !hit; b += 1) hit = segmentIntersection(first.samples[a - 1], first.samples[a], second.samples[b - 1], second.samples[b]);
    if (hit) details.push({ routes: [first.id, second.id], ...hit, relationLabelNear: labels.some((label) => distanceToRect(hit, label) < 24) });
  }
  return details;
}
function presentationMetrics(positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, ...emptyState,
  });
  const routeLengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0)).sort((a, b) => a - b);
  const nodeLabels = [...presentation.nodeLabels.values()];
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, nodeLabels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => nodeLabels.some((label) => distanceToRect(point, label) < 20))).length;
  let labelOverlap = 0;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) {
    if (Math.abs(nodeLabels[left].x - nodeLabels[right].x) < (nodeLabels[left].width + nodeLabels[right].width) / 2
      && Math.abs(nodeLabels[left].y - nodeLabels[right].y) < (nodeLabels[left].height + nodeLabels[right].height) / 2) labelOverlap += 1;
  }
  const routeSupports = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id); const width = label?.width ?? 48;
    const length = route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0);
    const first = route.samples[0]; const last = route.samples.at(-1) ?? first;
    const direct = Math.hypot(last.x - first.x, last.y - first.y); const horizontalSpan = Math.abs(last.x - first.x);
    const horizontalRatio = horizontalSpan / Math.max(1, direct); const straightness = direct / Math.max(1, length);
    const shallow = horizontalRatio >= 0.55; const usableSpan = shallow ? horizontalSpan * straightness : null; const minimumUsableSpan = shallow ? width + 48 : null;
    return { id: route.id, length, horizontalRatio, usableSpan, minimumUsableSpan, usableShortfall: shallow ? Math.max(0, minimumUsableSpan - usableSpan) : 0 };
  });
  const usableSpanPenalty = routeSupports.reduce((sum, route) => sum + (route.usableShortfall / 18) ** 2 * 160, 0);
  const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y)).sort((a, b) => a - b);
  const x = Object.values(positions).map((point) => point.x); const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const crossing = crossingDetails(presentation.routedEdges, presentation.relationLabels);
  const feasibility = nodeFeasibility(positions);
  const routeMedian = routeLengths[Math.floor(routeLengths.length / 2)]; const routeMax = Math.max(...routeLengths);
  const shortHopCount = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.45).length;
  const score = crossing.length * 100000 + crossing.filter((detail) => detail.relationLabelNear).length * 15000 + labelRouteHits * 30000 + labelNear20 * 5000 + labelOverlap * 10000
    + usableSpanPenalty * 4 + shortHopCount * 5000 + routeMedian * 2 + routeMax + (extent[0] + extent[1]) * 0.25;
  return { score, ...feasibility, extent, aspectRatio: extent[0] / Math.max(1, extent[1]), fitScale: fitGraphView(Object.values(positions), 800, 500).scale, routeMedian, routeMax, hopLengths: { minimum: hopLengths[0], median: hopLengths[Math.floor(hopLengths.length / 2)], maximum: Math.max(...hopLengths), shortHopCount }, crossings: crossing.length, crossingDetails: crossing, labelRouteHits, labelNear20, labelOverlap, usableSpanPenalty, routeSupports };
}
function chordCrossings(order) {
  const index = new Map(order.map((id, position) => [id, position])); let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]; const second = edges[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    const [a, b] = [index.get(first.sourceId), index.get(first.targetId)].sort((x, y) => x - y);
    const [c, d] = [index.get(second.sourceId), index.get(second.targetId)].sort((x, y) => x - y);
    if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) crossings += 1;
  }
  return crossings;
}
function permutations(items, visitor) {
  const working = items.slice(); let count = 0;
  function visit(index) {
    if (index === working.length) { count += 1; visitor(working.slice()); return; }
    for (let next = index; next < working.length; next += 1) { [working[index], working[next]] = [working[next], working[index]]; visit(index + 1); [working[index], working[next]] = [working[next], working[index]]; }
  }
  visit(0); return count;
}
function exactCircularOrders(ids, maximum = 12) {
  const anchor = ids[0]; const rest = ids.slice(1); const orders = []; let best = Infinity;
  const evaluated = permutations(rest, (permutation) => {
    if (compareId(permutation[0], permutation.at(-1)) > 0) return;
    const order = [anchor, ...permutation]; const crossings = chordCrossings(order);
    if (crossings < best) { best = crossings; orders.length = 0; }
    if (crossings === best && orders.length < maximum) orders.push({ order, chordCrossings: crossings });
  });
  return { mode: "EXACT_CIRCULAR_ORDER", evaluated, bestChordCrossings: best, orders };
}
function seededRandom(seed) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; }; }
function heuristicCircularOrders(ids, seeds = 8, rounds = 80) {
  const results = []; let evaluated = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const random = seededRandom(9001 + seed); const order = ids.slice();
    for (let index = order.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
    let current = chordCrossings(order); evaluated += 1;
    for (let round = 0; round < rounds; round += 1) {
      const left = Math.floor(random() * order.length); const right = Math.floor(random() * order.length);
      if (left === right) continue;
      [order[left], order[right]] = [order[right], order[left]];
      const candidate = chordCrossings(order); evaluated += 1;
      if (candidate <= current || random() < 0.025) current = candidate;
      else [order[left], order[right]] = [order[right], order[left]];
    }
    results.push({ order: order.slice(), chordCrossings: current });
  }
  results.sort((left, right) => left.chordCrossings - right.chordCrossings || left.order.join("\0").localeCompare(right.order.join("\0")));
  return { mode: "HEURISTIC_CIRCULAR_ORDER", evaluated, bestChordCrossings: results[0]?.chordCrossings ?? Infinity, orders: results.slice(0, 12) };
}
function ellipsePositions(order, { aspect, scale, phase }) {
  const minimumNeighborGap = INITIAL_ENTITY_CLEARANCE * 1.8;
  const radiusY = Math.max(160, minimumNeighborGap / (2 * Math.sin(Math.PI / Math.max(3, order.length))) * scale);
  const radiusX = radiusY * aspect;
  return Object.fromEntries(order.map((id, index) => {
    const angle = phase + 2 * Math.PI * index / order.length;
    return [id, { x: radiusX + radiusX * Math.cos(angle), y: radiusY + radiusY * Math.sin(angle) }];
  }));
}
function straightCrossingsForPositions(positions) {
  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]; const second = edges[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (segmentIntersection(positions[first.sourceId], positions[first.targetId], positions[second.sourceId], positions[second.targetId])) crossings += 1;
  }
  return crossings;
}
function gridSlots(nodeCount) {
  const columns = Math.max(3, Math.ceil(Math.sqrt(nodeCount * 1.35)));
  const rows = Math.max(2, Math.ceil(nodeCount / columns));
  const horizontalGap = Math.max(196, INITIAL_ENTITY_CLEARANCE * 2.55);
  const verticalGap = Math.max(164, INITIAL_ENTITY_CLEARANCE * 2.15);
  return Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns) * horizontalGap,
    y: Math.floor(index / columns) * verticalGap,
  }));
}
function makeGridState(ids, random) {
  const slots = gridSlots(ids.length); const assignment = [...ids];
  for (let index = assignment.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [assignment[index], assignment[swap]] = [assignment[swap], assignment[index]]; }
  const occupied = assignment.map((id, index) => ({ id, slot: index }));
  return { slots, occupied };
}
function positionsFromGridState(state) {
  return Object.fromEntries(state.occupied.map(({ id, slot }) => [id, state.slots[slot]]));
}
function cloneGridState(state) { return { slots: state.slots, occupied: state.occupied.map((entry) => ({ ...entry })) }; }
function mutateGridState(state, random) {
  const next = cloneGridState(state); const used = new Set(next.occupied.map((entry) => entry.slot));
  const left = Math.floor(random() * next.occupied.length);
  const available = next.slots.map((_, slot) => slot).filter((slot) => !used.has(slot));
  if (available.length > 0 && random() < 0.42) next.occupied[left].slot = available[Math.floor(random() * available.length)];
  else {
    const right = Math.floor(random() * next.occupied.length);
    [next.occupied[left].slot, next.occupied[right].slot] = [next.occupied[right].slot, next.occupied[left].slot];
  }
  return next;
}
function cheapGridObjective(positions) {
  const crossings = straightCrossingsForPositions(positions);
  const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y));
  const shortEdges = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.65).length;
  const longEdgePenalty = hopLengths.reduce((sum, length) => sum + Math.max(0, length - 480) ** 2, 0);
  return crossings * 1000000 + shortEdges * 20000 + longEdgePenalty;
}
function genericGridSearch(ids, seeds = 16, rounds = 1200) {
  const finalists = []; let evaluated = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const random = seededRandom(17041 + seed); let current = makeGridState(ids, random); let currentScore = cheapGridObjective(positionsFromGridState(current)); evaluated += 1;
    let best = current; let bestScore = currentScore;
    for (let round = 0; round < rounds; round += 1) {
      const candidate = mutateGridState(current, random); const candidateScore = cheapGridObjective(positionsFromGridState(candidate)); evaluated += 1;
      const temperature = Math.max(0.001, 0.04 * (1 - round / rounds));
      if (candidateScore <= currentScore || random() < temperature) { current = candidate; currentScore = candidateScore; }
      if (candidateScore < bestScore) { best = candidate; bestScore = candidateScore; }
    }
    finalists.push({ positions: positionsFromGridState(best), cheapScore: bestScore, straightCrossings: straightCrossingsForPositions(positionsFromGridState(best)) });
  }
  const unique = new Map();
  for (const candidate of finalists) {
    const key = Object.entries(candidate.positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x},${point.y}`).join("|");
    if (!unique.has(key) || unique.get(key).cheapScore > candidate.cheapScore) unique.set(key, candidate);
  }
  return { mode: "GRID_SWAP_AND_EMPTY_SLOT_SEARCH", evaluated, seeds, rounds, finalists: [...unique.values()].sort((left, right) => left.cheapScore - right.cheapScore).slice(0, 12) };
}
function fullPresentationScore(metrics) {
  return metrics.score + metrics.overlapPairs * 5000000;
}
function mutatePresentationPositions(positions, ids, random) {
  const next = clonePositions(positions);
  const id = ids[Math.floor(random() * ids.length)];
  const step = [24, 36, 48, 64, 80, 96][Math.floor(random() * 6)];
  const direction = Math.floor(random() * 8);
  const angle = direction * Math.PI / 4;
  next[id].x += Math.cos(angle) * step;
  next[id].y += Math.sin(angle) * step;
  return next;
}
function refineForPresentation(finalists, ids, seedsPerFinalist = 3, rounds = 90) {
  const refined = []; let evaluated = 0;
  for (let finalistIndex = 0; finalistIndex < finalists.length; finalistIndex += 1) {
    for (let seed = 0; seed < seedsPerFinalist; seed += 1) {
      const random = seededRandom(26003 + finalistIndex * 131 + seed);
      let current = clonePositions(finalists[finalistIndex].positions);
      let currentMetrics = presentationMetrics(current); evaluated += 1;
      let currentScore = fullPresentationScore(currentMetrics);
      let best = current; let bestMetrics = currentMetrics; let bestScore = currentScore;
      for (let round = 0; round < rounds; round += 1) {
        const candidate = mutatePresentationPositions(current, ids, random);
        const metrics = presentationMetrics(candidate); evaluated += 1;
        const score = fullPresentationScore(metrics);
        const temperature = Math.max(0.001, 0.025 * (1 - round / rounds));
        if (score <= currentScore || random() < temperature) { current = candidate; currentMetrics = metrics; currentScore = score; }
        if (score < bestScore) { best = candidate; bestMetrics = metrics; bestScore = score; }
      }
      refined.push({ positions: best, presentationScore: bestScore, metrics: bestMetrics });
    }
  }
  const unique = new Map();
  for (const candidate of refined) {
    const key = Object.entries(candidate.positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|");
    if (!unique.has(key) || unique.get(key).presentationScore > candidate.presentationScore) unique.set(key, candidate);
  }
  return { mode: "PRODUCT_PRESENTATION_LOCAL_REPAIR", evaluated, seedsPerFinalist, rounds, finalists: [...unique.values()].sort((left, right) => left.presentationScore - right.presentationScore).slice(0, 12) };
}
function hopDistanceMap(positions) {
  return new Map(edges.map((edge) => [edge.id, Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y)]));
}
function constrainedRelaxationScore(metrics, positions, referencePositions) {
  if (metrics.crossings !== 0 || metrics.overlapPairs !== 0 || metrics.labelRouteHits !== 0 || metrics.labelOverlap !== 0 || metrics.labelNear20 !== 0) return Infinity;
  const referenceHops = hopDistanceMap(referencePositions);
  let localityPenalty = 0; let edgeLengthPenalty = 0;
  for (const edge of edges) {
    const length = Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y);
    const ratio = length / Math.max(1, referenceHops.get(edge.id));
    localityPenalty += Math.max(0, 0.80 - ratio) ** 2 + Math.max(0, ratio - 1.20) ** 2;
    edgeLengthPenalty += Math.max(0, length - 480) ** 2 / 480;
  }
  return metrics.usableSpanPenalty * 6 + metrics.routeMedian * 2 + metrics.routeMax + (metrics.extent[0] + metrics.extent[1]) * 0.20
    + localityPenalty * 9000 + edgeLengthPenalty;
}
function constrainedPostStructuralRelaxation(startPositions, ids, maxDisplacement = 48) {
  const referencePositions = clonePositions(startPositions); let current = clonePositions(startPositions);
  let currentMetrics = presentationMetrics(current); let currentScore = constrainedRelaxationScore(currentMetrics, current, referencePositions);
  let best = current; let bestMetrics = currentMetrics; let bestScore = currentScore; let evaluated = 1; let acceptedMoves = 0;
  const directions = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
  const steps = [18, 9, 6];
  for (const id of ids) {
    for (const step of steps) for (const angle of directions) {
      const candidate = clonePositions(current);
      candidate[id].x += Math.cos(angle) * step;
      candidate[id].y += Math.sin(angle) * step;
      const displacement = Math.hypot(candidate[id].x - referencePositions[id].x, candidate[id].y - referencePositions[id].y);
      if (displacement > maxDisplacement) continue;
      const metrics = presentationMetrics(candidate); evaluated += 1;
      const score = constrainedRelaxationScore(metrics, candidate, referencePositions);
      if (score < currentScore) { current = candidate; currentMetrics = metrics; currentScore = score; acceptedMoves += 1; }
      if (score < bestScore) { best = candidate; bestMetrics = metrics; bestScore = score; }
    }
  }
  return { mode: "POST_STRUCTURAL_CONSTRAINED_RELAXATION", evaluated, acceptedMoves, maxDisplacement, startPositions: referencePositions, startMetrics: presentationMetrics(referencePositions), positions: best, metrics: bestMetrics, score: bestScore, changed: acceptedMoves > 0 };
}
function genericSearch() {
  const ids = graph.nodes.map((node) => node.id).sort(compareId);
  const orderSearch = ids.length <= 9 ? exactCircularOrders(ids) : heuristicCircularOrders(ids);
  const variants = [
    { aspect: 1.18, scale: 1, phase: -Math.PI / 2 },
    { aspect: 1.30, scale: 1, phase: -Math.PI / 2 },
    { aspect: 1.30, scale: 1.1, phase: -Math.PI / 2 },
    { aspect: 1.18, scale: 1.1, phase: -Math.PI / 2 },
  ];
  const candidates = [];
  for (const orderResult of orderSearch.orders) for (const variant of variants) {
    const positions = ellipsePositions(orderResult.order, variant); const metrics = presentationMetrics(positions);
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "circular-order", order: orderResult.order, chordCrossings: orderResult.chordCrossings, variant, positions, metrics, eligible });
  }
  const gridSearch = genericGridSearch(ids);
  for (const finalist of gridSearch.finalists) {
    const metrics = presentationMetrics(finalist.positions);
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "grid-structural", ...finalist, positions: clonePositions(finalist.positions), metrics, eligible });
  }
  // Only zero-crossing structural states enter the expensive Product-aware repair.
  // This keeps the diagnostic bounded while making label safety decisive once the
  // structural feasibility condition has already been found.
  const zeroCrossingFinalists = gridSearch.finalists.filter((finalist) => finalist.straightCrossings === 0);
  const presentationRepair = refineForPresentation(zeroCrossingFinalists, ids, 1, 24);
  for (const finalist of presentationRepair.finalists) {
    const metrics = finalist.metrics;
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "grid-structural-presentation-repair", ...finalist, positions: clonePositions(finalist.positions), metrics, eligible });
  }
  candidates.sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.metrics.score - right.metrics.score);
  const structuralSelected = candidates[0] ?? null;
  const postStructuralRelaxation = structuralSelected ? constrainedPostStructuralRelaxation(structuralSelected.positions, ids) : null;
  if (postStructuralRelaxation) {
    const metrics = postStructuralRelaxation.metrics;
    const eligible = metrics.crossings === 0 && metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "post-structural-constrained-relaxation", positions: clonePositions(postStructuralRelaxation.positions), metrics, eligible, relaxation: postStructuralRelaxation });
  }
  candidates.sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.metrics.score - right.metrics.score);
  return { orderSearch, gridSearch, presentationRepair, postStructuralRelaxation, presentationEvaluations: candidates.length, candidates, selected: candidates[0] ?? null };
}
function complexityProbe() {
  return [9, 10, 12, 16, 25].map((nodeCount) => ({
    nodeCount,
    mode: nodeCount <= 9 ? "exact circular order + grid structural search" : "heuristic circular order + grid structural search",
    exactCircularPermutations: nodeCount <= 9 ? `${Math.floor(factorial(nodeCount - 1) / 2)}` : "not attempted",
    gridBudget: "16 seeded starts × 1200 swap/move evaluations = ≤19216 cheap geometry evaluations",
    presentationRepairBudget: "up to 12 zero-crossing grid finalists × 1 start × 24 rounds = ≤300 Product presentation evaluations",
  }));
}
function factorial(value) { let result = 1; for (let factor = 2; factor <= value; factor += 1) result *= factor; return result; }

const startedAt = performance.now();
const search = genericSearch();
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-GENERIC-CROSSING-SEARCH-v1",
  diagnosticOnly: true,
  fixturePath,
  graph: { nodes: graph.nodes.length, edges: edges.length },
  hardBoundary: { rule: "INITIAL_ENTITY_CLEARANCE", value: INITIAL_ENTITY_CLEARANCE, overlapRejected: true },
  strategy: "exact circular-order search for n<=9; deterministic heuristic circular-order search above that; Product presentation evaluates only finalists",
  elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  scaling: complexityProbe(),
  ...search,
}, null, 2));
