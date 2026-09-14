import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const summary = JSON.parse(fs.readFileSync("experimental/boundary-equivalence-class-product-completion1/benchmark-result-summary.json", "utf8"));
const aggregate = (policy: string) => summary.policies[policy].aggregate;

test("full boundary completion closes old and independent controls within the measured envelope", () => {
  const result = aggregate("full-boundary");
  assert.equal(result.operationCount, 34);
  assert.equal(result.exactBestHits, 34);
  assert.equal(result.top3AnyHits, 34);
  assert.equal(result.meaningfulFalseNegativeCount, 0);
  assert.equal(result.baselineImprovementRetention, 1);
  assert.equal(result.maxExtraEvaluations, 8);
  assert.equal(result.p95ExtraEvaluations, 8);
  assert.equal(result.totalProductEvaluations, 182);
  assert.equal(result.avoidedProductEvaluations, 238);
  assert.equal(result.failClosedOperations, 0);
});

test("capped boundary completion exposes the recall/cost tradeoff", () => {
  assert.equal(aggregate("capped-boundary-2").meaningfulFalseNegativeCount, 4);
  assert.equal(aggregate("capped-boundary-4").meaningfulFalseNegativeCount, 2);
  assert.equal(aggregate("capped-boundary-6").meaningfulFalseNegativeCount, 1);
  assert.equal(aggregate("capped-boundary-6").maxExtraEvaluations, 6);
});

test("boundary completion is order-invariant while the previous index target is not", () => {
  assert.equal(summary.orderAudit["density-one-index"].invariant, false);
  assert.equal(summary.orderAudit["density-one-index"].differences.length, 4);
  assert.equal(summary.orderAudit["full-boundary"].invariant, true);
  assert.equal(summary.orderAudit["capped-boundary-2"].invariant, true);
  assert.equal(summary.orderAudit["capped-boundary-4"].invariant, true);
  assert.equal(summary.orderAudit["capped-boundary-6"].invariant, true);
});

test("cheap-equivalent classes retain material Product variance without leakage", () => {
  assert.equal(summary.classVariance.length, 7);
  assert.ok(Math.max(...summary.classVariance.map((entry: { crossingRange: number }) => entry.crossingRange)) >= 30);
  assert.ok(summary.architecture.stableCapPolicy.includes("no candidate-generation index"));
  assert.ok(summary.architecture.stableCapPolicy.includes("no Product metric"));
});

test("boundary completion remains diagnostic and preserves adoption holds", () => {
  assert.equal(summary.disposition.classification, "A. BOUNDARY CLASS COMPLETION ESTABLISHED WITH ACCEPTABLE COST");
  assert.equal(summary.disposition.fullCompletion, "QUALITY CLOSED IN TESTED SET");
  assert.equal(summary.disposition.cappedCompletion, "NOT CLOSED");
  assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.actualProductVisualEvaluation, "NOT READY");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
});
