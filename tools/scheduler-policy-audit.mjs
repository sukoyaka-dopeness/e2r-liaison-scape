import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "experimental", "scheduler-policy1", "prototype.mjs"), "utf8");
const summary = JSON.parse(fs.readFileSync(path.join(root, "experimental", "scheduler-policy1", "browser-result-summary.json"), "utf8"));
const requireValue = (condition, message) => { if (!condition) throw new Error(`scheduler policy audit: ${message}`); };
const policyIds = ["one-unit", "fixed-two", "elapsed-eight-ms", "hybrid-eight-ms-two-units"];

requireValue(summary.diagnosticOnly === true, "artifact must remain diagnostic-only");
requireValue(summary.controls.length === 5, "five browser controls are required");
requireValue(policyIds.every((id) => summary.policies[id]), "all scheduler policies must be present");
for (const id of policyIds) {
  const policy = summary.policies[id];
  for (const run of [policy.run1, policy.run2]) {
    requireValue(run.exactAll && run.allCompleted, `${id} must be exact-equivalent and complete`);
    requireValue(run.noPartialCancellation, `${id} cancellation must not expose partial output`);
  }
}
for (const marker of [
  "stepScheduledTurn",
  "maxWorkUnits",
  "maxWallMs",
  "soft-yield-target; current unit/batch may overshoot",
  "fail-closed-at-turn-boundary",
]) requireValue(source.includes(marker), `prototype marker missing: ${marker}`);
requireValue(summary.policies["elapsed-eight-ms"].run2.completeMaxElapsedMs < summary.policies["one-unit"].run2.completeMaxElapsedMs, "elapsed quota must improve observed completion wall time");
requireValue(summary.policies["elapsed-eight-ms"].run2.completeMaxOverheadMs < summary.policies["one-unit"].run2.completeMaxOverheadMs, "elapsed quota must reduce observed scheduler overhead");
requireValue(summary.policies["elapsed-eight-ms"].run2.completeMaxSchedulerStepMs > 8, "soft quota overshoot must remain observable");
requireValue(summary.previousFullVerificationEvidence.firstRunScheduledSliceOutliersMs.some((value) => value > 50), "previous over-50ms evidence must be preserved");
requireValue(summary.disposition.productWideVerificationBudget === "NOT_ESTABLISHED", "Product-wide budget must remain open");
requireValue(summary.disposition.mainThreadProductionCandidate === "NOT_ESTABLISHED", "main-thread production candidacy must remain open");
requireValue(summary.disposition.workerArchitecture === "NOT_DECIDED", "Worker architecture must remain undecided");
requireValue(summary.disposition.qualitySolver === "HOLD / NOT ESTABLISHED" && summary.disposition.productIntegration === "HOLD", "adoption flags must remain held");
requireValue(summary.disposition.adaptiveCascade === "INACTIVE" && summary.disposition.humanReview === "NOT READY" && summary.disposition.initialLayoutReleaseBlocker === "OPEN", "standing release flags must remain unchanged");

console.log(JSON.stringify({
  contract: summary.contract,
  controls: summary.controls.length,
  policies: policyIds,
  elapsedEightRun2: summary.policies["elapsed-eight-ms"].run2,
  previousOutliersMs: summary.previousFullVerificationEvidence.firstRunScheduledSliceOutliersMs,
  disposition: summary.disposition,
  result: "PASS",
}, null, 2));
