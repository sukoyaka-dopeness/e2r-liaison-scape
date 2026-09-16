import assert from "node:assert/strict";
import test from "node:test";
import artifact from "../experimental/product-node-label-recovery-integration1/result-summary.json" with { type: "json" };

test("Node-label recovery integration remains production-shaped and bounded", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-INTEGRATION-FEASIBILITY-v1");
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.defaultEnabled, false);
  assert.equal(artifact.integration.mode, "product-candidate");
  assert.equal(artifact.integration.AppPropRequired, false);
  assert.equal(artifact.integration.normalCallerUsesPreviousRef, true);
  assert.equal(artifact.integration.diagnosticPreviousOverrideUsed, false);
  assert.equal(artifact.integration.normalFeedbackPolicy, "App default feedback; no diagnosticFeedbackEnabled override");
  assert.equal(artifact.formulation.movementCoefficient, "distance * 4 unchanged");
  assert.equal(artifact.rows.length, 5);
  assert.equal(artifact.standing.productDefault, "HOLD");
  assert.equal(artifact.standing.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.standing.humanReview, "NOT READY");
  assert.equal(artifact.standing.initialLayoutReleaseBlocker, "OPEN");

  for (const row of artifact.rows as any[]) {
    assert.equal(row.candidate.controls.cleanThenIdenticalStable, true);
    assert.equal(row.candidate.controls.activeDraggedNodeSuppressed, true);
    assert.equal(row.candidate.controls.relationChangeObserved, true);
    assert.equal(row.candidate.controls.recoveryStableAfterPresentationChange, true);
    assert.equal(row.candidate.controls.recoveryOscillationAfterPresentationChange, false);
    assert.equal(row.candidate.controls.manualOffsetVisibleAndAuthoritative, true);
    assert.equal(row.candidate.controls.resetClearsPreviousInput, true);
    assert.equal(row.candidate.controls.candidateCountBounded, true);
    assert.equal(row.outputDifference.clean, false);
    assert.equal(row.outputDifference.identical, false);
    assert.equal(row.outputDifference.settled, true);

    for (const traces of Object.values(row.candidate.steps).map((step: any) => step.recovery)) {
      assert.deepEqual(traces.candidateCounts, [32]);
    }
    for (const performanceCase of Object.values(row.performance) as any[]) {
      assert.equal(performanceCase.candidateEvaluationDelta, 0);
      assert.ok(Number.isFinite(performanceCase.recoveryComparisonMs));
      assert.ok(performanceCase.recoveryComparisonMs >= 0);
      assert.ok(performanceCase.productCandidate.candidateEvaluations > 0);
    }
  }

  assert.equal(artifact.primaryProductDerivedStaleCase.recoveryTriggered, 3);
  assert.deepEqual(artifact.primaryProductDerivedStaleCase.candidateCounts, [32]);
  assert.equal(artifact.primaryProductDerivedStaleCase.nextPreviousMatchesRecoveredOutput, true);
  assert.equal(artifact.performanceGate.candidateEvaluationDeltaMustBeZero, true);
});
