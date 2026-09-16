import assert from "node:assert/strict";
import test from "node:test";
import artifact from "../experimental/product-node-label-hysteresis-recovery-attribution1/result-summary.json" with { type: "json" };

const arms = ["current-fresh", "current-previous", "hysteresis-ablation", "bounded-recovery", "drag-active", "drag-finalized"] as const;

test("Node-label hysteresis recovery artifact records bounded candidate attribution", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-NODE-LABEL-HYSTERESIS-RECOVERY-ATTRIBUTION-v1");
  assert.deepEqual(artifact.arms, arms);
  assert.equal(artifact.standing.productDefault, "HOLD");
  assert.equal(artifact.standing.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.standing.humanReview, "NOT READY");
  assert.equal(artifact.standing.initialLayoutReleaseBlocker, "OPEN");
  assert.equal(artifact.standing.adaptiveCascade, "NOT ENTERED");
  assert.equal(artifact.rows.length, 8);

  for (const row of artifact.rows as any[]) {
    assert.equal(row.fixedRelationPresentation, true);
    assert.equal(row.structuralPlacement, "unchanged");
    assert.equal(row.routingAuthority, "unchanged; routes are fixed during Node-label comparison");
    assert.equal(row.recovery.stableOnRepeatedDerivation, true);
    assert.equal(row.recovery.oscillationPattern, "none in repeated identical-input derivation");
    assert.ok(row.recovery.triggeredCount > 0);

    const freshLabels = JSON.stringify(row.arms["current-fresh"].labels);
    assert.equal(JSON.stringify(row.arms["hysteresis-ablation"].labels), freshLabels);
    assert.ok(row.arms["current-previous"].metrics.changedFromFresh > 0);
    assert.equal(row.arms["bounded-recovery"].metrics.changedFromFresh, 0);

    for (const arm of arms) {
      const decisions = row.arms[arm].decisions;
      assert.ok(decisions.length > 0);
      for (const decision of decisions) {
        assert.equal(decision.candidateCount, 32);
        assert.equal(decision.candidates.length, 32);
        assert.ok(decision.freshBest);
        assert.ok(decision.continuitySelected);
        assert.ok(decision.selectedCandidate);
        for (const candidate of decision.candidates) {
          assert.equal(typeof candidate.freshRank, "number");
          assert.equal(typeof candidate.continuityRank, "number");
          assert.equal(typeof candidate.hardSafe, "boolean");
          assert.equal(typeof candidate.yieldingRouteHardPressure, "number");
          assert.equal(typeof candidate.occupiedRelationLabelOverlap, "number");
          assert.equal(typeof candidate.occupiedNodeLabelOverlap, "number");
        }
      }
    }

    const active = row.arms["drag-active"].decisions.find((decision: any) => decision.activelyDragged);
    assert.ok(active);
    assert.equal(active.previousInput, false);
    assert.equal(row.arms["drag-active"].input.previousPlacementIgnored, true);
    assert.equal(row.arms["drag-finalized"].input.recoveryMode, true);
  }
});
