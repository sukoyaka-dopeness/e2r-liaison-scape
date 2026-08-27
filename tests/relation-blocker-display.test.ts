import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationBlockerDisplays } from "../src/related-relation-display.ts";
import type { Dataset } from "../src/models.ts";

function datasetWith(objects: Dataset["entities"], events: Dataset["events"], relations: Dataset["relations"]): Dataset {
  return { version: "1.0", entities: objects, events, relations };
}

test("builds one blocker display for a self Relation", () => {
  const relation = { id: "self-relation", sourceId: "entity-a", targetId: "entity-a", name: "depends on" };
  const displays = buildRelationBlockerDisplays(
    datasetWith([{ id: "entity-a", name: "A" }], [], [relation]),
    [relation],
  );

  assert.equal(displays.size, 1);
  assert.deepEqual(displays.get(relation.id), {
    relationName: "depends on",
    source: "A",
    target: "A",
    relationId: relation.id,
    hiddenFromGraph: false,
  });
});

test("keeps parallel blockers distinct with an unambiguous ID hint", () => {
  const first = { id: "relation-alpha", sourceId: "entity-a", targetId: "entity-b", name: "connected" };
  const second = { id: "relation-beta", sourceId: "entity-a", targetId: "entity-b", name: "connected" };
  const displays = buildRelationBlockerDisplays(
    datasetWith([{ id: "entity-a", name: "A" }, { id: "entity-b", name: "B" }], [], [first, second]),
    [first, second],
  );

  assert.equal(displays.size, 2);
  assert.equal(displays.get(first.id)?.relationIdHint, "relation-a");
  assert.equal(displays.get(second.id)?.relationIdHint, "relation-b");
  assert.notEqual(displays.get(first.id)?.relationIdHint, displays.get(second.id)?.relationIdHint);
});

test("marks Event-connected blockers as present in the Dataset but hidden from the graph", () => {
  const relation = { id: "event-relation", sourceId: "event-1", targetId: "entity-a", name: "caused by" };
  const displays = buildRelationBlockerDisplays(
    datasetWith([{ id: "entity-a", name: "A" }], [{ id: "event-1", name: "An event" }], [relation]),
    [relation],
  );

  assert.equal(displays.get(relation.id)?.source, "An event");
  assert.equal(displays.get(relation.id)?.target, "A");
  assert.equal(displays.get(relation.id)?.hiddenFromGraph, true);
});
