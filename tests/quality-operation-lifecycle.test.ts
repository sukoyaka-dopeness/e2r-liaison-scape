import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptCandidate,
  applyContextChange,
  beginOperation,
  classifyFailure,
  createLifecycleState,
  createOperationSnapshot,
  deliverCandidate,
  deliverFailure,
  invalidateRevert,
  jobEnvelope,
  lifecycleContract,
  previewCandidate,
  rejectCandidate,
  requestCancellation,
  revertAcceptedLayout,
  revertValidityIdentity,
  snapshotIdentity,
} from "../experimental/quality-operation-lifecycle/contract.mjs";

function snapshot(overrides: Record<string, unknown> = {}) {
  return createOperationSnapshot({
    datasetIdentity: "dataset-1",
    datasetRevision: 4,
    graphFingerprint: "graph-a",
    sessionPositions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
    storedCoordinateFingerprint: "stored-a",
    coordinatesDirty: false,
    adoptedCoordinateFingerprint: "adopted-none",
    coordinateOwnership: { a: "stored", b: "derived" },
    manualRelationRouteFingerprint: "routes-a",
    manualSelfLoopFingerprint: "loops-a",
    manualRelationLabelFingerprint: "relation-labels-a",
    manualNodeLabelFingerprint: "node-labels-a",
    locale: "en",
    algorithmVersion: "quality-contract-fake-v1",
    budgetPolicy: { maxIterations: 10, maxMs: 100 },
    viewportFingerprint: "viewport-a",
    readOnlySelectionFingerprint: "selection-a",
    ...overrides,
  });
}

const candidate = { positions: { a: { x: 20, y: 30 }, b: { x: 220, y: 30 } }, score: 1, presentationDigest: "p1" };

function running() {
  const input = snapshot();
  const state = beginOperation(createLifecycleState(), input);
  return { input, state, envelope: jobEnvelope(state)! };
}

function ready() {
  const current = running();
  return { ...current, state: deliverCandidate(current.state, current.envelope, candidate, current.input) };
}

test("contract exposes a bounded, proposal-only lifecycle", () => {
  assert.deepEqual(lifecycleContract.statuses.slice(0, 5), ["idle", "running", "cancel-requested", "candidate-ready", "previewing"]);
  assert.equal(lifecycleContract.candidateOwnership, "candidate-only-until-explicit-accept");
  assert.equal(lifecycleContract.persistence.includes("never mutate Dataset"), true);
  assert.equal(lifecycleContract.authority.includes("Product routing"), true);
});

test("begin and candidate delivery do not mutate the current session or Dataset", () => {
  const { input, state, envelope } = running();
  assert.equal(state.active?.status, "running");
  assert.deepEqual(state.active?.snapshot.sessionPositions, input.sessionPositions);
  const next = deliverCandidate(state, envelope, candidate, input);
  assert.equal(next.active?.status, "candidate-ready");
  assert.deepEqual(next.active?.snapshot.sessionPositions, input.sessionPositions);
  assert.deepEqual(next.active?.candidate, candidate);
  assert.equal(next.lastOutcome, null);
});

test("preview remains isolated and viewport changes only invalidate the preview", () => {
  const current = ready();
  const previewing = previewCandidate(current.state, { routeDigest: "product-derived-preview" });
  assert.equal(previewing.active?.status, "previewing");
  assert.deepEqual(previewing.active?.snapshot.sessionPositions, current.input.sessionPositions);
  const afterViewport = applyContextChange(previewing, "viewport-change");
  assert.equal(afterViewport.active?.status, "candidate-ready");
  assert.equal(afterViewport.active?.preview, null);
});

test("accept returns an atomic session transaction and never a Dataset write", () => {
  const current = ready();
  const result = acceptCandidate(current.state, current.input);
  assert.equal(result.state.lastOutcome?.status, "accepted");
  assert.deepEqual(result.commit?.positions, candidate.positions);
  assert.deepEqual(result.commit?.adoptedEntityIds, ["a", "b"]);
  assert.equal(result.commit?.coordinatesDirty, true);
  assert.equal(result.commit?.persistDataset, false);
  assert.equal(result.commit?.preserveManualAuthorities, true);
  assert.deepEqual(result.commit?.coordinateOwnership, { a: "adopted", b: "adopted" });
  assert.deepEqual(result.state.revert?.priorPositions, current.input.sessionPositions);
});

test("reject leaves no coordinate transaction and cancellation is idempotent", () => {
  const current = ready();
  const rejected = rejectCandidate(current.state);
  assert.equal(rejected.active, null);
  assert.equal(rejected.lastOutcome?.status, "rejected");
  const first = requestCancellation(current.state);
  const second = requestCancellation(first);
  assert.equal(first.lastOutcome?.status, "cancelled");
  assert.deepEqual(second, first);
});

test("cancellation before completion wins the completion race", () => {
  const current = running();
  const cancelled = requestCancellation(current.state);
  assert.equal(cancelled.active?.status, "cancel-requested");
  const afterLateCandidate = deliverCandidate(cancelled, current.envelope, candidate, current.input);
  assert.equal(afterLateCandidate.active, null);
  assert.deepEqual(afterLateCandidate.lastOutcome, { operationId: 1, status: "cancelled", reason: "cancel-requested" });
});

test("manual and semantic input changes stale a running operation; read-only selection does not", () => {
  const reasons = [
    "node-move", "manual-relation-route", "manual-self-loop", "manual-relation-label", "manual-node-label",
    "dataset-mutation", "dataset-replacement", "coordinate-load", "coordinate-reset", "another-auto-layout",
    "coordinates-saved", "locale-change",
  ];
  for (const reason of reasons) {
    const current = running();
    const next = applyContextChange(current.state, reason);
    assert.equal(next.active, null, reason);
    assert.equal(next.lastOutcome?.status, "stale", reason);
    assert.equal(next.lastOutcome?.reason, reason, reason);
  }
  const current = running();
  assert.equal(applyContextChange(current.state, "read-only-selection").active?.status, "running");
});

test("old results cannot displace a newer operation", () => {
  const first = running();
  const secondInput = snapshot({ sessionPositions: { a: { x: 5, y: 5 }, b: { x: 205, y: 5 } } });
  const second = beginOperation(first.state, secondInput);
  const afterOldResult = deliverCandidate(second, first.envelope, candidate, first.input);
  assert.equal(afterOldResult.active?.operationId, 2);
  assert.equal(afterOldResult.active?.status, "running");
  assert.equal(afterOldResult.lastOutcome?.reason, "old-operation-result");
});

test("a completion against a changed snapshot is stale and cannot be accepted", () => {
  const current = running();
  const changed = snapshot({ locale: "ja" });
  const stale = deliverCandidate(current.state, current.envelope, candidate, changed);
  assert.equal(stale.active, null);
  assert.equal(stale.lastOutcome?.reason, "input-changed");
  assert.equal(acceptCandidate(stale, changed).commit, null);
});

test("incomplete or non-finite candidate geometry fails closed", () => {
  const current = running();
  const incomplete = deliverCandidate(current.state, current.envelope, { positions: { a: { x: 1, y: 1 } } }, current.input);
  assert.deepEqual(incomplete.lastOutcome, { operationId: 1, status: "failed", reason: "invalid-candidate" });
  const another = running();
  const nonFinite = deliverCandidate(another.state, another.envelope, { positions: { a: { x: 1, y: 1 }, b: { x: Number.NaN, y: 1 } } }, another.input);
  assert.deepEqual(nonFinite.lastOutcome, { operationId: 1, status: "failed", reason: "invalid-candidate" });
});

test("one-step revert is available after acceptance and expires on geometry or dataset changes", () => {
  const current = ready();
  const accepted = acceptCandidate(current.state, current.input);
  assert.ok(accepted.commit?.acceptedSnapshot);
  const reverted = revertAcceptedLayout(accepted.state, accepted.commit!.acceptedSnapshot);
  assert.deepEqual(reverted.revert?.positions, current.input.sessionPositions);
  assert.deepEqual(reverted.revert?.coordinateOwnership, current.input.coordinateOwnership);
  assert.deepEqual(reverted.revert?.adoptedEntityIds, []);
  assert.equal(reverted.revert?.persistDataset, false);
  assert.equal(reverted.state.revert, null);

  const acceptedAgain = acceptCandidate(ready().state, current.input);
  for (const reason of ["node-move", "another-auto-layout", "dataset-replacement", "coordinate-reset"]) {
    assert.equal(invalidateRevert(acceptedAgain.state, reason).revert, null, reason);
  }
});

test("active semantic identity and coordinate-revert validity identity are intentionally separate", () => {
  const current = ready();
  const accepted = acceptCandidate(current.state, current.input);
  const presentationEdit = createOperationSnapshot({
    ...accepted.commit!.acceptedSnapshot,
    manualRelationRouteFingerprint: "routes-after-manual-edit",
    manualSelfLoopFingerprint: "loops-after-manual-edit",
    manualRelationLabelFingerprint: "relation-labels-after-manual-edit",
    manualNodeLabelFingerprint: "node-labels-after-manual-edit",
    locale: "ja",
  });
  assert.notEqual(snapshotIdentity(accepted.commit!.acceptedSnapshot), snapshotIdentity(presentationEdit));
  assert.equal(revertValidityIdentity(accepted.commit!.acceptedSnapshot), revertValidityIdentity(presentationEdit));
  const reverted = revertAcceptedLayout(accepted.state, presentationEdit);
  assert.deepEqual(reverted.revert?.positions, current.input.sessionPositions);
  assert.equal(invalidateRevert(accepted.state, "manual-relation-route").revert !== null, true);
  assert.equal(invalidateRevert(accepted.state, "manual-self-loop").revert !== null, true);
  assert.equal(invalidateRevert(accepted.state, "manual-relation-label").revert !== null, true);
  assert.equal(invalidateRevert(accepted.state, "manual-node-label").revert !== null, true);
});

test("Node movement, Dataset replacement, and Save Coordinates expire coordinate revert", () => {
  const current = ready();
  const accepted = acceptCandidate(current.state, current.input);
  const moved = createOperationSnapshot({ ...accepted.commit!.acceptedSnapshot, sessionPositions: { a: { x: 21, y: 30 }, b: { x: 220, y: 30 } } });
  assert.equal(revertAcceptedLayout(accepted.state, moved).reason, "revert-expired");

  const acceptedAgain = acceptCandidate(ready().state, current.input);
  const replaced = createOperationSnapshot({ ...acceptedAgain.commit!.acceptedSnapshot, datasetIdentity: "dataset-2", datasetRevision: 1, graphFingerprint: "graph-b" });
  assert.equal(revertAcceptedLayout(acceptedAgain.state, replaced).reason, "revert-expired");

  const acceptedAfterSave = acceptCandidate(ready().state, current.input);
  const saved = createOperationSnapshot({ ...acceptedAfterSave.commit!.acceptedSnapshot, datasetRevision: 5, storedCoordinateFingerprint: "stored-after-save", coordinatesDirty: false, adoptedCoordinateFingerprint: "adopted-none", coordinateOwnership: { a: "stored", b: "stored" } });
  assert.equal(revertAcceptedLayout(acceptedAfterSave.state, saved).reason, "revert-expired");
  assert.equal(invalidateRevert(acceptedAfterSave.state, "coordinates-saved").revert, null);
});

test("revert preserves the prior dirty baseline rather than forcing a clean Dataset", () => {
  const dirtyInput = snapshot({ coordinatesDirty: true, adoptedCoordinateFingerprint: "manual-a", coordinateOwnership: { a: "stored", b: "adopted" } });
  const current = running();
  const dirtyRun = { ...current, input: dirtyInput, state: beginOperation(createLifecycleState(), dirtyInput) };
  const readyDirty = { ...dirtyRun, envelope: jobEnvelope(dirtyRun.state)! };
  const result = acceptCandidate(deliverCandidate(readyDirty.state, readyDirty.envelope, candidate, dirtyInput), dirtyInput);
  const reverted = revertAcceptedLayout(result.state, result.commit!.acceptedSnapshot);
  assert.equal(reverted.revert?.coordinatesDirty, true);
  assert.deepEqual(reverted.revert?.coordinateOwnership, dirtyInput.coordinateOwnership);
  assert.deepEqual(reverted.revert?.adoptedEntityIds, ["b"]);
});

test("mixed stored, adopted, and derived ownership is restored as a bounded coordinate transaction", () => {
  const mixedInput = snapshot({
    sessionPositions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 160 } },
    coordinateOwnership: { a: "stored", b: "adopted", c: "derived" },
    adoptedCoordinateFingerprint: "adopted-b",
  });
  const state = beginOperation(createLifecycleState(), mixedInput);
  const envelope = jobEnvelope(state)!;
  const mixedCandidate = { positions: { a: { x: 20, y: 30 }, b: { x: 220, y: 30 }, c: { x: 120, y: 190 } } };
  const accepted = acceptCandidate(deliverCandidate(state, envelope, mixedCandidate, mixedInput), mixedInput);
  assert.deepEqual(accepted.commit?.coordinateOwnership, { a: "adopted", b: "adopted", c: "adopted" });
  const reverted = revertAcceptedLayout(accepted.state, accepted.commit!.acceptedSnapshot);
  assert.deepEqual(reverted.revert?.positions, mixedInput.sessionPositions);
  assert.deepEqual(reverted.revert?.coordinateOwnership, mixedInput.coordinateOwnership);
  assert.deepEqual(reverted.revert?.adoptedEntityIds, ["b"]);
});

test("snapshot inputs and job envelopes are isolated and deeply immutable", () => {
  const original = snapshot({
    sessionPositions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
    budgetPolicy: { maxIterations: 10, maxMs: 100, phases: { proposal: 4 } },
    coordinateOwnership: { a: "stored", b: "derived" },
  });
  const state = beginOperation(createLifecycleState(), original);
  const envelope = jobEnvelope(state)!;
  assert.notEqual(envelope.snapshot, state.active!.snapshot);
  assert.throws(() => { (state.active!.snapshot.budgetPolicy as { phases: { proposal: number } }).phases.proposal = 99; }, TypeError);
  assert.throws(() => { (state.active!.snapshot.coordinateOwnership as Record<string, string>).a = "adopted"; }, TypeError);
  assert.deepEqual(state.active!.snapshot.budgetPolicy, { maxIterations: 10, maxMs: 100, phases: { proposal: 4 } });
  assert.deepEqual(state.active!.snapshot.coordinateOwnership, { a: "stored", b: "derived" });
  assert.deepEqual(envelope.snapshot.sessionPositions, original.sessionPositions);
  const changedOriginal = { ...original.sessionPositions, a: { x: 999, y: 999 } };
  assert.notDeepEqual(state.active!.snapshot.sessionPositions, changedOriginal);
});

test("failure taxonomy is explicit and cancellation remains distinct from solver failure", () => {
  for (const reason of ["budget-exhausted", "no-better", "infeasible-only", "solver-failure", "exception", "cancelled", "stale"]) {
    assert.equal(classifyFailure({ reason }), reason);
  }
  assert.equal(classifyFailure({ reason: "unknown" }), "solver-failure");
  const current = running();
  const failed = deliverFailure(current.state, current.envelope, { reason: "budget-exhausted" }, current.input);
  assert.deepEqual(failed.lastOutcome, { operationId: 1, status: "failed", reason: "budget-exhausted" });
});

test("same snapshot, algorithm version, and budget produce the same identity independent of transport", () => {
  const first = snapshot();
  const second = snapshot({ readOnlySelectionFingerprint: "selection-b" });
  assert.equal(snapshotIdentity(first), snapshotIdentity(second));
  const changedBudget = snapshot({ budgetPolicy: { maxIterations: 11, maxMs: 100 } });
  assert.notEqual(snapshotIdentity(first), snapshotIdentity(changedBudget));
});
