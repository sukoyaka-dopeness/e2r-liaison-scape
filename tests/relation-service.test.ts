import { test } from "node:test";
import assert from "node:assert/strict";
import { updateRelation } from "../src/services/RelationService.ts";
import type { Dataset } from "../src/models";

function fixture(): Dataset {
  return {
    version: "1.0",
    entities: [{ id: "a" }, { id: "b" }, { id: "c" }],
    events: [{ id: "event-1" }, { id: "event-2" }],
    relations: [{
      id: "relation-1",
      sourceId: "a",
      targetId: "b",
      name: "Before",
      description: "Original",
      futureField: { keep: true },
      extensions: { opaque: { keep: true } },
    }],
    extensions: { datasetOpaque: { keep: true } },
  } as Dataset;
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: "a",
    targetId: "b",
    name: "Before",
    description: "Original",
    ...overrides,
  };
}

function updated(result: ReturnType<typeof updateRelation>): Dataset {
  assert.ok("dataset" in result && !("refusal" in result));
  return result.dataset;
}

test("updateRelation changes source, target, or both while preserving Relation identity", () => {
  const dataset = fixture();
  const result = updateRelation(dataset, "relation-1", draft({ sourceId: "b", targetId: "c" }));
  const relation = updated(result).relations[0]!;
  assert.equal(relation.id, "relation-1");
  assert.equal(relation.sourceId, "b");
  assert.equal(relation.targetId, "c");
});

test("updateRelation permits self and parallel endpoint transitions", () => {
  const dataset = fixture();
  const self = updated(updateRelation(dataset, "relation-1", draft({ targetId: "a" })));
  assert.deepEqual(self.relations[0] && [self.relations[0].sourceId, self.relations[0].targetId], ["a", "a"]);
  dataset.relations.push({ id: "existing-parallel", sourceId: "a", targetId: "c" });
  const parallel = updated(updateRelation(dataset, "relation-1", draft({ targetId: "c" })));
  assert.deepEqual(parallel.relations[0] && [parallel.relations[0].sourceId, parallel.relations[0].targetId], ["a", "c"]);
  assert.deepEqual(parallel.relations.map(({ sourceId, targetId }) => [sourceId, targetId]), [["a", "c"], ["a", "c"]]);
});

test("updateRelation preserves opaque fields and data when changing endpoints", () => {
  const dataset = fixture();
  const result = updated(updateRelation(dataset, "relation-1", draft({ sourceId: "b" })));
  assert.deepEqual(result.relations[0], {
    id: "relation-1", sourceId: "b", targetId: "b", name: "Before", description: "Original",
    futureField: { keep: true }, extensions: { opaque: { keep: true } },
  });
  assert.deepEqual(result.extensions, dataset.extensions);
});

test("updateRelation returns the original Dataset reference for a no-op", () => {
  const dataset = fixture();
  const result = updateRelation(dataset, "relation-1", draft());
  assert.equal(updated(result), dataset);
});

test("Event endpoints can remain unchanged while name and description are edited", () => {
  const dataset = fixture();
  dataset.relations[0]!.sourceId = "event-1";
  const result = updated(updateRelation(dataset, "relation-1", draft({ sourceId: "event-1", name: "Renamed", description: "Updated" })));
  assert.equal(result.relations[0]?.sourceId, "event-1");
  assert.equal(result.relations[0]?.name, "Renamed");
  assert.equal(result.relations[0]?.description, "Updated");
});

test("changing an Event endpoint to an Entity is allowed", () => {
  const dataset = fixture();
  dataset.relations[0]!.sourceId = "event-1";
  const result = updated(updateRelation(dataset, "relation-1", draft({ sourceId: "c" })));
  assert.equal(result.relations[0]?.sourceId, "c");
});

test("changing an endpoint to an Event is refused", () => {
  const dataset = fixture();
  for (const changes of [{ sourceId: "event-1" }, { targetId: "event-1" }]) {
    const result = updateRelation(dataset, "relation-1", draft(changes));
    assert.deepEqual(result, { dataset, refusal: changes.sourceId ? "relation_source_entity_required" : "relation_target_entity_required" });
  }
});

test("changing an Event endpoint to another Event is refused", () => {
  const dataset = fixture();
  dataset.relations[0]!.sourceId = "event-1";
  dataset.relations[0]!.targetId = "event-2";
  const sourceChange = updateRelation(dataset, "relation-1", draft({ sourceId: "event-2", targetId: "event-2" }));
  assert.deepEqual(sourceChange, { dataset, refusal: "relation_source_entity_required" });
  const targetChange = updateRelation(dataset, "relation-1", draft({ sourceId: "event-1", targetId: "event-1" }));
  assert.deepEqual(targetChange, { dataset, refusal: "relation_target_entity_required" });
});

test("missing Relation or changed Entity endpoints are refused without mutation", () => {
  const dataset = fixture();
  for (const [relationId, changes, refusal] of [
    ["missing", draft(), "relation_not_found"],
    ["relation-1", draft({ sourceId: "gone" }), "relation_source_entity_required"],
    ["relation-1", draft({ targetId: "gone" }), "relation_target_entity_required"],
  ] as const) {
    const before = structuredClone(dataset);
    const result = updateRelation(dataset, relationId, changes);
    assert.deepEqual(result, { dataset, refusal });
    assert.equal(result.dataset, dataset);
    assert.deepEqual(dataset, before);
  }
});

test("updateRelation rejects atomically when a later endpoint change is invalid", () => {
  const dataset = fixture();
  const before = structuredClone(dataset);
  const result = updateRelation(dataset, "relation-1", {
    sourceId: "c",
    targetId: "gone",
    name: "Changed",
    description: "Changed",
  });
  assert.deepEqual(result, { dataset, refusal: "relation_target_entity_required" });
  assert.equal(result.dataset, dataset);
  assert.deepEqual(dataset, before);
});

test("empty endpoints and Relation IDs are refused without mutation", () => {
  const dataset = fixture();
  for (const [changes, refusal] of [
    [draft({ sourceId: "" }), "relation_source_entity_required"],
    [draft({ targetId: "" }), "relation_target_entity_required"],
    [draft({ sourceId: "relation-1" }), "relation_source_entity_required"],
    [draft({ targetId: "relation-1" }), "relation_target_entity_required"],
  ] as const) {
    const before = structuredClone(dataset);
    const result = updateRelation(dataset, "relation-1", changes);
    assert.deepEqual(result, { dataset, refusal });
    assert.equal(result.dataset, dataset);
    assert.deepEqual(dataset, before);
  }
});

test("updateRelation preserves Coordinate data", () => {
  const dataset = fixture();
  dataset.entities[0]!.extensions = { coordinate: { positions: [{ spaceId: "graph", x: 10, y: 20 }] } };
  dataset.relations[0]!.extensions = {
    coordinate: { values: { x: 1, y: 2 } },
    opaque: { keep: true },
  };
  const expectedEntityCoordinates = structuredClone(dataset.entities[0]!.extensions);
  const expectedRelationCoordinates = structuredClone(dataset.relations[0]!.extensions);
  const result = updated(updateRelation(dataset, "relation-1", draft({ targetId: "c" })));
  assert.deepEqual(result.entities[0]!.extensions, expectedEntityCoordinates);
  assert.deepEqual(result.relations[0]!.extensions, expectedRelationCoordinates);
});

test("an old but still-valid endpoint is not treated as stale by the domain", () => {
  const dataset = fixture();
  dataset.relations[0]!.targetId = "c";
  const result = updated(updateRelation(dataset, "relation-1", draft({ targetId: "b" })));
  assert.equal(result.relations[0]?.targetId, "b");
});
