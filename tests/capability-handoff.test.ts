import assert from "node:assert/strict";
import test from "node:test";
import { resolveRelationTarget } from "../src/capability-handoff.ts";
import type { Dataset } from "../src/models.ts";

const dataset: Dataset = {
  version: "1.0",
  entities: [{ id: "entity-1", name: "Same name" }, { id: "entity-2", name: "Same name" }],
  events: [{ id: "event-1", name: "Event" }],
  relations: [
    { id: "relation-1", sourceId: "entity-1", targetId: "entity-2", name: "Same name" },
    { id: "relation-2", sourceId: "event-1", targetId: "entity-1", name: "Hidden relation" },
  ],
  extensions: { "example.unknown": { preserved: true } },
};

test("resolves the exact canonical Relation ID, including graph-hidden Relations", () => {
  assert.equal(resolveRelationTarget(dataset, "relation-1", "Relation").kind, "resolved");
  const hidden = resolveRelationTarget(dataset, "relation-2");
  assert.equal(hidden.kind, "resolved");
  if (hidden.kind === "resolved") assert.equal(hidden.relation.id, "relation-2");
});

test("refuses missing and type-mismatched targets without selecting a substitute", () => {
  assert.deepEqual(resolveRelationTarget(dataset, "missing-relation", "Relation"), { kind: "target-not-found" });
  assert.deepEqual(resolveRelationTarget(dataset, "entity-1", "Relation"), { kind: "target-type-mismatch", actualType: "Entity" });
  assert.deepEqual(resolveRelationTarget(dataset, "relation-1", "Event"), { kind: "target-type-mismatch", actualType: "Relation" });
  assert.equal(dataset.relations.length, 2);
  assert.deepEqual(dataset.extensions, { "example.unknown": { preserved: true } });
});
