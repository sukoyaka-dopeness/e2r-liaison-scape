import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const summary = JSON.parse(fs.readFileSync(path.join(root, "experimental", "verification-scaling-envelope1", "browser-result-summary.json"), "utf8"));

assert.equal(summary.contract, "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-VERIFICATION-SCALING-ENVELOPE-v1");
assert.equal(summary.diagnosticOnly, true);
assert.deepEqual(summary.campaign.familiesMeasured, ["sparse", "dense", "parallel", "label-heavy", "self-loop", "mixed"]);
assert.equal(summary.campaign.cases, 18);
assert.equal(summary.exact.semanticEquivalent, 18);
assert.equal(summary.exact.schedulerTraceEquivalent, 18);
assert.equal(summary.sourceScaling.preferred16msExceeded.length, 1);
assert.deepEqual(summary.sourceScaling.preferred16msExceeded, ["dense-large"]);
assert.deepEqual(summary.sourceScaling.diagnostic50msExceeded, []);
assert.equal(summary.supportedEnvelope.maxNodes, 24);
assert.equal(summary.supportedEnvelope.maxEdges, 80);
assert.equal(summary.disposition.authorityPreservingMicroSplit, "NO_NEW_MICRO_SPLIT_JUSTIFIED");
assert.equal(summary.disposition.qualitySolver, "HOLD / NOT ESTABLISHED");
assert.equal(summary.disposition.productIntegration, "HOLD");
assert.equal(summary.disposition.productionProvider, "NOT ESTABLISHED");
assert.equal(summary.disposition.humanReview, "NOT READY");
console.log("verification-scaling-envelope audit: PASS");
