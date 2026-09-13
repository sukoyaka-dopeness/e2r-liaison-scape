// Pure browser-compatible research generator for compact, crossing-aware
// placements. Product presentation remains the final evaluator.
import { structuralFormulations } from "./structural-formulation.mjs";
const MAX_NODES = 64;
const MAX_EDGES = 256;
const MAX_OBJECTIVE_CALLS = 768;

const compareIds = (left, right) => left.localeCompare(right);

function segmentCrosses(a, b, c, d) {
  const orientation = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function gridSlots(count, staggered) {
  if (count === 0) return [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / columns);
  const spacing = 150;
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    slots.push({
      x: (column - (columns - 1) / 2) * spacing + (staggered && row % 2 ? spacing / 2 : 0),
      y: (row - (rows - 1) / 2) * spacing,
    });
  }
  const center = slots.reduce((sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }), { x: 0, y: 0 });
  return slots.map((point) => ({ x: point.x - center.x, y: point.y - center.y }));
}

function optimizeOrder(initialOrder, slots, edgePairs, neighbors) {
  let calls = 0;
  const measure = (order) => {
    calls += 1;
    const slotByNode = new Map(order.map((nodeIndex, slotIndex) => [nodeIndex, slots[slotIndex]]));
    let crossings = 0;
    let totalLength = 0;
    let maximumLength = 0;
    for (let left = 0; left < edgePairs.length; left += 1) {
      const [a, b] = edgePairs[left];
      const first = slotByNode.get(a);
      const second = slotByNode.get(b);
      const length = Math.hypot(second.x - first.x, second.y - first.y);
      totalLength += length;
      maximumLength = Math.max(maximumLength, length);
      for (let right = left + 1; right < edgePairs.length; right += 1) {
        const [c, d] = edgePairs[right];
        if (a === c || a === d || b === c || b === d) continue;
        if (segmentCrosses(first, second, slotByNode.get(c), slotByNode.get(d))) crossings += 1;
      }
    }
    let angularPressure = 0;
    for (let nodeIndex = 0; nodeIndex < neighbors.length; nodeIndex += 1) {
      if (neighbors[nodeIndex].length < 2) continue;
      const center = slotByNode.get(nodeIndex);
      const angles = neighbors[nodeIndex]
        .map((neighborIndex) => {
          const point = slotByNode.get(neighborIndex);
          return Math.atan2(point.y - center.y, point.x - center.x);
        })
        .sort((left, right) => left - right);
      const targetGap = Math.PI * 2 / Math.max(8, angles.length * 2);
      for (let index = 0; index < angles.length; index += 1) {
        const next = index + 1 < angles.length ? angles[index + 1] : angles[0] + Math.PI * 2;
        angularPressure += Math.max(0, targetGap - (next - angles[index])) ** 2;
      }
    }
    return { crossings, angularPressure, maximumLength, totalLength };
  };
  const better = (left, right) => left.crossings < right.crossings
    || (left.crossings === right.crossings && left.angularPressure < right.angularPressure - 1e-9)
    || (left.crossings === right.crossings && Math.abs(left.angularPressure - right.angularPressure) <= 1e-9 && left.maximumLength < right.maximumLength - 1e-9)
    || (left.crossings === right.crossings && Math.abs(left.angularPressure - right.angularPressure) <= 1e-9 && Math.abs(left.maximumLength - right.maximumLength) <= 1e-9 && left.totalLength < right.totalLength - 1e-9);
  let order = [...initialOrder];
  let best = measure(order);
  for (let pass = 0; pass < 6 && calls < MAX_OBJECTIVE_CALLS; pass += 1) {
    let changed = false;
    for (let left = 0; left < order.length && calls < MAX_OBJECTIVE_CALLS; left += 1) {
      for (let right = left + 1; right < order.length && calls < MAX_OBJECTIVE_CALLS; right += 1) {
        const candidate = [...order];
        [candidate[left], candidate[right]] = [candidate[right], candidate[left]];
        const measured = measure(candidate);
        if (!better(measured, best)) continue;
        order = candidate;
        best = measured;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { order, calls, measure: best };
}

function structuralGridOrder(basePositions, ids, slots) {
  if (ids.length === 0) return [];
  const source = ids.map((id) => basePositions[id]);
  const xs = source.map(({ x }) => x), ys = source.map(({ y }) => y);
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const center = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  const slotXs = slots.map(({ x }) => x), slotYs = slots.map(({ y }) => y);
  const slotWidth = Math.max(1, Math.max(...slotXs) - Math.min(...slotXs));
  const slotHeight = Math.max(1, Math.max(...slotYs) - Math.min(...slotYs));
  const normalized = source.map((point) => ({ x: (point.x - center.x) * slotWidth / width, y: (point.y - center.y) * slotHeight / height }));
  const available = new Set(slots.map((_, index) => index));
  const order = Array(ids.length);
  for (const nodeIndex of ids.map((_, index) => index).sort((left, right) => {
    const leftNearest = Math.min(...slots.map((slot) => Math.hypot(slot.x - normalized[left].x, slot.y - normalized[left].y)));
    const rightNearest = Math.min(...slots.map((slot) => Math.hypot(slot.x - normalized[right].x, slot.y - normalized[right].y)));
    return rightNearest - leftNearest || left - right;
  })) {
    const slotIndex = [...available].sort((left, right) => {
      const leftDistance = Math.hypot(slots[left].x - normalized[nodeIndex].x, slots[left].y - normalized[nodeIndex].y);
      const rightDistance = Math.hypot(slots[right].x - normalized[nodeIndex].x, slots[right].y - normalized[nodeIndex].y);
      return leftDistance - rightDistance || left - right;
    })[0];
    order[slotIndex] = nodeIndex;
    available.delete(slotIndex);
  }
  return order;
}

export function structuralFormulations2(nodes, edges) {
  const ids = nodes.map(({ id }) => id).sort(compareIds);
  if (ids.length > MAX_NODES || edges.length > MAX_EDGES || new Set(ids).size !== ids.length) throw new Error("structural research input bound");
  const index = new Map(ids.map((id, position) => [id, position]));
  const neighbors = ids.map(() => new Set());
  const edgeKeys = new Set();
  const edgePairs = [];
  for (const edge of edges) {
    const source = index.get(edge.sourceId);
    const target = index.get(edge.targetId);
    if (source === undefined || target === undefined || source === target) continue;
    const left = Math.min(source, target);
    const right = Math.max(source, target);
    const key = `${left}:${right}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edgePairs.push([left, right]);
    neighbors[left].add(right);
    neighbors[right].add(left);
  }
  edgePairs.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const adjacency = neighbors.map((set) => [...set].sort((left, right) => left - right));
  const degreeOrder = ids.map((_, nodeIndex) => nodeIndex).sort((left, right) => adjacency[right].length - adjacency[left].length || left - right);
  const root = degreeOrder[0];
  const bfsOrder = [];
  const seen = new Set();
  for (const seed of [root, ...degreeOrder]) {
    if (seed === undefined || seen.has(seed)) continue;
    const queue = [seed];
    seen.add(seed);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      bfsOrder.push(current);
      const next = [...adjacency[current]].sort((left, right) => adjacency[right].length - adjacency[left].length || left - right);
      for (const neighbor of next) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
    }
  }
  const twinGroups = new Map();
  for (let nodeIndex = 0; nodeIndex < ids.length; nodeIndex += 1) {
    const signature = adjacency[nodeIndex].join(",");
    const group = twinGroups.get(signature) ?? [];
    group.push(nodeIndex);
    twinGroups.set(signature, group);
  }
  const twinOrder = [...twinGroups.values()]
    .sort((left, right) => right.length - left.length || left[0] - right[0])
    .flatMap((group) => group.filter((_, offset) => offset % 2 === 0).concat(group.filter((_, offset) => offset % 2 === 1).toReversed()));
  const starts = [["degree", degreeOrder], ["bfs", bfsOrder], ["twins", twinOrder]];
  const results = [];
  for (const [startName, start] of starts) for (const staggered of [false, true]) {
    const slots = gridSlots(ids.length, staggered);
    const optimized = optimizeOrder(start, slots, edgePairs, adjacency);
    results.push({
      family: `guarded-crossing-grid-${startName}${staggered ? "-staggered" : ""}`,
      positions: Object.fromEntries(optimized.order.map((nodeIndex, slotIndex) => [ids[nodeIndex], slots[slotIndex]])),
      cheap: { ...optimized.measure, objectiveCalls: optimized.calls },
    });
  }
  for (const candidate of structuralFormulations(nodes, edges).filter(({ family }) => /^(crossing-ring|ordered-stress|twin-spokes)/.test(family))) {
    const staggered = candidate.family.endsWith("rotated");
    const slots = gridSlots(ids.length, staggered);
    const optimized = optimizeOrder(structuralGridOrder(candidate.positions, ids, slots), slots, edgePairs, adjacency);
    results.push({
      family: `structural-crossing-grid-${candidate.family}`,
      positions: Object.fromEntries(optimized.order.map((nodeIndex, slotIndex) => [ids[nodeIndex], slots[slotIndex]])),
      cheap: { sourceFamily: candidate.family, ...optimized.measure, objectiveCalls: optimized.calls },
    });
  }
  return results;
}
