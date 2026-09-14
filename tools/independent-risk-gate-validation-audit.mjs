import fs from "node:fs";

const summary = JSON.parse(fs.readFileSync("experimental/independent-risk-gate-validation1/benchmark-result-summary.json", "utf8"));
const required = (condition, message) => { if (!condition) throw new Error(message); };

required(summary.contract === "LIAISONSCAPE-INDEPENDENT-RISK-GATE-TARGET-STABILITY-v1", "wrong contract");
required(summary.diagnosticOnly === true, "artifact must remain diagnostic-only");
required(summary.targetRules.productMetricLeakage === false, "target rule leaked Product metrics");
required(summary.original.operationCount === 26 && summary.original.exactBestHits === 26, "original one-probe closure was not reproduced");
required(summary.generationIndexPerturbed.exactBestHits === 24 && summary.generationIndexPerturbed.meaningfulFalseNegativeCount === 2, "generation-order perturbation did not expose the dependency");
required(summary.orderDifferences.length === 3, "expected order-dependent dense operations were not exposed");
required(summary.stableOriginal.exactBestHits === 24 && summary.stableOriginal.meaningfulFalseNegativeCount === 2, "stable candidate rule unexpectedly closed the historical dense misses");
required(summary.stablePerturbed.exactBestHits === summary.stableOriginal.exactBestHits, "stable rule changed under candidate order perturbation");
required(summary.controls.independentOperationCount === 8, "independent control count changed");
required(summary.independentIndex.meaningfulFalseNegativeCount === 2, "independent controls did not test gate misses");
required(summary.independentStable.meaningfulFalseNegativeCount === 2, "stable rule silently improved independent controls");
required(summary.disposition.classification === "C. ORDER DEPENDENCY CONFIRMED / TARGET RULE NOT ESTABLISHED", "classification changed unexpectedly");
required(summary.disposition.riskGateReadiness === "OPEN", "risk-gate readiness should remain open");
required(summary.disposition.probeTargetReadiness === "NOT ESTABLISHED", "target readiness should remain open");
required(summary.disposition.qualitySolver === "HOLD / NOT ESTABLISHED", "quality solver status changed");
required(summary.disposition.productIntegration === "HOLD", "Product integration status changed");
required(summary.disposition.humanReview === "NOT READY", "Human Review status changed");
required(summary.disposition.initialLayoutReleaseBlocker === "OPEN", "release blocker changed");
console.log("independent risk-gate / target stability audit: PASS");
