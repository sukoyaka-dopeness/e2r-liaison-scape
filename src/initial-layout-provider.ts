import {
  INITIAL_PLACEMENT_SETTLING_ITERATIONS,
  solveAutoLayout,
  type LayoutPoint,
} from "./auto-layout.ts";

export type InitialLayoutProviderEntity = {
  id: string;
  label: string;
  description?: string;
};

export type InitialLayoutProviderRelation = {
  id: string;
  sourceId: string;
  targetId: string;
};

export type BoundedInitialLayoutInput = {
  entities: readonly InitialLayoutProviderEntity[];
  relations: readonly InitialLayoutProviderRelation[];
  locale?: string;
  budgetMs?: number;
  maxIterations?: number;
};

export type InitialLayoutProviderResult = {
  positions: Record<string, LayoutPoint>;
  provider: "post-structural-relaxation-v1-prototype" | "current-fallback";
  status: "prototype" | "fallback";
  reason: "completed" | "invalid-input" | "budget-exceeded" | "unsafe-candidate";
  iterations: number;
  elapsedMs: number;
};

const BODY_CLEARANCE = 76;
const BODY_HALF_SIZE = 32;
const DEFAULT_BUDGET_MS = 100;
const DEFAULT_MAX_ITERATIONS = 2;
const DIRECTIONS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
];

function finitePositions(positions: Record<string, LayoutPoint>, ids: readonly string[]): boolean {
  return ids.every((id) => Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y));
}

function bodySafe(positions: Record<string, LayoutPoint>, ids: readonly string[]): boolean {
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const left = positions[ids[leftIndex]!]!;
      const right = positions[ids[rightIndex]!]!;
      if (Math.abs(left.x - right.x) < BODY_CLEARANCE && Math.abs(left.y - right.y) < BODY_CLEARANCE) return false;
    }
  }
  return true;
}

function labelWidth(entity: InitialLayoutProviderEntity): number {
  return Math.max(48, Math.min(180, Array.from(entity.label).length * 6.5 + 12));
}

function labelHeight(entity: InitialLayoutProviderEntity): number {
  return entity.description?.trim() ? 48 : 20;
}

function labelOverlapPenalty(positions: Record<string, LayoutPoint>, entities: readonly InitialLayoutProviderEntity[]): number {
  let penalty = 0;
  for (let leftIndex = 0; leftIndex < entities.length; leftIndex += 1) {
    const leftEntity = entities[leftIndex]!;
    const left = positions[leftEntity.id]!;
    const leftRect = { left: left.x - labelWidth(leftEntity) / 2, right: left.x + labelWidth(leftEntity) / 2, top: left.y + BODY_HALF_SIZE, bottom: left.y + BODY_HALF_SIZE + labelHeight(leftEntity) };
    for (let rightIndex = leftIndex + 1; rightIndex < entities.length; rightIndex += 1) {
      const rightEntity = entities[rightIndex]!;
      const right = positions[rightEntity.id]!;
      const rightRect = { left: right.x - labelWidth(rightEntity) / 2, right: right.x + labelWidth(rightEntity) / 2, top: right.y + BODY_HALF_SIZE, bottom: right.y + BODY_HALF_SIZE + labelHeight(rightEntity) };
      if (leftRect.left < rightRect.right && leftRect.right > rightRect.left && leftRect.top < rightRect.bottom && leftRect.bottom > rightRect.top) penalty += 1;
    }
  }
  return penalty;
}

function span(positions: Record<string, LayoutPoint>, ids: readonly string[]): number {
  const points = ids.map((id) => positions[id]!);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
}

function score(positions: Record<string, LayoutPoint>, entities: readonly InitialLayoutProviderEntity[]): number {
  return span(positions, entities.map((entity) => entity.id)) + labelOverlapPenalty(positions, entities) * 400;
}

function fallback(input: BoundedInitialLayoutInput, reason: InitialLayoutProviderResult["reason"], startedAt: number): InitialLayoutProviderResult {
  const positions = solveAutoLayout({ entities: input.entities.map(({ id }) => ({ id })), relations: input.relations }, { iterations: INITIAL_PLACEMENT_SETTLING_ITERATIONS });
  return { positions, provider: "current-fallback", status: "fallback", reason, iterations: 0, elapsedMs: performance.now() - startedAt };
}

/**
 * Opt-in runtime-provider prototype. It is deliberately not wired into App.
 * It uses only Node/label envelopes and always returns the current Product
 * placement if its bounded, presentation-independent candidate is unsafe or
 * exceeds the budget.
 */
export function deriveBoundedInitialLayout(input: BoundedInitialLayoutInput): InitialLayoutProviderResult {
  const startedAt = performance.now();
  const entities = [...input.entities].sort((left, right) => left.id.localeCompare(right.id));
  const ids = entities.map(({ id }) => id);
  const uniqueIds = new Set(ids);
  const budgetMs = Math.max(1, input.budgetMs ?? DEFAULT_BUDGET_MS);
  const maxIterations = Math.max(0, Math.floor(input.maxIterations ?? DEFAULT_MAX_ITERATIONS));
  if (ids.length === 0 || uniqueIds.size !== ids.length || input.relations.some((relation) => !uniqueIds.has(relation.sourceId) || !uniqueIds.has(relation.targetId))) return fallback(input, "invalid-input", startedAt);
  let positions = solveAutoLayout({ entities: ids.map((id) => ({ id })), relations: input.relations }, { iterations: INITIAL_PLACEMENT_SETTLING_ITERATIONS });
  if (!finitePositions(positions, ids) || !bodySafe(positions, ids)) return fallback(input, "unsafe-candidate", startedAt);
  let iterations = 0;
  let currentScore = score(positions, entities);
  for (; iterations < maxIterations; iterations += 1) {
    for (const entity of entities) {
      for (const direction of DIRECTIONS) {
        if (performance.now() - startedAt > budgetMs) return fallback(input, "budget-exceeded", startedAt);
        const candidate = { ...positions, [entity.id]: { x: positions[entity.id]!.x + direction.x * 6, y: positions[entity.id]!.y + direction.y * 6 } };
        if (!bodySafe(candidate, ids)) continue;
        const candidateScore = score(candidate, entities);
        if (candidateScore < currentScore) { positions = candidate; currentScore = candidateScore; }
      }
    }
  }
  if (!finitePositions(positions, ids) || !bodySafe(positions, ids)) return fallback(input, "unsafe-candidate", startedAt);
  return { positions, provider: "post-structural-relaxation-v1-prototype", status: "prototype", reason: "completed", iterations, elapsedMs: performance.now() - startedAt };
}
