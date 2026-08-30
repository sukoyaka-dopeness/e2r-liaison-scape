export type LayoutPoint = { x: number; y: number };
export type LayoutEntity = { id: string };
export type LayoutRelation = { id: string; sourceId: string; targetId: string };
export type AutoLayoutInput = { entities: readonly LayoutEntity[]; relations: readonly LayoutRelation[] };
export type AutoLayoutOptions = {
  nodeClearance?: number;
  componentGap?: number;
  iterations?: number;
};

const DEFAULT_CLEARANCE = 96;
const DEFAULT_COMPONENT_GAP = 144;
const DEFAULT_ITERATIONS = 12;

function compareId(a: string, b: string): number { return a.localeCompare(b); }
function key(a: string, b: string): string { return compareId(a, b) < 0 ? `${a}\0${b}` : `${b}\0${a}`; }

/** Pure, deterministic EXP-1A placement. It does not mutate its input or Dataset data. */
export function solveAutoLayout(input: AutoLayoutInput, options: AutoLayoutOptions = {}): Record<string, LayoutPoint> {
  const clearance = Math.max(1, options.nodeClearance ?? DEFAULT_CLEARANCE);
  const gap = Math.max(clearance, options.componentGap ?? DEFAULT_COMPONENT_GAP);
  const iterations = Math.max(0, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
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

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const start of ids) {
    if (visited.has(start)) continue;
    const component: string[] = []; const queue = [start]; visited.add(start);
    while (queue.length) {
      const current = queue.shift()!; component.push(current);
      for (const next of [...(adjacency.get(current) ?? [])].sort(compareId)) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    components.push(component.sort(compareId));
  }

  const result: Record<string, LayoutPoint> = {};
  let componentLeft = 0;
  for (const component of components) {
    const ranked = component.slice().sort((a, b) => (adjacency.get(b)!.size - adjacency.get(a)!.size) || compareId(a, b));
    const center = { x: componentLeft + 160, y: 160 };
    const points: Record<string, LayoutPoint> = {};
    ranked.forEach((id, index) => {
      if (index === 0) points[id] = { ...center };
      else { const angle = ((index - 1) % 8) * Math.PI / 4; const ring = Math.floor((index - 1) / 8) + 1;
        points[id] = { x: center.x + Math.cos(angle) * clearance * 1.8 * ring, y: center.y + Math.sin(angle) * clearance * 1.8 * ring }; }
    });
    for (let step = 0; step < iterations; step += 1) {
      for (const id of component) {
        let dx = 0; let dy = 0;
        for (const other of component) if (other !== id) {
          const deltaX = points[id].x - points[other].x; const deltaY = points[id].y - points[other].y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          if (distance < clearance) { const push = (clearance - distance) / distance; dx += deltaX * push * 0.25; dy += deltaY * push * 0.25; }
        }
        for (const neighbor of adjacency.get(id) ?? []) { dx += (points[neighbor].x - points[id].x) * 0.018; dy += (points[neighbor].y - points[id].y) * 0.018; }
        points[id] = { x: points[id].x + Math.max(-18, Math.min(18, dx)), y: points[id].y + Math.max(-18, Math.min(18, dy)) };
      }
    }
    const maxX = Math.max(...Object.values(points).map((point) => point.x), center.x);
    for (const id of component) result[id] = { x: points[id].x, y: points[id].y };
    componentLeft = maxX + gap;
  }
  return result;
}

