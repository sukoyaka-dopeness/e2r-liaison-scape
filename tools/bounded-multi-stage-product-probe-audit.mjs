import fs from "node:fs";

const summary = JSON.parse(fs.readFileSync("experimental/bounded-multi-stage-product-probe1/benchmark-result-summary.json", "utf8"));
const required = (condition, message) => { if (!condition) throw new Error(message); };
const b0 = summary.budgets[0];
const b1 = summary.budgets[1];
const b2 = summary.budgets[2];

required(summary.contract === "LIAISONSCAPE-BOUNDED-MULTI-STAGE-PRODUCT-PROBE-v1", "wrong contract");
required(summary.diagnosticOnly === true, "artifact must remain diagnostic-only");
required(summary.architecture.normalFinalistBudget === 4, "normal finalist budget changed");
required(summary.architecture.probeBudgets.join(",") === "0,1,2", "probe budgets are incomplete");
required(b0.operationCount === 26 && b1.operationCount === 26 && b2.operationCount === 26, "operation count changed");
required(b0.exactBestHits === 24 && b0.meaningfulFalseNegativeCount === 2, "zero-probe baseline was not reproduced");
required(b1.exactBestHits === 26 && b1.meaningfulFalseNegativeCount === 0, "one-probe closure is missing");
required(b1.ambiguityProbeEvaluations === 3 && b1.totalProductEvaluations === 107, "one-probe accounting is not bounded as expected");
required(b2.ambiguityProbeEvaluations === 6 && b2.totalProductEvaluations === 110, "two-probe accounting is not bounded as expected");
required(b1.baselineImprovementRetention === 1 && b1.top3AnyRecall === 1, "Product retention signal regressed");
required(b1.deterministic === true && b2.deterministic === true, "selector is not deterministic");
required(b1.triggeredOperations === 3 && b1.usefulTriggers === 2 && b1.unnecessaryTriggers === 1, "gate trigger audit changed");
required(summary.falseTriggerAudit.canonicalTriggered === 0, "canonical control was probed unexpectedly");
required(summary.denseResults.some(({ fixture, arm, exactBest, meaningfulFalseNegative }) => fixture === "dense-k7-7" && arm === "frontier-adaptive-12" && exactBest && !meaningfulFalseNegative), "dense-k7-7 was not closed");
required(summary.denseResults.some(({ fixture, arm, exactBest, meaningfulFalseNegative }) => fixture === "dense-k5-9" && arm === "frontier-adaptive-12" && exactBest && !meaningfulFalseNegative), "dense-k5-9 was not closed");
required(summary.disposition.qualitySolver === "HOLD / NOT ESTABLISHED", "quality solver status changed");
required(summary.disposition.productIntegration === "HOLD", "Product integration status changed");
required(summary.disposition.productionProvider === "NOT ESTABLISHED", "provider status changed");
required(summary.disposition.humanReview === "NOT READY", "Human Review status changed");
required(summary.disposition.initialLayoutReleaseBlocker === "OPEN", "release blocker changed");
console.log("bounded multi-stage Product probe audit: PASS");
