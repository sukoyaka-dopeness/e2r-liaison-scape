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
