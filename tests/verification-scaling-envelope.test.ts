import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = JSON.parse(readFileSync("experimental/verification-scaling-envelope1/browser-result-summary.json", "utf8"));

test("verification scaling envelope covers bounded workload families with exact equivalence", () => {
  assert.equal(summary.campaign.cases, 18);
  assert.equal(summary.campaign.families, 6);
  assert.equal(summary.campaign.levels, 3);
  assert.equal(summary.exact.semanticEquivalent, 18);
  assert.equal(summary.exact.schedulerTraceEquivalent, 18);
  assert.equal(summary.caseSummary.length, 18);
});

test("dense-large is the only tested preferred-16ms phase-transition exception", () => {
  assert.deepEqual(summary.sourceScaling.preferred16msExceeded, ["dense-large"]);
  assert.deepEqual(summary.sourceScaling.diagnostic50msExceeded, []);
  assert.equal(summary.sourceScaling.largestSourceStep.phase, "initialize-first-node-label / initialize-feedback-node-label");
  assert.equal(summary.supportedEnvelope.maxDiagnosticsOffSchedulerGapMs, 0.1);
});

test("the result declares a tested envelope, not an arbitrary-size guarantee", () => {
  assert.equal(summary.supportedEnvelope.maxNodes, 24);
  assert.equal(summary.supportedEnvelope.maxEdges, 80);
  assert.equal(summary.disposition.unboundedGuarantee, "NOT_ESTABLISHED");
  assert.equal(summary.disposition.mainThread, "VIABLE_WITHIN_TESTED_ENVELOPE; DENSE-LARGE NODE-LABEL TRANSITION EXCEEDS PREFERRED 16MS");
});

test("scaling checkpoint does not adopt a solver, provider, or Product integration", () => {
  assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(summary.disposition.productIntegration, "HOLD");
  assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
  assert.equal(summary.disposition.adaptiveCascade, "INACTIVE");
  assert.equal(summary.disposition.humanReview, "NOT READY");
  assert.equal(summary.disposition.initialLayoutReleaseBlocker, "OPEN");
});
