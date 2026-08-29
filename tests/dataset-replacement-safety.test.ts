import assert from "node:assert/strict";
import test from "node:test";
import { applyEntityCreationPlacement, buildPersistableCoordinatePositions, cancelStagedDatasetReplacement, candidateFromLoadResult, decideDatasetReplacement, deriveReplacementSafetyState, discardAndContinueStagedDatasetReplacement, hasDocumentExitLossRisk, hasPendingUserWork, isDatasetModified, preservePendingCoordinates, replacementActions, resetManualRelationRoute, resolveExportTransition } from "../src/dataset-replacement-safety.ts";
import { canRestoreReplacementTrigger } from "../src/replacement-focus.ts";
import { loadDataset } from "../src/services/DatasetService.ts";

const baseline = { version: "1.0", entities: [{ id: "entity-1", name: "Original" }], events: [], relations: [] };

test("datasetModified uses Dataset content equality and clears after a true revert", () => {
  const equalCopy = { relations: [], events: [], entities: [{ name: "Original", id: "entity-1" }], version: "1.0" };
  const edited = { ...baseline, entities: [{ id: "entity-1", name: "Edited" }] };
  assert.equal(isDatasetModified(baseline, equalCopy), false);
  assert.equal(isDatasetModified(baseline, edited), true);
  assert.equal(isDatasetModified(baseline, { ...baseline, entities: [{ id: "entity-1", name: "Original" }] }), false);
});

test("document exit loss risk follows Dataset modification or pending user work", () => {
  assert.equal(hasDocumentExitLossRisk(false, false), false);
  assert.equal(hasDocumentExitLossRisk(true, false), true);
  assert.equal(hasDocumentExitLossRisk(false, true), true);
  assert.equal(hasDocumentExitLossRisk(true, true), true);
  assert.equal(hasDocumentExitLossRisk(isDatasetModified(baseline, baseline), false), false);
  assert.equal(hasDocumentExitLossRisk(false, true), true);
  assert.equal(hasDocumentExitLossRisk(false, false), false);
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

test("Coordinate save input excludes automatic-only positions and keeps adopted positions", () => {
  const result = buildPersistableCoordinatePositions({
    storedPositions: { stored: { x: 1, y: 2 } },
    currentPositions: { stored: { x: 10, y: 20 }, automatic: { x: 30, y: 40 }, dragged: { x: 50, y: 60 } },
    adoptedEntityIds: new Set(["stored", "dragged"]),
    entityIds: new Set(["stored", "automatic", "dragged"]),
  });
  assert.deepEqual(result, { stored: { x: 10, y: 20 }, dragged: { x: 50, y: 60 } });
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

test("replacement requests accept only clean current work and otherwise stage the candidate", () => {
  const candidate = { id: "candidate" };
  assert.equal(decideDatasetReplacement({ candidate, datasetModified: false, pendingUserWork: false }).action, "accept");
  for (const [datasetModified, pendingUserWork] of [[true, false], [false, true], [true, true]] as const) {
    const decision = decideDatasetReplacement({ candidate, datasetModified, pendingUserWork });
    assert.equal(decision.action, "stage");
    assert.equal(decision.refreshBaseline, false);
  }
});

test("cancel and discard transitions preserve or accept only the staged candidate", () => {
  const candidate = { id: "candidate" };
  assert.deepEqual(cancelStagedDatasetReplacement(candidate), { stagedCandidate: null, refreshBaseline: false });
  assert.deepEqual(discardAndContinueStagedDatasetReplacement(candidate), { candidate, stagedCandidate: null, refreshBaseline: true });
});

test("invalid JSON and schema-invalid loads generate no replacement candidate", () => {
  assert.equal(candidateFromLoadResult(loadDataset("{ invalid")), null);
  assert.equal(candidateFromLoadResult(loadDataset(JSON.stringify({ version: "1.0", entities: [], events: [] }))), null);
});

test("D6 exposes only the actions allowed by each safety state", () => {
  assert.deepEqual(replacementActions(false, false), []);
  assert.deepEqual(replacementActions(true, false), ["cancel", "discard-and-continue", "export-and-continue"]);
  assert.deepEqual(replacementActions(false, true), ["cancel", "discard-and-continue"]);
  assert.deepEqual(replacementActions(true, true), ["cancel", "discard-and-continue", "export-dataset"]);
});

test("replacement focus restores only a connected and enabled initiating trigger", () => {
  assert.equal(canRestoreReplacementTrigger({ isConnected: true, disabled: false }), true);
  assert.equal(canRestoreReplacementTrigger({ isConnected: true, disabled: true }), false);
  assert.equal(canRestoreReplacementTrigger({ isConnected: false, disabled: false }), false);
  assert.equal(canRestoreReplacementTrigger(null), false);
});

test("D6 export transitions never accept a candidate after failure and preserve pending work", () => {
  assert.deepEqual(resolveExportTransition({ success: false, pendingUserWork: false }), { refreshBaseline: false, acceptCandidate: false, keepCandidate: true });
  assert.deepEqual(resolveExportTransition({ success: true, pendingUserWork: false }), { refreshBaseline: true, acceptCandidate: true, keepCandidate: false });
  assert.deepEqual(resolveExportTransition({ success: true, pendingUserWork: true }), { refreshBaseline: true, acceptCandidate: false, keepCandidate: true });
});
