import fs from "node:fs";
import {
  acceptCandidate,
  applyContextChange,
  beginOperation,
  createLifecycleState,
  createOperationSnapshot,
  deliverCandidate,
  jobEnvelope,
  lifecycleContract,
  previewCandidate,
  requestCancellation,
  revertAcceptedLayout,
} from "../experimental/quality-operation-lifecycle/contract.mjs";

const makeSnapshot = (overrides = {}) => createOperationSnapshot({
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

const candidate = { positions: { a: { x: 20, y: 30 }, b: { x: 220, y: 30 } }, score: 1 };
const start = (input = makeSnapshot()) => {
  const state = beginOperation(createLifecycleState(), input);
  return { input, state, envelope: jobEnvelope(state) };
};
const ready = (current) => deliverCandidate(current.state, current.envelope, candidate, current.input);

const invalidationRows = [
  "node-move", "manual-relation-route", "manual-self-loop", "manual-relation-label", "manual-node-label",
  "dataset-mutation", "dataset-replacement", "coordinate-load", "coordinate-reset", "another-auto-layout",
  "coordinates-saved", "locale-change",
].map((reason) => {
  const current = start();
  const next = applyContextChange(current.state, reason);
  return { reason, activeAfterChange: next.active?.status ?? null, outcome: next.lastOutcome };
});

const current = start();
const candidateState = ready(current);
const previewState = previewCandidate(candidateState, { presentationDigest: "product-authoritative-preview" });
const accepted = acceptCandidate(candidateState, current.input);
const reverted = revertAcceptedLayout(accepted.state, accepted.commit.acceptedSnapshot);
const presentationEditedSnapshot = createOperationSnapshot({
  ...accepted.commit.acceptedSnapshot,
  manualRelationRouteFingerprint: "routes-after-manual-edit",
  manualSelfLoopFingerprint: "loops-after-manual-edit",
  manualRelationLabelFingerprint: "relation-labels-after-manual-edit",
  manualNodeLabelFingerprint: "node-labels-after-manual-edit",
  locale: "ja",
});
const presentationEditRevert = revertAcceptedLayout(accepted.state, presentationEditedSnapshot);
const cancelled = requestCancellation(start().state);
const cancelledCompletion = deliverCandidate(cancelled, current.envelope, candidate, current.input);
const secondInput = makeSnapshot({ sessionPositions: { a: { x: 5, y: 5 }, b: { x: 205, y: 5 } } });
const second = beginOperation(current.state, secondInput);
const lateOldResult = deliverCandidate(second, current.envelope, candidate, current.input);

const artifact = {
  contractId: "EXPLICIT-HIGH-QUALITY-AUTO-LAYOUT-OPERATION-LIFECYCLE-v1",
  diagnosticOnly: true,
  productionIntegration: "HOLD",
  qualitySolver: "HOLD / NOT ESTABLISHED",
  humanReview: "NOT READY",
  focusedTestCount: (fs.readFileSync("tests/quality-operation-lifecycle.test.ts", "utf8").match(/^test\(/gm) ?? []).length,
  lifecycleContract,
  scenarios: {
    start: { status: current.state.active.status, sessionMutation: false, datasetMutation: false },
    candidate: { status: candidateState.active.status, sessionMutation: false, datasetMutation: false },
    preview: { status: previewState.active.status, currentSessionMutation: false, presentationAuthority: "Product-derived preview only" },
    accept: { status: accepted.state.lastOutcome.status, commit: accepted.commit },
    revert: { status: "revert-plan", plan: reverted.revert },
    presentationEditRevert: { status: presentationEditRevert.revert ? "allowed" : presentationEditRevert.reason },
    cancellationRace: { afterRequest: cancelled.active?.status, afterLateCompletion: cancelledCompletion.lastOutcome },
    oldResultAfterNewOperation: { activeOperationId: lateOldResult.active?.operationId, oldResultOutcome: lateOldResult.lastOutcome },
  },
  invalidationMatrix: invalidationRows,
  explicitNonInvalidatingInputs: ["viewport-change (clears only a derived preview)", "read-only-selection"],
  determinism: {
    sameSnapshotAlgorithmVersionBudget: "same snapshot identity and job envelope contract",
    transport: ["synchronous fake", "cooperative async", "Worker-shaped envelope"],
  },
  identitySeparation: {
    activeJob: "full semantic identity, including presentation inputs",
    coordinateRevert: "Dataset/graph/coordinate-session/ownership identity; excludes manual presentation inputs and locale",
    manualPresentationEditAfterAccept: presentationEditRevert.revert ? "revert remains valid" : "revert expires",
  },
};

fs.mkdirSync("experimental/quality-operation-lifecycle", { recursive: true });
fs.writeFileSync("experimental/quality-operation-lifecycle/audit.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  contract: artifact.contractId,
  statuses: { start: artifact.scenarios.start.status, candidate: artifact.scenarios.candidate.status, preview: artifact.scenarios.preview.status, accept: artifact.scenarios.accept.status },
  invalidationCount: invalidationRows.length,
  focusedTestCount: artifact.focusedTestCount,
  cancellation: artifact.scenarios.cancellationRace,
  oldResultAfterNewOperation: artifact.scenarios.oldResultAfterNewOperation,
  humanReview: artifact.humanReview,
}, null, 2));
