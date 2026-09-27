import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { translate } from "../src/i18n.ts";
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
    workerDiagnostic: null,
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

test("worker execution diagnostic retains browser event details", () => {
  const detail = { source: "worker-error-event", filename: "worker.js", lineno: 3, colno: 4 };
  const diagnostic = createExplicitAutoLayoutFailureDiagnostic({
    failure: { code: "worker-error" },
    operationId: "explicit-auto-layout-7",
    snapshotIdentity: "snapshot-fingerprint",
    graphFingerprint: "graph-fingerprint",
    entityCount: 13,
    effectivePinCount: 0,
    workerStarted: true,
    workerDiagnostic: detail,
  });
  assert.equal(diagnostic.stage, "worker-execution");
  assert.equal(diagnostic.workerDiagnostic?.filename, "worker.js");
  assert.equal(diagnostic.candidateGenerationReached, null);
  assert.equal(diagnostic.productEvaluationReached, null);
  assert.equal(diagnostic.validationReached, null);
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

test("Actual Product diagnostic is a localized collapsed development disclosure that survives operation state changes", () => {
  const app = readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /import\.meta\.env\.DEV && dataset && shouldExposeExplicitAutoLayoutFailureDiagnostic\(import\.meta\.env\.DEV, explicitAutoLayoutFailureDiagnostic\) && <details/);
  assert.doesNotMatch(app, /explicitAutoLayoutState === "failed" && explicitAutoLayoutFailureDiagnostic/);
  assert.match(app, /autoLayoutDiagnosticDetails/);
  assert.match(app, /autoLayoutDiagnosticWorkerDetails/);
  assert.match(app, /JSON\.stringify\(explicitAutoLayoutFailureDiagnostic\.workerDiagnostic, null, 2\)/);
  assert.doesNotMatch(app, /<details[^>]*\bopen\b/);
  assert.doesNotMatch(app, /explicit-auto-layout-diagnostic[^>]*role="status"/);
  assert.equal(translate("en", "autoLayoutDiagnosticDetails"), "Inspect the latest Auto Layout failure details");
  assert.equal(translate("ja", "autoLayoutDiagnosticDetails"), "直近の自動レイアウト失敗の詳細を確認");
});
