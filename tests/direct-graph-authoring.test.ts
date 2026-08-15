import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity, createRelation } from "../src/dataset.ts";
import {
  graphPointFromPointer,
  graphPointFromViewportCenter,
  isLongPress,
  canCompleteLongPress,
  placeTemporaryEntity,
  resolveRelationDrop,
  createCanvasContextMenu,
  dismissContextMenu,
  shouldSuppressNativeContextMenu,
  type GraphPoint,
} from "../src/direct-graph-authoring.ts";
import type { Dataset } from "../src/models";

function dataset(): Dataset {
  return {
    version: "1.0",
    entities: [{ id: "a" }, { id: "b" }],
    events: [],
    relations: [],
  };
}

test("graphPointFromPointer maps a canvas pointer to graph coordinates", () => {
  assert.deepEqual(
    graphPointFromPointer(
      { clientX: 250, clientY: 140 },
      { left: 100, top: 40, width: 800, height: 500 },
      { width: 800, height: 500 },
      2,
      { x: 20, y: 10 },
    ),
    { x: 265, y: 170 },
  );
});

test("viewport center maps to graph center at the identity transform", () => {
  assert.deepEqual(graphPointFromViewportCenter({ width: 800, height: 500 }, 1, { x: 0, y: 0 }), { x: 400, y: 250 });
});

test("viewport center follows pan and scale through the inverse transform", () => {
  assert.deepEqual(graphPointFromViewportCenter({ width: 800, height: 500 }, 2, { x: 40, y: -20 }), { x: 380, y: 260 });
});

test("creating from a pointer places the new Entity temporarily without Dataset mutation", () => {
  const source = dataset();
  const created = createEntity(source, { name: "New" });
  const point: GraphPoint = { x: 120, y: 80 };
  const positions = placeTemporaryEntity({}, created.entityId!, point);
  assert.deepEqual(positions, { [created.entityId!]: point });
  assert.deepEqual(source, dataset());
  assert.equal(source.extensions, undefined);
  assert.equal(created.dataset.entities.length, 3);
  assert.equal(created.dataset.entities.at(-1)?.extensions, undefined);
});

test("canceling a pending temporary placement leaves prior positions unchanged", () => {
  const positions = { a: { x: 1, y: 2 } };
  assert.deepEqual(placeTemporaryEntity(positions, "pending", null), positions);
  assert.deepEqual(positions, { a: { x: 1, y: 2 } });
});

test("canvas context menu preserves the graph position and can be dismissed", () => {
  const point: GraphPoint = { x: 120, y: 80 };
  const menu = createCanvasContextMenu(point);
  assert.deepEqual(menu, { kind: "canvas", point });
  assert.equal(dismissContextMenu(menu), null);
});

test("application-owned canvas context menu suppresses the native menu only for the claimed gesture", () => {
  assert.equal(shouldSuppressNativeContextMenu(true), true);
  assert.equal(shouldSuppressNativeContextMenu(false), false);
});

test("context-menu Entity creation keeps placement temporary until explicit coordinate save", () => {
  const source = dataset();
  const before = structuredClone(source);
  const created = createEntity(source, { name: "At pointer" }, () => "entity-pointer");
  const positions = placeTemporaryEntity({}, created.entityId, { x: 120, y: 80 });
  assert.deepEqual(source, before);
  assert.deepEqual(created.dataset.extensions, undefined);
  assert.deepEqual(positions, { "entity-pointer": { x: 120, y: 80 } });
  assert.deepEqual(placeTemporaryEntity(positions, created.entityId, null), positions);
});

test("long-press requires duration and stays within movement tolerance", () => {
  assert.equal(isLongPress(500, 8), true);
  assert.equal(isLongPress(499, 0), false);
  assert.equal(isLongPress(500, 8.1), false);
});

test("long-press completion is canceled by pointer cancellation or a second pointer", () => {
  assert.equal(canCompleteLongPress(true, false), true);
  assert.equal(canCompleteLongPress(true, true), false);
  assert.equal(canCompleteLongPress(false, false), false);
});

test("relation drop resolves Entity targets, including self, and rejects invalid drops", () => {
  const entities = new Set(["a", "b"]);
  assert.deepEqual(resolveRelationDrop("a", "b", entities), { sourceId: "a", targetId: "b" });
  assert.deepEqual(resolveRelationDrop("a", "a", entities), { sourceId: "a", targetId: "a" });
  assert.equal(resolveRelationDrop("missing", "b", entities), null);
  assert.equal(resolveRelationDrop("a", null, entities), null);
  assert.equal(resolveRelationDrop("a", "missing", entities), null);
});

test("successful relation drops reuse createRelation and permit parallel Relations", () => {
  const source = dataset();
  const first = createRelation(source, { sourceId: "a", targetId: "b" }, () => "r1");
  assert.equal("refusal" in first, false);
  const second = createRelation(first.dataset, { sourceId: "a", targetId: "b" }, () => "r2");
  assert.equal("refusal" in second, false);
  assert.deepEqual(second.dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })), [
    { id: "r1", sourceId: "a", targetId: "b" },
    { id: "r2", sourceId: "a", targetId: "b" },
  ]);
});
