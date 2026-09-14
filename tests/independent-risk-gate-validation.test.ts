import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/independent-risk-gate-validation1/benchmark-result-summary.json", "utf8"));

test("candidate-generation index is a real target dependency", () => {
  assert.equal(summary.original.exactBestHits, 26);
  assert.equal(summary.generationIndexPerturbed.exactBestHits, 24);
  assert.equal(summary.generationIndexPerturbed.meaningfulFalseNegativeCount, 2);
  assert.equal(summary.orderDifferences.length, 3);
  assert.ok(summary.orderDifferences.some(({ fixture }: { fixture: string }) => fixture === "dense-k7-7"));
  assert.ok(summary.orderDifferences.some(({ fixture }: { fixture: string }) => fixture === "dense-k5-9"));
});

test("family and fingerprint ordering is order-stable but does not close the old dense misses", () => {
  assert.equal(summary.stableOriginal.exactBestHits, 24);
  assert.equal(summary.stableOriginal.meaningfulFalseNegativeCount, 2);
  assert.equal(summary.stablePerturbed.exactBestHits, 24);
  assert.equal(summary.stablePerturbed.meaningfulFalseNegativeCount, 2);
  assert.equal(summary.targetRules.productMetricLeakage, false);
});

test("independent synthetic controls expose gate misses without fixture-specific rescue", () => {
  assert.equal(summary.controls.independentOperationCount, 8);
  assert.deepEqual(summary.controls.independentGraphFamilies.sort(), [
    "independent-dense-near-threshold",
    "independent-dense-transpose",
    "independent-dense-wide",
    "independent-edge-perturbation",
  ]);
  assert.equal(summary.independentIndex.meaningfulFalseNegativeCount, 2);
  assert.equal(summary.independentStable.meaningfulFalseNegativeCount, 2);
});

test("independent checkpoint remains diagnostic and does not advance adoption", () => {
  assert.equal(summary.disposition.classification, "C. ORDER DEPENDENCY CONFIRMED / TARGET RULE NOT ESTABLISHED");
  assert.equal(summary.disposition.riskGateReadiness, "OPEN");
  assert.equal(summary.disposition.probeTargetReadiness, "NOT ESTABLISHED");
  assert.equal(summary.disposition.multiStageSelector, "DIAGNOSTICALLY BOUNDED / TARGET OR GATE OPEN");
  assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
});
