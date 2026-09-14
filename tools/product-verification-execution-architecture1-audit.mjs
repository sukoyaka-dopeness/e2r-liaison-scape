import assert from "node:assert/strict";
import fs from "node:fs";

const artifact = JSON.parse(fs.readFileSync("experimental/product-verification-execution-architecture1/browser-result-summary.json", "utf8"));
assert.equal(artifact.selectedArchitecture.classification, "B. WORKER PRODUCT VERIFICATION ARCHITECTURE ESTABLISHED IN TESTED ENVELOPE");
assert.equal(artifact.results.length, 3);
for (const result of artifact.results) {
  assert.equal(result.exact.verifiedPresentationSignatures, true, result.id);
  assert.equal(result.exact.selectedFingerprint, true, result.id);
  assert.equal(result.exact.productMetrics, true, result.id);
  assert.equal(result.worker.maxMainThreadSliceMs < result.baseline.maxMainThreadSliceMs, true, result.id);
}
assert.equal(artifact.cancellation.worker.status, "cancelled");
assert.equal(artifact.cancellation.worker.resultExposed, false);
assert.equal(artifact.cancellation.worker.resultReceived, false);
assert.equal(artifact.failureSemantics.partialResultExposed, false);
assert.equal(artifact.determinism.repeatedWorkerCanonicalFingerprintEqual, true);
assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
console.log(JSON.stringify({ status: "PASS", classification: artifact.selectedArchitecture.classification, dense: artifact.results.find(({ id }) => id === "dense"), cancellation: artifact.cancellation.worker }, null, 2));
