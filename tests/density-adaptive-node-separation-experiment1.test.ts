import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/density-adaptive-node-separation-experiment1/result-summary.json", "utf8"));

test("density-adaptive separation artifact covers policy, density, pin, and Product evidence", () => {
  assert.equal(artifact.contract, "E2R-LIAISONSCAPE-DENSITY-ADAPTIVE-NODE-SEPARATION-EXPERIMENT1");
  assert.equal(artifact.classification, "C. MIXED / SPACING HELPS SOME PRESENTATION PRESSURE BUT DOES NOT CLOSE THE MAIN QUALITY GAP");
  assert.equal(artifact.noProductionBehaviorChange, true);
  assert.equal(artifact.rows.length, 5);
  assert.deepEqual(artifact.rows.map((row: { fixture: string }) => row.fixture), ["lighthouse-en", "apollo-11-en", "label-heavy-ja-10", "dense-k7-7", "parallel-self-loop-control"]);
  assert.deepEqual(Object.keys(artifact.policies), ["current-fixed", "larger-fixed", "density-adaptive"]);
  assert.equal(artifact.aggregate.allPolicyCandidatesPreservedAnchors, true);
  assert.equal(artifact.aggregate.denseCrossingFreeAdaptiveCases, 0);
  assert.ok(artifact.aggregate.cleanProductAdaptiveScoreImproved > 0);
  assert.ok(artifact.aggregate.cleanProductAdaptiveScoreWorsened > 0);
  for (const row of artifact.rows) {
    assert.equal(row.snapshot.nonEmpty, true);
    assert.equal(row.cases.length, 6);
    assert.ok(row.cases.every((item: { policies: Record<string, { allAnchorsPreserved: boolean }> }) => Object.values(item.policies).every((policy) => policy.allAnchorsPreserved)));
    assert.ok(row.cases.every((item: { policies: Record<string, { candidateCount: number; candidateGenerationMs: number; productEvaluationMs: number }> }) => Object.values(item.policies).every((policy) => policy.candidateCount > 0 && policy.candidateGenerationMs >= 0 && policy.productEvaluationMs >= 0)));
  }
});

test("density-adaptive experiment keeps viewport and production authority outside the policy", () => {
  assert.match(artifact.viewportBoundary, /not modified/);
  assert.match(artifact.productBoundary, /Product/);
  assert.equal(artifact.humanReview, "not started or reopened");
});
