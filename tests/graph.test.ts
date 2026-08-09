import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityGraph, getEntityDetail, type Dataset } from "../src/dataset.ts";

test("A2: builds Entity nodes and Relation edges without making Relations nodes", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    events: [],
    relations: [{ id: "r", sourceId: "a", targetId: "b" }],
  };
  const graph = buildEntityGraph(dataset);
  assert.deepEqual(graph.nodes.map(({ id }) => id), ["a", "b"]);
  assert.deepEqual(graph.edges, [{ id: "r", sourceId: "a", targetId: "b" }]);
  assert.equal(graph.nodes.some(({ id }) => id === "r"), false);
});

test("A3/A8: omits Event endpoint edges from Entity graph and preserves direction", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity", name: "Entity" }],
    events: [{ id: "event", name: "Event" }],
    relations: [
      { id: "event-edge", sourceId: "event", targetId: "entity" },
      { id: "entity-edge", sourceId: "entity", targetId: "entity" },
    ],
  };
  const graph = buildEntityGraph(dataset);
  assert.deepEqual(graph.edges, [{ id: "entity-edge", sourceId: "entity", targetId: "entity" }]);
  assert.equal(graph.edges[0]?.sourceId, "entity");
  assert.equal(graph.edges[0]?.targetId, "entity");
});

test("A7: Entity Detail resolves the selected Entity and its Relations", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Apollo 11", description: "Mission" }],
    events: [],
    relations: [{ id: "relation-1", sourceId: "entity-1", targetId: "entity-1" }],
  };
  const detail = getEntityDetail(dataset, "entity-1");
  assert.equal(detail?.entity.name, "Apollo 11");
  assert.deepEqual(detail?.relationIds, ["relation-1"]);
  assert.equal(getEntityDetail(dataset, "missing"), null);
});
