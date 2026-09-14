import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/bounded-screening-finalist-recall1/benchmark-result-summary.json", "utf8"));
const comparison = (name: string, budget: number) => summary.comparisons.find(({ formulation }: { formulation: string }) => formulation === name).budgets[budget];

test("screening study reproduces the previous top-4 recall without adding solver families", () => {
  assert.equal(summary.campaign.operationCount, 39);
  assert.equal(summary.campaign.successfulCandidateOperations, 26);
  assert.deepEqual(summary.campaign.arms, ["direct-current", "structural-native-v3", "frontier-adaptive-12", "structural-native-discrete"]);
  assert.equal(summary.exactness.currentBaselineReproduced, true);
  assert.equal(comparison("current-scalar", 4).exactBestHits, 20);
});

test("lexicographic top-4 improves exact recall and retains every oracle baseline improvement", () => {
  const proposed = summary.selectedDiagnosticFormulation;
  assert.equal(proposed.formulation, "lexicographic");
  assert.equal(proposed.top4.exactBestHits, 24);
  assert.equal(proposed.top4.top3AnyRecall, 1);
  assert.equal(proposed.top4.baselineImprovementRetention, 1);
  assert.equal(proposed.top4.meaningfulFalseNegativeCount, 2);
  assert.ok(proposed.top4.maxScreeningMs < 10);
});

test("dense permutation-equivalent geometry remains a cheap-only recall boundary", () => {
  assert.deepEqual(summary.remainingFalseNegativeAudit.map(({ fixture }: { fixture: string }) => fixture).sort(), ["dense-k5-9", "dense-k7-7"]);
  assert.ok(summary.remainingFalseNegativeAudit.every(({ cheapFeatureEquivalent }: { cheapFeatureEquivalent: boolean }) => cheapFeatureEquivalent));
  assert.equal(summary.subgroupAudit.canonical.exactBestRecall, 1);
  assert.equal(summary.subgroupAudit.dense.exactBestRecall, 0.8);
  assert.equal(comparison("lexicographic", 6).exactBestHits, 24);
});

test("Pareto and family diversity do not justify Product adoption", () => {
  assert.ok(comparison("pareto-diverse", 4).exactBestHits < comparison("lexicographic", 4).exactBestHits);
  assert.ok(comparison("hybrid-risk-diverse", 4).exactBestHits < comparison("lexicographic", 4).exactBestHits);
  assert.equal(summary.exactness.deterministic, true);
  assert.equal(summary.disposition.classification, "B. RECALL IMPROVED BUT NOT CLOSED");
  assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
});
