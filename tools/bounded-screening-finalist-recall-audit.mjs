import assert from "node:assert/strict";
import fs from "node:fs";

const summary = JSON.parse(fs.readFileSync("experimental/bounded-screening-finalist-recall1/benchmark-result-summary.json", "utf8"));
const current = summary.comparisons.find(({ formulation }) => formulation === "current-scalar").budgets[4];
const proposed = summary.selectedDiagnosticFormulation.top4;

assert.equal(summary.contract, "LIAISONSCAPE-BOUNDED-SCREENING-FINALIST-RECALL1-v1");
assert.equal(summary.diagnosticOnly, true);
assert.equal(summary.campaign.operationCount, 39);
assert.equal(summary.campaign.successfulCandidateOperations, 26);
assert.equal(summary.exactness.currentBaselineReproduced, true);
assert.equal(current.exactBestHits, 20);
assert.equal(proposed.exactBestHits, 24);
assert.equal(proposed.top3AnyRecall, 1);
assert.equal(proposed.meaningfulFalseNegativeCount, 2);
assert.equal(proposed.baselineImprovementRetention, 1);
assert.equal(proposed.maxFinalistEvaluations, 4);
assert.equal(proposed.maxOracleEvaluations, 22);
assert.ok(proposed.maxScreeningMs < 10);
assert.ok(proposed.evaluationReduction > 0.65);
assert.ok(proposed.estimatedPresentationReduction > 0.65);
assert.deepEqual(summary.remainingFalseNegativeAudit.map(({ fixture }) => fixture).sort(), ["dense-k5-9", "dense-k7-7"]);
assert.ok(summary.remainingFalseNegativeAudit.every(({ cheapFeatureEquivalent }) => cheapFeatureEquivalent));
assert.equal(summary.subgroupAudit.canonical.exactBestRecall, 1);
assert.equal(summary.subgroupAudit.dense.exactBestRecall, 0.8);
assert.equal(summary.exactness.deterministic, true);
assert.equal(summary.disposition.classification, "B. RECALL IMPROVED BUT NOT CLOSED");
assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
assert.equal(summary.disposition.productIntegration, "HOLD");
assert.equal(summary.disposition.humanReview, "NOT READY");
assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");

console.log("bounded screening finalist recall audit: PASS");
