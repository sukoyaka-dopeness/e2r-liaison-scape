import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/infinite-canvas-local-density-extent-growth-rebaseline1/result-summary.json", "utf8"));

test("infinite-canvas re-baseline stays bounded and authority-neutral", () => {
  assert.equal(artifact.variantCount, 2);
  assert.equal(artifact.candidateCountBound, 2);
  assert.equal(artifact.viewportModel.layoutFitHardConstraint, false);
  assert.equal(artifact.productionMetricMutation, false);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.deepEqual(artifact.rows.map((row) => row.fixture), ["canonical", "dense", "label", "connected", "parallel", "self-loop"]);
});

test("extent growth reduces the single-connected geometry pressure without fit clamping", () => {
  const row = artifact.rows.find((candidate) => candidate.fixture === "connected")!;
  assert.ok(row.selectedInfiniteCanvas.quality.extent[0] > row.previousFitBounded.quality.extent[0]);
  assert.ok(row.selectedInfiniteCanvas.quality.extent[1] > row.previousFitBounded.quality.extent[1]);
  assert.ok(row.selectedInfiniteCanvas.visualRisk.totalLabelOverlapPairs < row.previousFitBounded.visualRisk.totalLabelOverlapPairs);
  assert.ok(row.selectedInfiniteCanvas.localDensity.labelBoundsOverlapPairs <= row.previousFitBounded.localDensity.labelBoundsOverlapPairs);
});

test("infinite-canvas does not claim to solve Product route/label ownership", () => {
  const row = artifact.rows.find((candidate) => candidate.fixture === "connected")!;
  assert.ok(row.selectedInfiniteCanvas.visualRisk.foreignRouteRelationLabelHits > 0);
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.initialLayoutReleaseBlocker, "OPEN");
});
