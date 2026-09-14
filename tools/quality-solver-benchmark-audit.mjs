import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const summary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "experimental", "quality-solver-benchmark1", "benchmark-result-summary.json"), "utf8"));

assert.equal(summary.contract, "LIAISONSCAPE-BOUNDED-QUALITY-SOLVER-BENCHMARK-v1");
assert.equal(summary.diagnosticOnly, true);
assert.equal(summary.campaign.fixtureCount, 12);
assert.equal(summary.campaign.operationCount, 39);
assert.equal(summary.campaign.candidateFinalistBudget, 4);
assert.equal(summary.aggregate.successfulCandidateOperations, 26);
assert.equal(summary.aggregate.topKRecallRate, 20 / 26);
assert.equal(summary.aggregate.falseNegativeCount, 6);
assert.equal(summary.aggregate.qualityImprovementCount, 24);
assert.equal(summary.exactness.allRepeatChecksPass, true);
assert.equal(summary.disposition.qualitySolverReadiness, "B: QUALITY SOLVER FAMILY PROMISING BUT SCREENING UNSOLVED");
assert.equal(summary.disposition.productIntegration, "HOLD");
assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
assert.equal(summary.disposition.humanReview, "NOT READY");
console.log("quality-solver-benchmark audit: PASS");
