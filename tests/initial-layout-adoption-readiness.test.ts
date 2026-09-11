import test from "node:test";
import assert from "node:assert/strict";
import { deriveBoundedInitialLayout } from "../src/initial-layout-provider.ts";

type Entity = { id: string; label: string; description?: string };
type Relation = { id: string; sourceId: string; targetId: string; label?: string };

function entities(count: number): Entity[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    label: index % 3 === 0 ? `Node ${index} with a longer label` : `Node ${index}`,
    description: index % 5 === 0 ? "description" : undefined,
  }));
}

function graph(count: number, relationFactory: (index: number) => Relation[]): { entities: Entity[]; relations: Relation[] } {
  return { entities: entities(count), relations: Array.from({ length: count }, (_, index) => relationFactory(index)).flat() };
}

const cases = [
  ["sparse", graph(12, (index) => index < 5 ? [{ id: `r${index}`, sourceId: `n${index}`, targetId: `n${index + 1}` }] : [])],
  ["chain", graph(30, (index) => index < 29 ? [{ id: `r${index}`, sourceId: `n${index}`, targetId: `n${index + 1}` }] : [])],
  ["hub", graph(30, (index) => index < 29 ? [{ id: `r${index}`, sourceId: "n0", targetId: `n${index + 1}` }] : [])],
  ["parallel", graph(16, (index) => index < 12 ? [{ id: `r${index}`, sourceId: "n0", targetId: "n1", label: `Parallel relation ${index}` }] : [])],
  ["disconnected", graph(32, (index) => index % 8 < 7 ? [{ id: `r${index}`, sourceId: `n${index}`, targetId: `n${index + 1}` }] : [])],
  ["dense", graph(36, (index) => Array.from({ length: 6 }, (_, offset) => ({ id: `r${index}-${offset}`, sourceId: `n${index}`, targetId: `n${(index + offset + 1) % 36}` })) )],
  ["self-loop", graph(20, (index) => [{ id: `loop${index}`, sourceId: `n${index}`, targetId: `n${index}` }, ...(index < 19 ? [{ id: `edge${index}`, sourceId: `n${index}`, targetId: `n${index + 1}` }] : [])])],
] as const;

function assertComplete(result: ReturnType<typeof deriveBoundedInitialLayout>, expectedIds: string[]) {
  assert.deepEqual(Object.keys(result.positions).sort(), expectedIds);
  for (const id of expectedIds) {
    assert.ok(Number.isFinite(result.positions[id]?.x));
    assert.ok(Number.isFinite(result.positions[id]?.y));
  }
  for (let left = 0; left < expectedIds.length; left += 1) {
    for (let right = left + 1; right < expectedIds.length; right += 1) {
      const first = result.positions[expectedIds[left]!]!;
      const second = result.positions[expectedIds[right]!]!;
      if (result.status === "prototype") assert.ok(Math.abs(first.x - second.x) >= 76 || Math.abs(first.y - second.y) >= 76);
    }
  }
  assert.equal(result.ownership, "derived");
  assert.ok(result.status === "prototype" || result.status === "fallback");
  if (result.status === "fallback") assert.equal(result.provider, "current-fallback");
}

test("coarse provider remains complete, safe, deterministic, and bounded across representative topologies", () => {
  for (const [, input] of cases) {
    const first = deriveBoundedInitialLayout({ ...input, strategy: "coarse-objective-prototype-v1", budgetMs: 100, maxIterations: 2 });
    const second = deriveBoundedInitialLayout({ ...input, entities: [...input.entities].reverse(), relations: [...input.relations].reverse(), strategy: "coarse-objective-prototype-v1", budgetMs: 100, maxIterations: 2 });
    assertComplete(first, input.entities.map(({ id }) => id).sort());
    assertComplete(second, input.entities.map(({ id }) => id).sort());
    if (first.status === "prototype" && second.status === "prototype") assert.deepEqual(first.positions, second.positions);
    assert.ok(first.elapsedMs < 1000);
  }
});

test("coarse provider uses safe whole-result fallback under a tight budget on a dense graph", () => {
  const [, input] = cases.find(([name]) => name === "dense")!;
  const result = deriveBoundedInitialLayout({ ...input, strategy: "coarse-objective-prototype-v1", budgetMs: 1, maxIterations: 100 });
  assertComplete(result, input.entities.map(({ id }) => id).sort());
  assert.equal(result.status, "fallback");
  assert.ok(result.reason === "budget-exceeded" || result.reason === "unsafe-candidate");
});

test("self-loops do not influence the coarse provider's ordinary placement", () => {
  const input = graph(12, (index) => index < 11 ? [{ id: `edge${index}`, sourceId: `n${index}`, targetId: `n${index + 1}` }] : []);
  const withLoops = { ...input, relations: [...input.relations, ...input.entities.map(({ id }) => ({ id: `loop-${id}`, sourceId: id, targetId: id }))] };
  const withoutLoops = deriveBoundedInitialLayout({ ...input, strategy: "coarse-objective-prototype-v1" });
  const loopResult = deriveBoundedInitialLayout({ ...withLoops, strategy: "coarse-objective-prototype-v1" });
  assert.deepEqual(loopResult.positions, withoutLoops.positions);
});
