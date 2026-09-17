import assert from "node:assert/strict";
import test from "node:test";
import {
  createExplicitAutoLayoutFailureDiagnostic,
  shouldExposeExplicitAutoLayoutFailureDiagnostic,
} from "../src/explicit-auto-layout-failure-diagnostic.ts";

test("capture failure preserves stage, reason, operation, graph, Entity, and Pin evidence", () => {
  const diagnostic = createExplicitAutoLayoutFailureDiagnostic({
    failure: { code: "PIN_RESOLUTION_FAILED" },
    operationId: "explicit-auto-layout-4",
    graphFingerprint: "graph-fingerprint",
    entityCount: 7,
    effectivePinCount: 1,
    pinDiagnosticCodes: ["PIN_SPACE_UNSUPPORTED"],
    workerStarted: false,
  });

  assert.deepEqual(diagnostic, {
    stage: "snapshot-capture",
    reasonCode: "PIN_RESOLUTION_FAILED",
    operationId: "explicit-auto-layout-4",
    snapshotIdentity: null,
    graphFingerprint: "graph-fingerprint",
    entityCount: 7,
    effectivePinCount: 1,
    pinDiagnosticCodes: ["PIN_SPACE_UNSUPPORTED"],
    workerStatus: "not-started",
    candidateGenerationReached: false,
    productEvaluationReached: false,
    validationReached: false,
  });
});

test("Worker result failure preserves validation stage and snapshot identity", () => {
  const diagnostic = createExplicitAutoLayoutFailureDiagnostic({
    failure: { code: "PIN_VIOLATION" },
    operationId: "explicit-auto-layout-5",
    snapshotIdentity: "snapshot-fingerprint",
    graphFingerprint: "graph-fingerprint",
    entityCount: 7,
    effectivePinCount: 1,
    workerStarted: true,
  });

  assert.equal(diagnostic.stage, "result-validation");
  assert.equal(diagnostic.reasonCode, "PIN_VIOLATION");
  assert.equal(diagnostic.snapshotIdentity, "snapshot-fingerprint");
  assert.equal(diagnostic.candidateGenerationReached, true);
  assert.equal(diagnostic.productEvaluationReached, true);
  assert.equal(diagnostic.validationReached, true);
});

test("failure diagnostic is visible only in development and only when present", () => {
  const diagnostic = createExplicitAutoLayoutFailureDiagnostic({
    failure: { code: "worker-error" },
    operationId: "explicit-auto-layout-6",
    snapshotIdentity: "snapshot-fingerprint",
    graphFingerprint: "graph-fingerprint",
    entityCount: 7,
    effectivePinCount: 0,
    workerStarted: true,
  });

  assert.equal(shouldExposeExplicitAutoLayoutFailureDiagnostic(true, diagnostic), true);
  assert.equal(shouldExposeExplicitAutoLayoutFailureDiagnostic(false, diagnostic), false);
  assert.equal(shouldExposeExplicitAutoLayoutFailureDiagnostic(true, null), false);
});
