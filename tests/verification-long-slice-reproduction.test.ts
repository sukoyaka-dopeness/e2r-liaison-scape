import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/verification-long-slice-reproduction1/browser-result-summary.json", "utf8"));

test("historical long slices are tested with bounded same-run attribution", () => {
  assert.equal(summary.campaign.reloadCycles, 3);
  assert.equal(summary.campaign.controls, 5);
  assert.equal(summary.campaign.attributionRuns, 60);
  assert.deepEqual(summary.campaign.historicalSlicesMs, [49.7, 53.4, 83.9]);
  assert.equal(summary.historicalOutlierAttribution.reproducedWithinBoundedCampaign, false);
});

test("current source-step evidence distinguishes phase transition from scheduler gap", () => {
  assert.equal(summary.aggregate.maxTurnMs, summary.aggregate.maxSourceStepSumMs);
  assert.ok(summary.aggregate.maxSchedulerGapMs < 1);
  assert.equal(summary.aggregate.outlierTurnsAt50ms, 0);
  assert.equal(summary.controls.find(({ id }) => id === "dense-k7-7").outlier.kind, "phase-transition");
  assert.equal(summary.controls.find(({ id }) => id === "dense-k7-7").outlier.schedulerGapMs, 0);
});

test("same-run semantics and diagnostics-on traces remain exact", () => {
  assert.equal(summary.equivalence.semanticChecks, summary.equivalence.semanticPasses);
  assert.equal(summary.equivalence.diagnosticsOnTraceChecks, summary.equivalence.diagnosticsOnTracePasses);
  assert.equal(summary.disposition.authorityPreservingMicroSplit, "NOT_JUSTIFIED");
  assert.equal(summary.disposition.productWideVerificationBudget, "NOT_ESTABLISHED");
});
