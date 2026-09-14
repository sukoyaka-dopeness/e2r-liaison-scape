import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const summary = JSON.parse(fs.readFileSync(path.join(root, "experimental", "verification-long-slice-reproduction1", "browser-result-summary.json"), "utf8"));

assert.equal(summary.contract, "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-HISTORICAL-LONG-SLICE-REPRODUCTION-v1");
assert.equal(summary.campaign.reloadCycles, 3);
assert.equal(summary.campaign.controls, 5);
assert.equal(summary.campaign.attributionRuns, 60);
assert.equal(summary.equivalence.semanticEquivalent, true);
assert.equal(summary.equivalence.diagnosticsOnTraceEquivalent, true);
assert.equal(summary.aggregate.maxTurnMs, 16.2);
assert.equal(summary.aggregate.maxSourceStepSumMs, 16.2);
assert.equal(summary.aggregate.maxSchedulerGapMs, 0.1);
assert.equal(summary.aggregate.outlierTurnsAt50ms, 0);
assert.equal(summary.controls.find(({ id }) => id === "dense-k7-7").outlier.classification, "B");
assert.equal(summary.historicalOutlierAttribution.reproducedWithinBoundedCampaign, false);
assert.equal(summary.historicalOutlierAttribution.classification, "E");
assert.equal(summary.disposition.authorityPreservingMicroSplit, "NOT_JUSTIFIED");
assert.equal(summary.disposition.productWideVerificationBudget, "NOT_ESTABLISHED");

console.log("verification-long-slice-reproduction audit: PASS");
