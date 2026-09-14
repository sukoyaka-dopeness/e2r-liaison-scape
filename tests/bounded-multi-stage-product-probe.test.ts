import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/bounded-multi-stage-product-probe1/benchmark-result-summary.json", "utf8"));

test("one bounded Product probe closes the two prior dense meaningful misses", () => {
  assert.equal(summary.budgets[0].exactBestHits, 24);
  assert.equal(summary.budgets[0].meaningfulFalseNegativeCount, 2);
  assert.equal(summary.budgets[1].exactBestHits, 26);
  assert.equal(summary.budgets[1].meaningfulFalseNegativeCount, 0);
  assert.equal(summary.budgets[1].top3AnyRecall, 1);
  assert.equal(summary.budgets[1].baselineImprovementRetention, 1);
  assert.equal(summary.budgets[1].ambiguityProbeEvaluations, 3);
  assert.equal(summary.budgets[1].totalProductEvaluations, 107);
  assert.equal(summary.budgets[1].avoidedProductEvaluations, 204);
});

test("the graph-derived gate catches both prior misses and one difficult control without fixture identity", () => {
  const dense = new Map(summary.denseResults.map(({ fixture, arm, gate }: { fixture: string; arm: string; gate: { triggered: boolean } }) => [`${fixture}|${arm}`, gate.triggered]));
  assert.equal(dense.get("dense-k7-7|frontier-adaptive-12"), true);
  assert.equal(dense.get("dense-k5-9|frontier-adaptive-12"), true);
  assert.equal(dense.get("dense-k6-8|frontier-adaptive-12"), true);
  assert.equal(dense.get("dense-k7-7-minus-one|frontier-adaptive-12"), false);
  assert.equal(summary.falseTriggerAudit.canonicalTriggered, 0);
  assert.equal(summary.budgets[1].triggeredOperations, 3);
  assert.equal(summary.budgets[1].usefulTriggers, 2);
  assert.equal(summary.budgets[1].unnecessaryTriggers, 1);
});

test("two probes add cost without improving the one-probe result", () => {
  assert.equal(summary.budgets[2].exactBestHits, summary.budgets[1].exactBestHits);
  assert.equal(summary.budgets[2].meaningfulFalseNegativeCount, 0);
  assert.equal(summary.budgets[2].ambiguityProbeEvaluations, 6);
  assert.ok(summary.budgets[2].measuredProductPresentationMs > summary.budgets[1].measuredProductPresentationMs);
  assert.equal(summary.budgets[2].deterministic, true);
});

test("the multi-stage checkpoint stays diagnostic and preserves Product authority", () => {
  assert.equal(summary.architecture.normalFinalistBudget, 4);
  assert.equal(summary.architecture.probeBudgets.join(","), "0,1,2");
  assert.match(summary.architecture.selectionRule, /Product-authoritative/);
  assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
  assert.equal(summary.disposition.actualProductVisualEvaluation, "NOT READY");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
  assert.equal(summary.deterministic.samePoolAndSelector, true);
});
