import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/quality-solver-benchmark1/benchmark-result-summary.json", "utf8"));

test("bounded quality benchmark compares candidate families against current Product authority", () => {
  assert.equal(summary.campaign.fixtureCount, 12);
  assert.equal(summary.campaign.operationCount, 39);
  assert.equal(summary.campaign.candidateFinalistBudget, 4);
  assert.equal(summary.campaign.screeningIsPostHocDiagnostic, true);
  assert.equal(summary.aggregate.successfulCandidateOperations, 26);
  assert.equal(summary.aggregate.maxCandidateCount, 22);
});

test("candidate geometry improves some Product-authoritative metrics but cheap screening has false negatives", () => {
  assert.equal(summary.aggregate.qualityImprovementCount, 24);
  assert.equal(summary.aggregate.topKRecallRate, 20 / 26);
  assert.equal(summary.aggregate.falseNegativeCount, 6);
  assert.ok(summary.aggregate.qualityImprovementCount > 0);
  assert.ok(summary.aggregate.falseNegativeCount > 0);
});

test("candidate generation is deterministic on representative canonical and dense controls", () => {
  assert.equal(summary.exactness.allRepeatChecksPass, true);
  assert.ok(summary.exactness.deterministicRepeatChecks.length >= 9);
  assert.ok(summary.exactness.deterministicRepeatChecks.every((check: { deterministic: boolean }) => check.deterministic));
});

test("quality solver remains diagnostic and does not advance Product adoption or Human Review", () => {
  assert.equal(summary.disposition.qualitySolverReadiness, "B: QUALITY SOLVER FAMILY PROMISING BUT SCREENING UNSOLVED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
  assert.equal(summary.disposition.adaptiveCascade, "INACTIVE");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
});
