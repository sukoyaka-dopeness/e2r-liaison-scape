import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/bounded-label-capacity-screen-ownership-refinement1/result-summary.json", "utf8"));

test("screen/ownership refinement stays bounded and authority-neutral", () => {
  assert.equal(artifact.variantCount, 3);
  assert.equal(artifact.candidateCountBound, 3);
  assert.equal(artifact.globalScalingOnly, false);
  assert.equal(artifact.productionMetricMutation, false);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.ok(artifact.rows.every((row) => row.probes.length === 3));
});

test("multi-component fixtures expose useful bounded capacity signal", () => {
  for (const fixture of ["dense", "label"]) {
    const row = artifact.rows.find((candidate) => candidate.fixture === fixture)!;
    assert.ok(row.probeBest.screenAudit.fitScale >= row.fitBudget);
    assert.ok(row.probeBest.visualRisk.totalLabelOverlapPairs < row.currentSelected.visualRisk.totalLabelOverlapPairs || row.probeBest.visualRisk.foreignRouteRelationLabelHits < row.currentSelected.visualRisk.foreignRouteRelationLabelHits);
  }
});

test("single connected control remains open under the joint gate", () => {
  const row = artifact.rows.find((candidate) => candidate.fixture === "connected")!;
  assert.equal(row.graph.components, 1);
  assert.equal(row.jointlySafeVariantCount, 0);
  assert.ok(row.probeBest.visualRisk.foreignRouteRelationLabelHits > row.currentSelected.visualRisk.foreignRouteRelationLabelHits || row.probeBest.screenAudit.fitScale < row.fitBudget);
});
