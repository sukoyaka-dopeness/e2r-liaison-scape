import assert from "node:assert/strict";
import test from "node:test";
import artifact from "../experimental/product-node-label-recovery-lifecycle-source-parity1/result-summary.json" with { type: "json" };

test("Node-label recovery follows the normal bounded Product lifecycle seam", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-LIFECYCLE-SOURCE-PARITY-v1");
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.sourceParity.recoveryIntegration, "development-only nodeLabelRecoveryMode; omitted by normal Product callers");
  assert.deepEqual(artifact.sequenceOrder, ["clean", "identical", "identicalStable", "active", "move", "finalized", "relationChanged", "stableAfterRecovery", "stableAfterRecovery2", "stableAfterRecovery3", "manual", "reset"]);
  assert.equal(artifact.rows.length, 5);
  assert.equal(artifact.standing.productDefault, "HOLD");
  assert.equal(artifact.standing.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.standing.humanReview, "NOT READY");
  assert.equal(artifact.standing.initialLayoutReleaseBlocker, "OPEN");

  for (const row of artifact.rows as any[]) {
    assert.equal(row.controls.cleanThenIdenticalStable, true);
    assert.equal(row.controls.activeDraggedNodeSuppressed, true);
    assert.equal(row.controls.relationChangeObserved, true);
    assert.equal(row.controls.recoveryStableAfterPresentationChange, true);
    assert.equal(row.controls.recoveryOscillationAfterPresentationChange, false);
    assert.equal(row.controls.manualOffsetVisibleAndAuthoritative, true);
    assert.equal(row.controls.resetClearsPreviousInput, true);

    const clean = row.steps.clean;
    const identical = row.steps.identical;
    const stable = row.steps.stableAfterRecovery;
    const stable2 = row.steps.stableAfterRecovery2;
    assert.deepEqual(clean.passSnapshots.map((snapshot: any) => snapshot.pass), ["first", "feedback"]);
    assert.deepEqual(identical.passSnapshots.map((snapshot: any) => snapshot.pass), ["first", "feedback"]);
    assert.equal(stable.nodeFingerprint, stable2.nodeFingerprint);
    assert.equal(stable.relationFingerprint, stable2.relationFingerprint);
    assert.equal(stable.routeFingerprint, stable2.routeFingerprint);

    for (const traces of Object.values(row.traces) as any[]) {
      assert.ok(traces.length > 0);
      assert.deepEqual([...new Set(traces.map((trace: any) => trace.candidateCount))], [32]);
      for (const trace of traces) {
        assert.equal(typeof trace.freshBestFingerprint, "string");
        assert.equal(typeof trace.continuitySelectedFingerprint, "string");
        assert.equal(typeof trace.selectedFingerprint, "string");
        assert.equal(typeof trace.recoveryTriggered, "boolean");
      }
    }

    const activeTraces = row.traces.active.filter((trace: any) => trace.activeDragged);
    assert.equal(activeTraces.length, 1);
    assert.equal(activeTraces[0].recoveryReason, "active-drag-suppressed");
    assert.ok(row.traces.manual.some((trace: any) => trace.recoveryReason === "manual-offset-authoritative"));
  }

  assert.ok((artifact.rows as any[]).some((row) => row.traces.relationChanged.some((trace: any) => trace.recoveryTriggered)));
  assert.equal(artifact.primaryProductDerivedStaleCase.recoveryTriggered > 0, true);
  assert.deepEqual(artifact.primaryProductDerivedStaleCase.candidateCounts, [32]);
  assert.equal(artifact.primaryProductDerivedStaleCase.nextPreviousMatchesRecoveredOutput, true);
  assert.equal(artifact.primaryProductDerivedStaleCase.matchesPriorBoundedRecoveryOutput, false);
});
