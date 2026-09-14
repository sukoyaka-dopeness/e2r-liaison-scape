import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const summary = JSON.parse(fs.readFileSync(path.join(root, "experimental", "verification-long-unit-attribution1", "browser-result-summary.json"), "utf8"));
assert.equal(summary.contract, "LIAISONSCAPE-PRODUCT-AUTHORITATIVE-VERIFICATION-LONG-UNIT-ATTRIBUTION-v1");
assert.equal(summary.controls.length, 5);
assert.equal(summary.semanticEquivalent, "true for every control and every attribution run");
assert.deepEqual(summary.historicalOutliers.scheduledSlicesMs, [53.4, 83.9]);
assert.equal(summary.disposition.authorityPreservingMicroSplit, "NOT_JUSTIFIED_BY_CURRENT_ATTRIBUTION");
assert.equal(summary.disposition.productWideVerificationBudget, "NOT_ESTABLISHED");
console.log("verification-long-unit-attribution audit: PASS");
