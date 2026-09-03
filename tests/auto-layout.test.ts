import assert from "node:assert/strict";
import test from "node:test";
import { solveAutoLayout } from "../src/auto-layout.ts";

const entities = (ids: string[]) => ids.map((id) => ({ id }));
test("is deterministic and ignores relation order, parallels, self-relations, and non-entity edges", () => {
  const input = { entities: entities(["hub", "a", "b"]), relations: [
    { id: "self", sourceId: "hub", targetId: "hub" }, { id: "p2", sourceId: "hub", targetId: "b" },
    { id: "p1", sourceId: "hub", targetId: "b" }, { id: "ab", sourceId: "a", targetId: "b" },
    { id: "hidden", sourceId: "event", targetId: "a" },
  ] };
  assert.deepEqual(solveAutoLayout(input), solveAutoLayout({ ...input, relations: [...input.relations].reverse() }));
  assert.deepEqual(solveAutoLayout(input), solveAutoLayout({ ...input, relations: input.relations.filter((relation) => relation.id !== "p2" && relation.id !== "self") }));
});

test("places the highest distinct-neighbor degree entity at the component seed", () => {
  const result = solveAutoLayout({ entities: entities(["z", "hub", "a", "b"]), relations: [
    { id: "1", sourceId: "hub", targetId: "a" }, { id: "2", sourceId: "hub", targetId: "b" },
  ] }, { iterations: 0 });
  assert.deepEqual(result.hub, { x: 160, y: 160 });
});

test("packs disconnected components without overlap", () => {
  const result = solveAutoLayout({ entities: entities(["a", "b", "c", "d"]), relations: [
    { id: "1", sourceId: "a", targetId: "b" }, { id: "2", sourceId: "c", targetId: "d" },
  ] }, { iterations: 0 });
  assert.ok(Math.min(...["a", "b"].map((a) => result[a].x)) < Math.min(...["c", "d"].map((a) => result[a].x)));
});

test("keeps the minimized relation-order witness exactly invariant", () => {
  const input = {
    entities: entities(["a", "b", "c", "d", "e"]),
    relations: [
      { id: "bc", sourceId: "b", targetId: "c" },
      { id: "bd", sourceId: "b", targetId: "d" },
      { id: "be", sourceId: "b", targetId: "e" },
    ],
  };
  const ordered = solveAutoLayout(input, { iterations: 3 });
  for (const relations of [
    [input.relations[2], input.relations[1], input.relations[0]],
    [input.relations[1], input.relations[2], input.relations[0]],
    [input.relations[0], input.relations[2], input.relations[1]],
  ]) {
    assert.deepEqual(solveAutoLayout({ ...input, relations }, { iterations: 3 }), ordered);
  }
});

test("uses deterministic Unicode code-point ordering for IDs", () => {
  const result = solveAutoLayout({
    entities: entities(["😀", "日", "é", "aa", "a"]),
    relations: [],
  }, { iterations: 0 });
  assert.deepEqual(Object.keys(result), ["a", "aa", "é", "日", "😀"]);
  assert.deepEqual(Object.values(result).map(({ x }) => x), [160, 464, 768, 1072, 1376]);
});

test("preserves duplicate, parallel, self, and invalid endpoint semantics", () => {
  const input = {
    entities: entities(["a", "b", "c"]),
    relations: [
      { id: "ab-first", sourceId: "a", targetId: "b" },
      { id: "ba-duplicate", sourceId: "b", targetId: "a" },
      { id: "ab-parallel", sourceId: "a", targetId: "b" },
      { id: "self", sourceId: "a", targetId: "a" },
      { id: "invalid", sourceId: "missing", targetId: "c" },
    ],
  };
  const singlePair = {
    entities: input.entities,
    relations: [{ id: "only", sourceId: "a", targetId: "b" }],
  };
  assert.deepEqual(solveAutoLayout(input), solveAutoLayout(singlePair));
  assert.deepEqual(
    solveAutoLayout({ ...input, relations: [...input.relations].reverse() }),
    solveAutoLayout(input),
  );
});
