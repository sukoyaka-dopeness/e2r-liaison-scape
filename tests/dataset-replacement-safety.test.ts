import assert from "node:assert/strict";
import test from "node:test";
import { applyEntityCreationPlacement, deriveReplacementSafetyState, hasPendingUserWork, isDatasetModified, preservePendingCoordinates, resetManualRelationRoute } from "../src/dataset-replacement-safety.ts";

const baseline = { version: "1.0", entities: [{ id: "entity-1", name: "Original" }], events: [], relations: [] };

test("datasetModified uses Dataset content equality and clears after a true revert", () => {
  const equalCopy = { relations: [], events: [], entities: [{ name: "Original", id: "entity-1" }], version: "1.0" };
  const edited = { ...baseline, entities: [{ id: "entity-1", name: "Edited" }] };
  assert.equal(isDatasetModified(baseline, equalCopy), false);
  assert.equal(isDatasetModified(baseline, edited), true);
  assert.equal(isDatasetModified(baseline, { ...baseline, entities: [{ id: "entity-1", name: "Original" }] }), false);
});

test("replacement safety keeps Dataset, pending work, and recoverability independent", () => {
  for (const [currentDataset, pendingUserWork, replacementCase] of [
    [baseline, false, "clean"],
    [{ ...baseline, entities: [{ id: "entity-1", name: "Edited" }] }, false, "modified-only"],
    [baseline, true, "pending-only"],
    [{ ...baseline, entities: [{ id: "entity-1", name: "Edited" }] }, true, "modified-and-pending"],
  ] as const) {
    const state = deriveReplacementSafetyState({ cleanBaseline: baseline, currentDataset, pendingUserWork, recoverableSessionState: true });
    assert.equal(state.replacementCase, replacementCase);
    assert.equal(state.replacementConfirmationRequired, replacementCase !== "clean");
    assert.equal(state.recoverableSessionState, true);
  }
});

test("each user-owned pending source is independently meaningful", () => {
  const sourceNames = ["unsavedCoordinates", "manualRelationRoute", "manualRelationLabel", "manualNodeLabel", "meaningfulCreationDraft", "meaningfulEntityDetailDraft", "meaningfulRelationDetailDraft"] as const;
  for (const source of sourceNames) {
    const sources = Object.fromEntries(sourceNames.map((name) => [name, name === source])) as Record<typeof sourceNames[number], boolean>;
    assert.equal(hasPendingUserWork(sources), true, source);
  }
  assert.equal(hasPendingUserWork(Object.fromEntries(sourceNames.map((name) => [name, false])) as Record<typeof sourceNames[number], boolean>), false);
});

test("Coordinate Draft migration preserves dragged positions and their pending status", () => {
  const dragged = { "entity-1": { x: 80, y: 90 } };
  const stored = { "entity-1": { x: 10, y: 20 } };
  assert.deepEqual(preservePendingCoordinates({ positions: dragged, coordinatesDirty: true, storedPositions: stored }), { positions: dragged, coordinatesDirty: true });
  assert.deepEqual(preservePendingCoordinates({ positions: dragged, coordinatesDirty: false, storedPositions: stored }), { positions: stored, coordinatesDirty: false });
});

test("Space migration preserves dragged positions and their pending status", () => {
  const dragged = { "entity-1": { x: 80, y: 90 } };
  const stored = { "entity-1": { x: 10, y: 20 } };
  assert.deepEqual(preservePendingCoordinates({ positions: dragged, coordinatesDirty: true, storedPositions: stored }), { positions: dragged, coordinatesDirty: true });
});

test("an explicit automatic-route reset removes only its target manual route", () => {
  assert.deepEqual(resetManualRelationRoute({ ordinary: 24, self: 1.2 }, "ordinary"), { self: 1.2 });
});

test("automatic Entity creation placement is derived rather than pending Coordinate work", () => {
  const result = applyEntityCreationPlacement({
    positions: {}, entityId: "entity-2", explicitPlacement: null, automaticPlacement: { x: 400, y: 250 }, coordinatesDirty: false,
  });
  assert.deepEqual(result, { positions: { "entity-2": { x: 400, y: 250 } }, coordinatesDirty: false });
});

test("explicit Entity creation placement remains pending until Coordinate save", () => {
  const created = applyEntityCreationPlacement({
    positions: {}, entityId: "entity-2", explicitPlacement: { x: 120, y: 80 }, automaticPlacement: { x: 400, y: 250 }, coordinatesDirty: false,
  });
  assert.equal(created.coordinatesDirty, true);
  assert.deepEqual(created.positions, { "entity-2": { x: 120, y: 80 } });
  assert.equal(hasPendingUserWork({
    unsavedCoordinates: created.coordinatesDirty,
    manualRelationRoute: false, manualRelationLabel: false, manualNodeLabel: false,
    meaningfulCreationDraft: false, meaningfulEntityDetailDraft: false, meaningfulRelationDetailDraft: false,
  }), true);
  assert.equal(preservePendingCoordinates({ positions: created.positions, coordinatesDirty: false, storedPositions: created.positions }).coordinatesDirty, false);
});

test("explicit Entity placement makes a modified Dataset a modified-and-pending replacement case", () => {
  const withNewEntity = { ...baseline, entities: [...baseline.entities, { id: "entity-2" }] };
  const state = deriveReplacementSafetyState({
    cleanBaseline: baseline, currentDataset: withNewEntity, pendingUserWork: hasPendingUserWork({
    unsavedCoordinates: true,
    manualRelationRoute: false,
    manualRelationLabel: false,
    manualNodeLabel: false,
    meaningfulCreationDraft: false,
    meaningfulEntityDetailDraft: false,
    meaningfulRelationDetailDraft: false,
    }),
  });
  assert.equal(state.replacementCase, "modified-and-pending");
});
