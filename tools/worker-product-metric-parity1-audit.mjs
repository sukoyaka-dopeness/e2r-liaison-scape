import assert from "node:assert/strict";
import fs from "node:fs";

const result = JSON.parse(fs.readFileSync("experimental/worker-product-metric-parity1/result-summary.json", "utf8"));
assert.equal(result.classification, "D. WORKER PRODUCT PARITY ESTABLISHED / VISUAL EVALUATION INCONCLUSIVE");
assert.equal(result.authority.previousWorkerMetric, "diagnostic-only substitution");
assert.equal(result.browserCampaign.verifiedCandidates, 28);
assert.equal(result.browserCampaign.presentationMismatches, 0);
assert.equal(result.browserCampaign.selectedMetricMismatches, 0);
assert.equal(result.browserCampaign.selectedFingerprintMismatches, 0);
assert.equal(result.browserCampaign.workerCancellation.resultExposed, false);
assert.equal(result.readiness.productionProvider, "NOT ESTABLISHED");
assert.equal(result.readiness.humanReview, "NOT READY");
console.log(JSON.stringify({ status: "PASS", classification: result.classification }, null, 2));
