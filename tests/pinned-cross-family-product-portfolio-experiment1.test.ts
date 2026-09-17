import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/pinned-cross-family-product-portfolio-experiment1/result-summary.json", "utf8"));

test("pinned cross-family portfolio artifact covers current families and exact pins", () => {
  assert.equal(artifact.contract, "E2R-LIAISONSCAPE-PINNED-CROSS-FAMILY-PRODUCT-PORTFOLIO-EXPERIMENT1");
  assert.equal(artifact.classification, "C. PORTFOLIO HELPS SELECT CASES / GENERAL RELEASE-QUALITY BENEFIT NOT ESTABLISHED");
  assert.equal(artifact.noProductionBehaviorChange, true);
  assert.equal(artifact.rows.length, 5);
  assert.deepEqual(artifact.rows.map((row: { fixture: string }) => row.fixture), ["lighthouse-en", "apollo-11-en", "label-heavy-ja-10", "dense-k7x7-bipartite", "parallel-self-loop-control"]);
  assert.deepEqual(Object.keys(artifact.candidateFamilies.included), ["0", "1", "2"]);
  assert.equal(artifact.candidateFamilies.excluded[0].id, "post");
  assert.equal(artifact.aggregate.exactAnchorPreservation, true);
  assert.equal(artifact.aggregate.deterministicCandidateReplay, true);
  for (const row of artifact.rows) {
    assert.equal(row.cases.length, 4);
    for (const item of row.cases) {
      assert.ok(item.candidateCount > 0);
      assert.ok(item.candidates.every((candidate: { anchorsPreserved: boolean; fingerprint: string }) => candidate.anchorsPreserved && candidate.fingerprint.length > 0));
      assert.ok(item.generationMs >= 0 && item.productEvaluationMs >= 0);
      assert.ok(item.portfolioWinner);
    }
  }
});

test("portfolio keeps Product and persistence authority outside the diagnostic", () => {
  assert.match(artifact.productBoundary, /current Product/);
  assert.match(artifact.productBoundary, /Dataset, persistence, dirty-state/);
  assert.equal(artifact.humanReview, "not started or reopened");
  assert.match(artifact.candidateFamilies.excluded[0].reason, /pin-aware generator/);
});
