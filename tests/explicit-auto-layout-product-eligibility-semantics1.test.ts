import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/explicit-auto-layout-product-eligibility-semantics1/result-summary.json", "utf8"));

test("eligibility semantics artifact records predicate attribution and counterfactual views", () => {
  assert.equal(artifact.contract, "E2R-LIAISONSCAPE-EXPLICIT-AUTO-LAYOUT-PRODUCT-ELIGIBILITY-SEMANTICS1");
  assert.equal(artifact.fixtures.length, 5);
  assert.deepEqual(artifact.predicate.hardConditions, ["crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelNear20"]);
  assert.equal(artifact.aggregate.candidateComparisonCount, 30);
  assert.equal(artifact.aggregate.completeFiniteAll, true);
  assert.equal(artifact.aggregate.exactAnchorsAll, true);
  assert.ok(artifact.aggregate.failedPredicateCount > 0);
  assert.ok(artifact.aggregate.nonEmptyVsEmptyChanged > 0);
  assert.ok(artifact.aggregate.manualFieldsChangedOutcome >= 1);
  assert.match(artifact.predicate.interpretation, /not a demonstrated production/);
});

test("diagnostic preserves Product and Dataset authority", () => {
  assert.match(artifact.productionImpact, /No production source behavior/);
  assert.equal(artifact.humanReview, "not started or reopened");
  assert.equal(artifact.comparisonViews.manualAuthority, "manual presentation state is retained in primary evaluation and is not discarded by production code");
});
