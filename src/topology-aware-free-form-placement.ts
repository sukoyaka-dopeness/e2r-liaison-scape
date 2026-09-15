export type FreeFormPoint = { x: number; y: number };
export type FreeFormNode = { id: string };
export type FreeFormEdge = { id: string; sourceId: string; targetId: string };

export type FreeFormCandidate = {
  family: string;
  positions: Record<string, FreeFormPoint>;
  seed: string;
  iterations: number;
  topology: {
    componentCount: number;
    rootIds: string[];
    layerCount: number;
    bridgeIds: string[];
  };
  cheapMetrics: {
    crossings: number;
    overlapPairs: number;
    minimumSeparation: number;
    spacingDeficit: number;
    score: number;
  };
};

const CLEARANCE = 140;
const NODE_STEP = 24;
const MAX_ITERATIONS = 28;

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function jitter(id: string, variant: number, axis: number): number {
  const value = hash(`${variant}:${axis}:${id}`) % 2001;
  return (value / 1000 - 1) * 28;
}

function segmentCrosses(
  first: FreeFormPoint,
  second: FreeFormPoint,
  third: FreeFormPoint,
  fourth: FreeFormPoint,
): boolean {
  const cross = (a: FreeFormPoint, b: FreeFormPoint, c: FreeFormPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const firstTurn = cross(first, second, third);
  const secondTurn = cross(first, second, fourth);
  const thirdTurn = cross(third, fourth, first);
  const fourthTurn = cross(third, fourth, second);
  return firstTurn * secondTurn < -1e-7 && thirdTurn * fourthTurn < -1e-7;
}

function distance(first: FreeFormPoint, second: FreeFormPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function buildAdjacency(nodes: readonly FreeFormNode[], edges: readonly FreeFormEdge[]): Map<string, Set<string>> {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.sourceId === edge.targetId || !adjacency.has(edge.sourceId) || !adjacency.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)!.add(edge.targetId);
    adjacency.get(edge.targetId)!.add(edge.sourceId);
  }
  return adjacency;
}

function componentData(nodes: readonly FreeFormNode[], edges: readonly FreeFormEdge[]) {
  const adjacency = buildAdjacency(nodes, edges);
  const degree = new Map([...adjacency].map(([id, neighbors]) => [id, neighbors.size]));
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of nodes.slice().sort((left, right) => compareId(left.id, right.id))) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const pending = [node.id];
    visited.add(node.id);
    while (pending.length > 0) {
      const current = pending.shift()!;
      component.push(current);
      for (const neighbor of [...(adjacency.get(current) ?? [])].sort(compareId)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    components.push(component.sort(compareId));
  }
  const roots: string[] = [];
  const layers = new Map<string, number>();
  const layerCountByComponent: number[] = [];
  for (const component of components) {
    const root = component.slice().sort((left, right) => degree.get(right)! - degree.get(left)! || compareId(left, right))[0]!;
    roots.push(root);
    const pending = [root];
    layers.set(root, 0);
    while (pending.length > 0) {
      const current = pending.shift()!;
      for (const neighbor of [...(adjacency.get(current) ?? [])].sort((left, right) => degree.get(right)! - degree.get(left)! || compareId(left, right))) {
        if (!layers.has(neighbor)) {
          layers.set(neighbor, layers.get(current)! + 1);
          pending.push(neighbor);
        }
      }
    }
    layerCountByComponent.push(Math.max(...component.map((id) => layers.get(id)!)) + 1);
  }
  const bridgeIds = edges.filter((edge) => {
    if (edge.sourceId === edge.targetId) return false;
    const without = edges.filter((other) => other.id !== edge.id && other.sourceId !== other.targetId);
    const reachable = new Set<string>([edge.sourceId]);
    const pending = [edge.sourceId];
    const local = buildAdjacency(nodes, without);
    while (pending.length > 0) {
      const current = pending.shift()!;
      for (const neighbor of local.get(current) ?? []) if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        pending.push(neighbor);
      }
    }
    return !reachable.has(edge.targetId);
  }).map((edge) => edge.id).sort(compareId);
  return { adjacency, degree, components, roots, layers, layerCountByComponent, bridgeIds };
}

function seedPositions(nodes: readonly FreeFormNode[], edges: readonly FreeFormEdge[], variant: number) {
  const topology = componentData(nodes, edges);
  const positions: Record<string, FreeFormPoint> = {};
  let componentOffset = 0;
  topology.components.forEach((component, componentIndex) => {
    const layerGroups = new Map<number, string[]>();
    for (const id of component) {
      const layer = topology.layers.get(id)!;
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer)!.push(id);
    }
    const maxLayerSize = Math.max(...[...layerGroups.values()].map((group) => group.length));
    for (const [layer, group] of [...layerGroups.entries()].sort(([left], [right]) => left - right)) {
      const ordered = group.slice().sort((left, right) => topology.degree.get(right)! - topology.degree.get(left)! || compareId(left, right));
      const center = (ordered.length - 1) / 2;
      ordered.forEach((id, index) => {
        const horizontal = (index - center) * (185 + variant * 3);
        const vertical = layer * (170 + (variant % 3) * 11);
        const rotate = variant % 2 === 1;
        const freeX = (rotate ? vertical : horizontal) + jitter(id, variant, 0);
        const freeY = (rotate ? horizontal : vertical) + jitter(id, variant, 1);
        positions[id] = { x: componentOffset + freeX, y: freeY };
      });
    }
    componentOffset += Math.max(520, maxLayerSize * 210) + 160;
    void componentIndex;
  });
  return { positions, topology };
}

function cheapMetrics(nodes: readonly FreeFormNode[], edges: readonly FreeFormEdge[], positions: Record<string, FreeFormPoint>) {
  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]!;
    const second = edges[right]!;
    if (new Set([first.sourceId, first.targetId, second.sourceId, second.targetId]).size < 4) continue;
    if (segmentCrosses(positions[first.sourceId]!, positions[first.targetId]!, positions[second.sourceId]!, positions[second.targetId]!)) crossings += 1;
  }
  let overlapPairs = 0;
  let minimumSeparation = Infinity;
  let spacingDeficit = 0;
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    const separation = distance(positions[nodes[left]!.id]!, positions[nodes[right]!.id]!);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (separation < 128) overlapPairs += 1;
    spacingDeficit += Math.max(0, CLEARANCE - separation);
  }
  const edgeLengths = edges.filter((edge) => edge.sourceId !== edge.targetId).map((edge) => distance(positions[edge.sourceId]!, positions[edge.targetId]!));
  const medianEdge = edgeLengths.slice().sort((left, right) => left - right)[Math.floor(edgeLengths.length / 2)] ?? 0;
  const score = crossings * 1000000 + overlapPairs * 10000000 + spacingDeficit * 160 + Math.abs(medianEdge - 220) * 4;
  return { crossings, overlapPairs, minimumSeparation, spacingDeficit, score };
}

function relax(nodes: readonly FreeFormNode[], edges: readonly FreeFormEdge[], initial: Record<string, FreeFormPoint>, variant: number) {
  let positions = Object.fromEntries(Object.entries(initial).map(([id, point]) => [id, { ...point }])) as Record<string, FreeFormPoint>;
  let current = cheapMetrics(nodes, edges, positions);
  let iterations = 0;
  const orderedNodes = nodes.slice().sort((left, right) => compareId(left.id, right.id));
  const steps = [NODE_STEP * 2, NODE_STEP, NODE_STEP / 2];
  for (const step of steps) {
    for (let pass = 0; pass < MAX_ITERATIONS / steps.length; pass += 1) {
      let changed = false;
      for (const node of orderedNodes) {
        const base = positions[node.id]!;
        const proposals = [
          { x: base.x + step, y: base.y }, { x: base.x - step, y: base.y },
          { x: base.x, y: base.y + step }, { x: base.x, y: base.y - step },
          { x: base.x + step * 0.7, y: base.y + step * 0.7 }, { x: base.x - step * 0.7, y: base.y - step * 0.7 },
          { x: base.x + jitter(node.id, variant + pass, 2) * 0.35, y: base.y + jitter(node.id, variant + pass, 3) * 0.35 },
        ];
        let best = current;
        let bestPoint = base;
        for (const proposal of proposals) {
          const candidate = { ...positions, [node.id]: proposal };
          const metrics = cheapMetrics(nodes, edges, candidate);
          if (metrics.score < best.score - 1e-6) {
            best = metrics;
            bestPoint = proposal;
          }
        }
        if (bestPoint !== base) {
          positions[node.id] = bestPoint;
          current = best;
          changed = true;
        }
      }
      iterations += 1;
      if (!changed) break;
    }
  }
  return { positions, iterations, cheapMetrics: current };
}

/** Diagnostic-only bounded topology-aware free-form placement candidates. */
export function deriveTopologyAwareFreeFormCandidates(
  nodes: readonly FreeFormNode[],
  edges: readonly FreeFormEdge[],
  limit = 6,
): FreeFormCandidate[] {
  if (nodes.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const candidates: FreeFormCandidate[] = [];
  for (let variant = 0; variant < boundedLimit; variant += 1) {
    const { positions, topology } = seedPositions(nodes, edges, variant);
    const relaxed = relax(nodes, edges, positions, variant);
    candidates.push({
      family: `topology-free-form-bfs-relaxed-${variant + 1}`,
      positions: relaxed.positions,
      seed: variant % 2 === 0 ? "component-bfs-layered-jitter" : "component-bfs-transposed-jitter",
      iterations: relaxed.iterations,
      topology: {
        componentCount: topology.components.length,
        rootIds: topology.roots,
        layerCount: Math.max(...topology.layerCountByComponent),
        bridgeIds: topology.bridgeIds,
      },
      cheapMetrics: relaxed.cheapMetrics,
    });
  }
  return candidates.sort((left, right) => left.cheapMetrics.score - right.cheapMetrics.score || compareId(left.family, right.family));
}
