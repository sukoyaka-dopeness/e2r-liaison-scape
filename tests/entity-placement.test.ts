import test from "node:test";
import assert from "node:assert/strict";
import { placeInitialEntities } from "../src/entity-placement.ts";
import { settleInitialPlacement } from "../src/auto-layout.ts";

const nodes = (ids: string[]) => ids.map((id) => ({ id, label: id, description: "", x: 0, y: 0 }));
const edge = (sourceId: string, targetId: string) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, parallelIndex: 0, parallelCount: 1 });

test("initial placement is ID-ordered, topology-seeded, and deterministic", () => {
  const graph = nodes(["zeta", "alpha", "beta"]);
  const edges = [edge("alpha", "beta")];
  const owned = { alpha: { x: 400, y: 200 } };
  const first = placeInitialEntities(graph, edges, owned);
  const second = placeInitialEntities(graph.slice().reverse(), edges, owned);
  assert.deepEqual(first.alpha, owned.alpha);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.beta, first.alpha);
  assert.notDeepEqual(first.zeta, first.alpha);
});

test("partial Owned placement never mutates input or moves existing positions", () => {
  const graph = nodes(["a", "b", "c"]);
  const stored = { a: { x: 100, y: 100 } };
  const snapshot = structuredClone(stored);
  const result = placeInitialEntities(graph, [], stored);
  assert.deepEqual(stored, snapshot);
  assert.deepEqual(result.a, stored.a);
  assert.notDeepEqual(result.b, result.c);
});

test("disconnected and long-label entities receive finite non-overlapping positions", () => {
  const graph = nodes(["one", "two", "three"]).map((node, index) => ({ ...node, label: index === 0 ? "A very long entity label" : node.label, description: index === 0 ? "A description" : "" }));
  const result = placeInitialEntities(graph, [], {});
  for (const point of Object.values(result)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  assert.ok(new Set(Object.values(result).map(point => `${point.x},${point.y}`)).size === 3);
});

test("bounded initial settling is deterministic and non-grid for coordinate-less graphs", () => {
  const graph = nodes(["a", "b", "c", "d"]);
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
  const input = { entities: graph.map(({ id }) => ({ id })), relations: edges };
  const first = settleInitialPlacement(input);
  const second = settleInitialPlacement({ ...input, entities: [...input.entities].reverse() });
  assert.deepEqual(first, second);
  assert.equal(new Set(Object.values(first).map((point) => `${point.x},${point.y}`)).size, 4);
  assert.ok(Object.values(first).some((point) => point.x % 1 !== 0 || point.y % 1 !== 0));
});
