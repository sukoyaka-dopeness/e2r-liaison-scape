import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "graph-presentation.ts"), "utf8");
const prototype = fs.readFileSync(path.join(root, "experimental", "full-verification1", "prototype.mjs"), "utf8");
const summary = JSON.parse(fs.readFileSync(path.join(root, "experimental", "full-verification1", "browser-result-summary.json"), "utf8"));
const requireValue = (condition, message) => { if (!condition) throw new Error(`full verification resumable audit: ${message}`); };

for (const symbol of [
  "initializeAutomaticPresentationVerification",
  "requestAutomaticPresentationVerificationCancellation",
  "stepAutomaticPresentationVerification",
  "completeAutomaticPresentationVerification",
  "runAutomaticPresentationVerification",
]) requireValue(source.includes(`export function ${symbol}`), `source export missing: ${symbol}`);

for (const marker of [
  "label-free-route",
  "finalize",
  "partialProductCommit: false",
]) requireValue(prototype.includes(marker), `prototype contract marker missing: ${marker}`);

for (const marker of [
  "initialize-first-route",
  "initialize-first-relation-label",
  "initialize-first-node-label",
  "prepare-feedback",
  "initialize-feedback-route",
  "initialize-feedback-relation-label",
  "initialize-feedback-node-label",
]) requireValue(source.includes(`\"${marker}\"`), `source phase marker missing: ${marker}`);

const latest = summary.runs.find(({ id }) => id === "run-3-cooperative-completion");
requireValue(latest && latest.cases.length === 5, "latest browser run must contain five controls");
requireValue(latest.cases.every((item) => item.status === "completed"), "all latest controls must complete");
requireValue(latest.cases.every((item) => item.semanticEquivalent && item.traceEquivalent), "all latest controls must be exact-equivalent");
requireValue(latest.cases.every((item) => item.partialResultExposed === false), "completed runs must not expose partial Product results");
requireValue(latest.cases.every((item) => item.cooperativeCancel.status === "cancelled" && item.cooperativeCancel.partialProductResultExposed === false), "cancellation must fail closed");
requireValue(latest.cases.every((item) => item.cooperativeComplete.status === "completed" && item.cooperativeComplete.partialProductResultExposed === false), "cooperative completion must finalize without partial result");
requireValue(summary.disposition.resumableSeam === "ESTABLISHED", "resumable seam disposition must remain established");
requireValue(summary.disposition.preferred16msSlice === "NOT_UNIFORM", "preferred slice must not be overclaimed");
requireValue(summary.disposition.diagnostic50msCeiling === "NOT_ESTABLISHED_PRODUCT_WIDE", "50ms product-wide ceiling must remain open");
requireValue(summary.disposition.productWideBudget === "NOT_ESTABLISHED", "Product-wide budget must remain open");
requireValue(summary.disposition.productIntegration === "HOLD" && summary.disposition.qualitySolver === "HOLD / NOT ESTABLISHED", "adoption flags must remain held");
requireValue(summary.disposition.productionProvider === "NOT ESTABLISHED" && summary.disposition.adaptiveCascade === "INACTIVE", "provider and Adaptive flags must remain unchanged");
requireValue(summary.disposition.humanReview === "NOT READY" && summary.disposition.initialLayoutReleaseBlocker === "OPEN", "release flags must remain blocked");
requireValue(summary.runs.some(({ observations }) => observations?.maxScheduledSliceMs?.longLabel > 50 || observations?.maxScheduledSliceMs?.dense > 50), "earlier outlier evidence must be preserved");

console.log(JSON.stringify({
  contract: summary.contract,
  controls: latest.cases.length,
  exactEquivalent: latest.cases.every((item) => item.semanticEquivalent && item.traceEquivalent),
  cancellationFailClosed: latest.cases.every((item) => item.cooperativeCancel.partialProductResultExposed === false),
  latestDenseMaxSchedulerStepMs: latest.cases.find(({ id }) => id === "dense-k7-7").cooperativeComplete.maxSchedulerStepMs,
  latestDenseElapsedMs: latest.cases.find(({ id }) => id === "dense-k7-7").cooperativeComplete.elapsedMs,
  disposition: summary.disposition,
  result: "PASS",
}, null, 2));
