const TERMINAL_STATUSES = new Set(["accepted", "rejected", "cancelled", "stale", "failed"]);

const INVALIDATING_REASONS = new Set([
  "node-move",
  "manual-relation-route",
  "manual-self-loop",
  "manual-relation-label",
  "manual-node-label",
  "dataset-mutation",
  "dataset-replacement",
  "coordinate-load",
  "coordinate-reset",
  "another-auto-layout",
  "coordinates-saved",
  "locale-change",
]);

const REVERT_INVALIDATING_REASONS = new Set([
  "node-move",
  "another-auto-layout",
  "dataset-replacement",
  "dataset-mutation",
  "coordinate-load",
  "coordinate-reset",
  "coordinates-saved",
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function same(left, right) {
  return stable(left) === stable(right);
}

function completeFinitePositions(positions, snapshot) {
  if (!positions || typeof positions !== "object" || !snapshot?.sessionPositions || typeof snapshot.sessionPositions !== "object") return false;
  const expected = Object.keys(snapshot.sessionPositions).sort();
  const actual = Object.keys(positions).sort();
  return same(actual, expected) && actual.every((id) => Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y));
}

function identityOf(snapshot) {
  if (!snapshot) return null;
  const { viewportFingerprint: _viewportFingerprint, readOnlySelectionFingerprint: _selection, ...semantic } = snapshot;
  return stable(semantic);
}

function coordinateIdentityOf(snapshot) {
  if (!snapshot) return null;
  return stable({
    datasetIdentity: snapshot.datasetIdentity,
    datasetRevision: snapshot.datasetRevision,
    graphFingerprint: snapshot.graphFingerprint,
    sessionPositions: snapshot.sessionPositions,
    storedCoordinateFingerprint: snapshot.storedCoordinateFingerprint,
    adoptedCoordinateFingerprint: snapshot.adoptedCoordinateFingerprint,
    coordinatesDirty: snapshot.coordinatesDirty,
    coordinateOwnership: snapshot.coordinateOwnership,
  });
}

function completeState(state, outcome) {
  return {
    ...state,
    active: null,
    lastOutcome: clone(outcome),
  };
}

function invalidatedState(state, reason) {
  if (!state.active) return state;
  return completeState(state, {
    operationId: state.active.operationId,
    status: "stale",
    reason,
  });
}

function recordStaleResult(state, operationId) {
  return {
    ...state,
    lastOutcome: { operationId: operationId ?? null, status: "stale", reason: "old-operation-result" },
  };
}

export function createLifecycleState({ operationSequence = 0, generation = 0, revert = null } = {}) {
  return {
    operationSequence,
    generation,
    active: null,
    revert: clone(revert),
    lastOutcome: null,
  };
}

export function createOperationSnapshot(input) {
  const snapshot = clone({
    datasetIdentity: input.datasetIdentity,
    datasetRevision: input.datasetRevision,
    graphFingerprint: input.graphFingerprint,
    sessionPositions: input.sessionPositions,
    storedCoordinateFingerprint: input.storedCoordinateFingerprint,
    coordinatesDirty: Boolean(input.coordinatesDirty),
    adoptedCoordinateFingerprint: input.adoptedCoordinateFingerprint,
    coordinateOwnership: input.coordinateOwnership ?? null,
    manualRelationRouteFingerprint: input.manualRelationRouteFingerprint,
    manualSelfLoopFingerprint: input.manualSelfLoopFingerprint,
    manualRelationLabelFingerprint: input.manualRelationLabelFingerprint,
    manualNodeLabelFingerprint: input.manualNodeLabelFingerprint,
    locale: input.locale,
    algorithmVersion: input.algorithmVersion,
    budgetPolicy: input.budgetPolicy,
    viewportFingerprint: input.viewportFingerprint,
    readOnlySelectionFingerprint: input.readOnlySelectionFingerprint,
  });
  return deepFreeze(snapshot);
}

export function snapshotIdentity(snapshot) {
  return identityOf(snapshot);
}

export function revertValidityIdentity(snapshot) {
  return coordinateIdentityOf(snapshot);
}

export function beginOperation(state, snapshot) {
  state = invalidateRevert(state, "another-auto-layout");
  if (state.active) {
    state = invalidatedState(state, "another-auto-layout");
  }
  const operationId = state.operationSequence + 1;
  const generation = state.generation + 1;
  const immutableSnapshot = createOperationSnapshot(snapshot);
  return {
    ...state,
    operationSequence: operationId,
    generation,
    active: {
      operationId,
      generation,
      snapshot: immutableSnapshot,
      snapshotIdentity: identityOf(immutableSnapshot),
      status: "running",
      cancelRequested: false,
      candidate: null,
      preview: null,
    },
    lastOutcome: null,
  };
}

export function jobEnvelope(state) {
  if (!state.active) return null;
  return {
    operationId: state.active.operationId,
    generation: state.active.generation,
    snapshot: deepFreeze(clone(state.active.snapshot)),
  };
}

export function requestCancellation(state) {
  if (!state.active) return state;
  if (state.active.status === "cancel-requested") return state;
  if (state.active.status === "candidate-ready" || state.active.status === "previewing") {
    return completeState(state, {
      operationId: state.active.operationId,
      status: "cancelled",
      reason: "user-cancelled",
    });
  }
  if (state.active.status !== "running") return state;
  return {
    ...state,
    active: { ...state.active, status: "cancel-requested", cancelRequested: true },
  };
}

export function deliverCandidate(state, envelope, candidate, currentSnapshot) {
  if (!state.active || !envelope || state.active.operationId !== envelope.operationId || state.active.generation !== envelope.generation) {
    return recordStaleResult(state, envelope?.operationId);
  }
  if (state.active.cancelRequested || state.active.status === "cancel-requested") {
    return completeState(state, { operationId: state.active.operationId, status: "cancelled", reason: "cancel-requested" });
  }
  if (identityOf(currentSnapshot) !== state.active.snapshotIdentity) {
    return completeState(state, { operationId: state.active.operationId, status: "stale", reason: "input-changed" });
  }
  if (!candidate || !completeFinitePositions(candidate.positions, state.active.snapshot)) {
    return completeState(state, { operationId: state.active.operationId, status: "failed", reason: "invalid-candidate" });
  }
  return {
    ...state,
    active: {
      ...state.active,
      status: "candidate-ready",
      candidate: clone(candidate),
    },
  };
}

export function deliverFailure(state, envelope, failure, currentSnapshot) {
  if (!state.active || !envelope || state.active.operationId !== envelope.operationId || state.active.generation !== envelope.generation) {
    return recordStaleResult(state, envelope?.operationId);
  }
  if (state.active.cancelRequested || state.active.status === "cancel-requested") {
    return completeState(state, { operationId: state.active.operationId, status: "cancelled", reason: "cancel-requested" });
  }
  if (identityOf(currentSnapshot) !== state.active.snapshotIdentity) {
    return completeState(state, { operationId: state.active.operationId, status: "stale", reason: "input-changed" });
  }
  return completeState(state, {
    operationId: state.active.operationId,
    status: "failed",
    reason: failure?.reason ?? "solver-failure",
  });
}

export function previewCandidate(state, preview) {
  if (!state.active || state.active.status !== "candidate-ready") return state;
  return {
    ...state,
    active: { ...state.active, status: "previewing", preview: clone(preview) },
  };
}

export function applyContextChange(state, reason) {
  state = invalidateRevert(state, reason);
  if (reason === "viewport-change") {
    if (!state.active || state.active.status !== "previewing") return state;
    return { ...state, active: { ...state.active, status: "candidate-ready", preview: null } };
  }
  if (reason === "read-only-selection") return state;
  if (INVALIDATING_REASONS.has(reason)) return invalidatedState(state, reason);
  return state;
}

export function rejectCandidate(state, reason = "user-rejected") {
  if (!state.active || (state.active.status !== "candidate-ready" && state.active.status !== "previewing")) return state;
  return completeState(state, {
    operationId: state.active.operationId,
    status: "rejected",
    reason,
  });
}

export function acceptCandidate(state, currentSnapshot) {
  if (!state.active || (state.active.status !== "candidate-ready" && state.active.status !== "previewing")) {
    return { state, commit: null, reason: "no-accepted-candidate" };
  }
  if (identityOf(currentSnapshot) !== state.active.snapshotIdentity) {
    const next = completeState(state, {
      operationId: state.active.operationId,
      status: "stale",
      reason: "input-changed-before-accept",
    });
    return { state: next, commit: null, reason: "stale-candidate" };
  }
  const candidate = clone(state.active.candidate);
  const priorPositions = clone(state.active.snapshot.sessionPositions);
  const priorCoordinateOwnership = clone(currentSnapshot.coordinateOwnership);
  const operationId = state.active.operationId;
  const next = completeState(state, {
    operationId,
    status: "accepted",
    reason: "user-accepted",
  });
  next.revert = {
    operationId,
    priorPositions,
    priorCoordinatesDirty: Boolean(currentSnapshot.coordinatesDirty),
    priorCoordinateOwnership,
    acceptedPositions: clone(candidate.positions),
    validForCoordinateIdentity: null,
  };
  const acceptedCoordinateOwnership = Object.fromEntries(Object.keys(candidate.positions).sort().map((id) => [id, "adopted"]));
  const acceptedSnapshot = createOperationSnapshot({
    ...currentSnapshot,
    sessionPositions: candidate.positions,
    coordinatesDirty: true,
    adoptedCoordinateFingerprint: `quality-operation:${operationId}`,
    coordinateOwnership: acceptedCoordinateOwnership,
  });
  next.revert.validForCoordinateIdentity = coordinateIdentityOf(acceptedSnapshot);
  return {
    state: next,
    commit: {
      kind: "accept-quality-layout",
      operationId,
      positions: clone(candidate.positions),
      adoptedEntityIds: Object.keys(candidate.positions).sort(),
      coordinateOwnership: acceptedCoordinateOwnership,
      coordinatesDirty: true,
      persistDataset: false,
      preserveManualAuthorities: true,
      acceptedSnapshot,
    },
  };
}

export function revertAcceptedLayout(state, currentSnapshot) {
  if (!state.revert) return { state, revert: null, reason: "no-revert-available" };
  if (coordinateIdentityOf(currentSnapshot) !== state.revert.validForCoordinateIdentity) {
    return { state: { ...state, revert: null }, revert: null, reason: "revert-expired" };
  }
  const revert = clone(state.revert);
  return {
    state: { ...state, revert: null },
    revert: {
      kind: "revert-quality-layout",
      operationId: revert.operationId,
      positions: revert.priorPositions,
      coordinatesDirty: revert.priorCoordinatesDirty,
      coordinateOwnership: revert.priorCoordinateOwnership,
      adoptedEntityIds: Object.entries(revert.priorCoordinateOwnership ?? {})
        .filter(([, ownership]) => ownership === "adopted")
        .map(([entityId]) => entityId)
        .sort(),
      persistDataset: false,
      preserveManualAuthorities: true,
    },
  };
}

export function invalidateRevert(state, reason) {
  return REVERT_INVALIDATING_REASONS.has(reason) ? { ...state, revert: null } : state;
}

export function classifyFailure(failure) {
  const reason = failure?.reason ?? "solver-failure";
  if (["budget-exhausted", "no-better", "infeasible-only", "solver-failure", "exception", "cancelled", "stale"].includes(reason)) return reason;
  return "solver-failure";
}

export const lifecycleContract = Object.freeze({
  statuses: ["idle", "running", "cancel-requested", "candidate-ready", "previewing", ...TERMINAL_STATUSES],
  invalidatingReasons: [...INVALIDATING_REASONS],
  revertInvalidatingReasons: [...REVERT_INVALIDATING_REASONS],
  candidateOwnership: "candidate-only-until-explicit-accept",
  persistence: "accept-and-revert-return-session plans; they never mutate Dataset or persist automatically",
  authority: "proposal owns Node geometry only; Product routing, endpoint-plan, labels, Self-loop, and viewport remain external authorities",
  execution: "job envelope is independent of sync, cooperative async, or Worker transport",
});
