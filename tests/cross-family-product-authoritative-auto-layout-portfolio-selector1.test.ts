import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/cross-family-product-authoritative-auto-layout-portfolio-selector1/result-summary.json", "utf8"));

test("cross-family portfolio selector remains diagnostic and bounded", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.deepEqual(artifact.candidateFamilies, ["frontier", "post", "topology-aware-free-form-experiment1"]);
  assert.equal(artifact.rows.length, 7);
  assert.equal(artifact.rows.every((row: { candidateMaterializationCount: number; uniqueGeometryCount: number }) => row.candidateMaterializationCount === 3 && row.uniqueGeometryCount >= 1), true);
  assert.equal(artifact.aggregate.oracleProductEvaluations >= artifact.aggregate.selectorProductEvaluations, true);
  assert.equal(artifact.aggregate.avoidedProductEvaluations, 2);
  assert.equal(artifact.aggregate.duplicateGeometryReuseCount, 0);
  assert.equal(artifact.aggregate.metricParityMismatchCount > 0, true);
  assert.match(artifact.parityInterpretation, /freshly evaluated/);
  const dense = artifact.rows.find((row: { fixture: string }) => row.fixture === "dense-k7-7");
  assert.equal(dense.oracle.family, "free-form");
  assert.equal(dense.selector.family, "post");
  assert.equal(dense.selector.exactBest, false);
  assert.equal(dense.selector.meaningfulEquivalent, false);
  assert.equal(artifact.interpretationPending, true);
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.readiness.productIntegration, "HOLD");
  assert.equal(artifact.readiness.adaptiveCascade, "INACTIVE");
  assert.equal(artifact.readiness.initialLayoutReleaseBlocker, "OPEN");
});
