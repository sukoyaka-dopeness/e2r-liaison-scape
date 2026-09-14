const TERMINAL = new Set(["completed", "cancelled", "stale", "failed", "budget-exhausted"]);

function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function identity(snapshot) {
  if (!snapshot) return null;
  const { viewportFingerprint: _viewport, readOnlySelectionFingerprint: _selection, ...semantic } = snapshot;
  return stable(semantic);
}
function finitePositions(positions, expectedIds) {
  if (!positions || typeof positions !== "object") return false;
  const ids = Object.keys(positions).sort();
  return ids.length === expectedIds.length && ids.every((id, index) => id === expectedIds[index] && Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y));
}
function candidateValid(candidate, snapshot) {
  return Boolean(candidate && typeof candidate.family === "string" && finitePositions(candidate.positions, Object.keys(snapshot.sessionPositions ?? {}).sort()) && candidate.cheapFeatures && typeof candidate.cheapFeatures === "object");
}
function productScore(result) { return Number.isFinite(result?.product?.score) ? result.product.score : Number.POSITIVE_INFINITY; }
function productCompare(left, right) {
  return productScore(left) - productScore(right) || (left.product?.crossings ?? Infinity) - (right.product?.crossings ?? Infinity)
    || left.family.localeCompare(right.family) || String(left.fingerprint).localeCompare(String(right.fingerprint));
}
function cheapKey(candidate) {
  return ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"]
    .map((key) => Math.round((Number(candidate.cheapFeatures[key]) || 0) * 1_000_000) / 1_000_000).join("|");
}
function selectFinalists(candidates, normalK = 4) {
  const ranking = candidates.slice().sort((left, right) => {
    for (const key of ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal"]) {
      const delta = left.cheapFeatures[key] - right.cheapFeatures[key];
      if (delta) return delta;
    }
    return left.family.localeCompare(right.family) || String(left.fingerprint).localeCompare(String(right.fingerprint));
  });
  const normal = ranking.slice(0, normalK);
  const groups = new Map();
  for (const candidate of candidates) groups.set(cheapKey(candidate), [...(groups.get(cheapKey(candidate)) ?? []), candidate]);
  const boundary = [...groups.entries()].map(([key, members]) => ({ key, members, outside: members.filter((candidate) => !normal.includes(candidate)) }))
    .filter(({ members, outside }) => members.length >= normalK && members.some((candidate) => normal.includes(candidate)) && outside.length > 0);
  const selected = [...normal, ...boundary.flatMap(({ outside }) => outside)];
  return { ranking, normal, boundary, selected: [...new Map(selected.map((candidate) => [candidate.fingerprint, candidate])).values()] };
}
function terminal(state, status, reason, result = null) {
  return { ...state, active: null, lastOutcome: { operationId: state.active?.operationId ?? null, status, reason, result: clone(result) } };
}

export function createProviderSnapshot(input) {
  return freeze(clone({
    datasetIdentity: input.datasetIdentity,
    datasetRevision: input.datasetRevision,
    graphFingerprint: input.graphFingerprint,
    sessionPositions: input.sessionPositions,
    storedCoordinateFingerprint: input.storedCoordinateFingerprint,
    adoptedCoordinateFingerprint: input.adoptedCoordinateFingerprint,
    coordinateOwnership: input.coordinateOwnership ?? null,
    manualRelationRouteFingerprint: input.manualRelationRouteFingerprint,
    manualSelfLoopFingerprint: input.manualSelfLoopFingerprint,
    manualRelationLabelFingerprint: input.manualRelationLabelFingerprint,
    manualNodeLabelFingerprint: input.manualNodeLabelFingerprint,
    locale: input.locale,
    algorithmVersion: input.algorithmVersion,
    budgetPolicy: input.budgetPolicy,
  }));
}

export function createProviderState() { return { operationSequence: 0, generation: 0, active: null, lastOutcome: null }; }

export function beginProvider(state, snapshot) {
  const operationId = state.operationSequence + 1;
  return {
    ...state,
    operationSequence: operationId,
    generation: state.generation + 1,
    lastOutcome: null,
    active: {
      operationId,
      generation: state.generation + 1,
      snapshot: createProviderSnapshot(snapshot),
      snapshotIdentity: identity(snapshot),
      phase: "candidate-generation",
      status: "running",
      candidates: [],
      finalists: [],
      boundaryClasses: [],
      verified: [],
      cursor: 0,
      cancelRequested: false,
      result: null,
      workUnits: 0,
    },
  };
}

export function providerEnvelope(state) {
  return state.active ? { operationId: state.active.operationId, generation: state.active.generation, snapshot: state.active.snapshot } : null;
}

export function requestProviderCancellation(state) {
  if (!state.active || state.active.status !== "running") return state;
  return { ...state, active: { ...state.active, cancelRequested: true } };
}

export function stepProvider(state, envelope, dependencies, options = {}) {
  if (!state.active || !envelope || state.active.operationId !== envelope.operationId || state.active.generation !== envelope.generation) {
    return { ...state, lastOutcome: { operationId: envelope?.operationId ?? null, status: "stale", reason: "old-operation-result" } };
  }
  const active = state.active;
  if (active.cancelRequested) return terminal(state, "cancelled", "cancel-requested");
  if (identity(options.currentSnapshot ?? active.snapshot) !== active.snapshotIdentity) return terminal(state, "stale", "input-changed");
  const maxWorkUnits = options.maxWorkUnits ?? active.snapshot.budgetPolicy?.maxWorkUnits ?? 1_000;
  if (active.workUnits >= maxWorkUnits) return terminal(state, "budget-exhausted", "max-work-units");
  const next = { ...state, active: { ...active, workUnits: active.workUnits + 1 } };
  const job = next.active;
  try {
    if (job.phase === "candidate-generation") {
      const candidates = dependencies.generateCandidates(job.snapshot);
      if (!Array.isArray(candidates) || candidates.length === 0 || !candidates.every((candidate) => candidateValid(candidate, job.snapshot))) return terminal(next, "failed", "candidate-generation-failed");
      return { ...next, active: { ...job, phase: "cheap-screen", candidates: clone(candidates) } };
    }
    if (job.phase === "cheap-screen") {
      const selection = selectFinalists(job.candidates, options.normalK ?? 4);
      return { ...next, active: { ...job, phase: "product-verification", finalists: clone(selection.selected), boundaryClasses: clone(selection.boundary), cursor: 0 } };
    }
    if (job.phase === "product-verification") {
      if (job.cursor >= job.finalists.length) return { ...next, active: { ...job, phase: "final-selection" } };
      const candidate = job.finalists[job.cursor];
      const verification = dependencies.verifyCandidate(candidate, job.snapshot);
      if (!verification || verification.status !== "completed" || !verification.product) return terminal(next, "failed", "product-verification-failed");
      return { ...next, active: { ...job, verified: [...job.verified, { ...clone(candidate), product: clone(verification.product), verification: clone(verification.telemetry ?? null) }], cursor: job.cursor + 1 } };
    }
    if (job.phase === "final-selection") {
      if (job.verified.length !== job.finalists.length) return terminal(next, "failed", "incomplete-verification");
      const selected = job.verified.slice().sort(productCompare)[0];
      if (!selected) return terminal(next, "failed", "no-verified-candidate");
      return terminal(next, "completed", "verified-selection-complete", {
        positions: clone(selected.positions),
        family: selected.family,
        fingerprint: selected.fingerprint,
        product: clone(selected.product),
        finalistCount: job.finalists.length,
        boundaryClassCount: job.boundaryClasses.length,
        workUnits: job.workUnits,
      });
    }
    return terminal(next, "failed", "unknown-phase");
  } catch (error) {
    return terminal(next, "failed", error?.message ?? "provider-exception");
  }
}

export function runProvider(state, envelope, dependencies, options = {}) {
  let current = state;
  const maxTurns = options.maxTurns ?? 10_000;
  for (let turn = 0; current.active && turn < maxTurns; turn += 1) current = stepProvider(current, envelope, dependencies, options);
  if (current.active) return terminal(current, "budget-exhausted", "max-scheduled-turns");
  return current;
}

export const providerExecutionContract = Object.freeze({
  contract: "LIAISONSCAPE-PRODUCTION-SHAPED-QUALITY-PROVIDER-EXECUTION-v1",
  phases: ["candidate-generation", "cheap-screen", "product-verification", "final-selection"],
  authority: "candidate geometry is proposal-only; current Product presentation remains authoritative for verification and selection",
  completion: "result is exposed only after every selected finalist has completed Product-authoritative verification",
  cancellation: "cooperative at phase/work-unit boundaries; cancellation exposes no result",
  budget: "max work units and max scheduled turns fail closed",
  transport: ["synchronous", "cooperative main-thread", "Worker-shaped envelope"],
  persistence: "provider never mutates Dataset or persists coordinates",
});
