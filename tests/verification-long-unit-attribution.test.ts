import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/verification-long-unit-attribution1/browser-result-summary.json", "utf8"));

test("long-unit attribution retains historical outliers and does not justify micro-splitting", () => {
  assert.equal(summary.controls.length, 5);
  assert.deepEqual(summary.historicalOutliers.scheduledSlicesMs, [53.4, 83.9]);
  assert.ok(summary.aggregate.diagnosticsOff.maxWorkUnitMs < 16);
  assert.ok(summary.aggregate.diagnosticsOn.maxWorkUnitMs < 16);
  assert.equal(summary.disposition.authorityPreservingMicroSplit, "NOT_JUSTIFIED_BY_CURRENT_ATTRIBUTION");
});

test("long-unit attribution keeps Product-wide budget and adoption decisions open", () => {
  assert.equal(summary.disposition.productWideVerificationBudget, "NOT_ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
  assert.equal(summary.disposition.humanReview, "NOT_READY");
});
