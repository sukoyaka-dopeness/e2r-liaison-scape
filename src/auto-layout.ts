export type LayoutPoint = { x: number; y: number };
export type LayoutEntity = { id: string };
export type LayoutRelation = { id: string; sourceId: string; targetId: string };
export type AutoLayoutInput = { entities: readonly LayoutEntity[]; relations: readonly LayoutRelation[] };
export type AutoLayoutOptions = {
  nodeClearance?: number;
  componentGap?: number;
  iterations?: number;
};

export type NormalizedLayoutGraph = {
  ids: readonly string[];
  canonicalNeighbors: ReadonlyMap<string, readonly string[]>;
  components: readonly (readonly string[])[];
  degree: ReadonlyMap<string, number>;
};

type ResolvedLayoutOptions = {
  clearance: number;
  gap: number;
  iterations: number;
};

type AutoLayoutSeed = {
  center: LayoutPoint;
  initialPositions: Record<string, LayoutPoint>;
};

type InitialPositionSource = (
  component: readonly string[],
  componentLeft: number,
  clearance: number,
) => AutoLayoutSeed;

const DEFAULT_CLEARANCE = 96;
const DEFAULT_COMPONENT_GAP = 144;
const DEFAULT_ITERATIONS = 12;
export const INITIAL_PLACEMENT_SETTLING_ITERATIONS = 3;

function compareId(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = left[index]!.codePointAt(0)!;
    const rightCodePoint = right[index]!.codePointAt(0)!;
    if (leftCodePoint !== rightCodePoint) return leftCodePoint - rightCodePoint;
  }
  return left.length - right.length;
}
function key(a: string, b: string): string { return compareId(a, b) < 0 ? `${a}\0${b}` : `${b}\0${a}`; }

function resolveLayoutOptions(options: AutoLayoutOptions): ResolvedLayoutOptions {
  const clearance = Math.max(1, options.nodeClearance ?? DEFAULT_CLEARANCE);
  const gap = Math.max(clearance, options.componentGap ?? DEFAULT_COMPONENT_GAP);
  const iterations = Math.max(0, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  return { clearance, gap, iterations };
}

export function buildNormalizedLayoutGraph(input: AutoLayoutInput): NormalizedLayoutGraph {
  const ids = [...new Set(input.entities.map((entity) => entity.id))].sort(compareId);
  const idSet = new Set(ids);
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  const pairs = new Set<string>();
  for (const relation of input.relations) {
    if (!idSet.has(relation.sourceId) || !idSet.has(relation.targetId) || relation.sourceId === relation.targetId) continue;
    const pair = key(relation.sourceId, relation.targetId);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    adjacency.get(relation.sourceId)?.add(relation.targetId);
    adjacency.get(relation.targetId)?.add(relation.sourceId);
  }
  const canonicalNeighbors = new Map(
    ids.map((id) => [id, [...(adjacency.get(id) ?? [])].sort(compareId)]),
  );

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const start of ids) {
    if (visited.has(start)) continue;
    const component: string[] = []; const queue = [start]; visited.add(start);
    while (queue.length) {
      const current = queue.shift()!; component.push(current);
      for (const next of canonicalNeighbors.get(current) ?? []) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    components.push(component.sort(compareId));
  }

  return {
    ids,
    canonicalNeighbors,
    components,
    degree: new Map(ids.map((id) => [id, adjacency.get(id)!.size])),
  };
}

function createAutoLayoutInitialPositions(
  layoutGraph: NormalizedLayoutGraph,
  component: readonly string[],
  componentLeft: number,
  clearance: number,
): AutoLayoutSeed {
  const ranked = component.slice().sort((a, b) => (layoutGraph.degree.get(b)! - layoutGraph.degree.get(a)!) || compareId(a, b));
  const center = { x: componentLeft + 160, y: 160 };
  const initialPositions: Record<string, LayoutPoint> = {};
  ranked.forEach((id, index) => {
    if (index === 0) initialPositions[id] = { ...center };
    else { const angle = ((index - 1) % 8) * Math.PI / 4; const ring = Math.floor((index - 1) / 8) + 1;
      initialPositions[id] = { x: center.x + Math.cos(angle) * clearance * 1.8 * ring, y: center.y + Math.sin(angle) * clearance * 1.8 * ring }; }
  });
  return { center, initialPositions };
}

export function settleLayoutPositions(
  layoutGraph: NormalizedLayoutGraph,
  component: readonly string[],
  initialPositions: Readonly<Record<string, LayoutPoint>>,
  options: Pick<AutoLayoutOptions, "nodeClearance" | "iterations"> = {},
): Record<string, LayoutPoint> {
  const clearance = Math.max(1, options.nodeClearance ?? DEFAULT_CLEARANCE);
  const iterations = Math.max(0, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const points: Record<string, LayoutPoint> = {};
  for (const id of component) {
    const point = initialPositions[id];
    if (!point) throw new Error(`Missing initial position for entity: ${id}`);
    points[id] = { x: point.x, y: point.y };
  }
  for (let step = 0; step < iterations; step += 1) {
    for (const id of component) {
      let dx = 0; let dy = 0;
      for (const other of component) if (other !== id) {
        const deltaX = points[id].x - points[other].x; const deltaY = points[id].y - points[other].y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        if (distance < clearance) { const push = (clearance - distance) / distance; dx += deltaX * push * 0.25; dy += deltaY * push * 0.25; }
      }
      for (const neighbor of layoutGraph.canonicalNeighbors.get(id) ?? []) { dx += (points[neighbor].x - points[id].x) * 0.018; dy += (points[neighbor].y - points[id].y) * 0.018; }
      points[id] = { x: points[id].x + Math.max(-18, Math.min(18, dx)), y: points[id].y + Math.max(-18, Math.min(18, dy)) };
    }
  }
  return points;
}

function settleNormalizedLayout(
  layoutGraph: NormalizedLayoutGraph,
  options: ResolvedLayoutOptions,
  initialPositionSource: InitialPositionSource,
): Record<string, LayoutPoint> {
  const result: Record<string, LayoutPoint> = {};
  let componentLeft = 0;
  for (const component of layoutGraph.components) {
    const seed = initialPositionSource(component, componentLeft, options.clearance);
    const points = settleLayoutPositions(layoutGraph, component, seed.initialPositions, { nodeClearance: options.clearance, iterations: options.iterations });
    const maxX = Math.max(...Object.values(points).map((point) => point.x), seed.center.x);
    for (const id of component) result[id] = { x: points[id].x, y: points[id].y };
    componentLeft = maxX + options.gap;
  }
  return result;
}

export function settleNormalizedLayoutFromInitialPositions(
  layoutGraph: NormalizedLayoutGraph,
  initialPositions: Readonly<Record<string, LayoutPoint>>,
  options: AutoLayoutOptions = {},
): Record<string, LayoutPoint> {
  return settleNormalizedLayout(layoutGraph, resolveLayoutOptions(options), (component, componentLeft) => ({
    center: { x: componentLeft + 160, y: 160 },
    initialPositions: { ...initialPositions },
  }));
}

/** Pure, deterministic EXP-1A placement. It does not mutate its input or Dataset data. */
export function solveAutoLayout(input: AutoLayoutInput, options: AutoLayoutOptions = {}): Record<string, LayoutPoint> {
  const { clearance, gap, iterations } = resolveLayoutOptions(options);
  const layoutGraph = buildNormalizedLayoutGraph(input);
  return settleNormalizedLayout(layoutGraph, { clearance, gap, iterations }, (component, componentLeft, nodeClearance) => createAutoLayoutInitialPositions(layoutGraph, component, componentLeft, nodeClearance));
}

/** Canonicalizes only positions produced for automatic initial display. */
export function canonicalizeAutomaticPositions(positions: Readonly<Record<string, LayoutPoint>>): Record<string, LayoutPoint> {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: Math.round(point.x), y: Math.round(point.y) }]));
}

/**
 * Bounded derived placement for coordinate-less Dataset opening. This reuses
 * the pure solver mechanics without invoking the explicit Auto Layout workflow.
 */
export function settleInitialPlacement(input: AutoLayoutInput): Record<string, LayoutPoint> {
  return canonicalizeAutomaticPositions(solveAutoLayout(input, { iterations: INITIAL_PLACEMENT_SETTLING_ITERATIONS }));
}
