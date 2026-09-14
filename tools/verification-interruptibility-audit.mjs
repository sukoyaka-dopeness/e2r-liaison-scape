import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "experimental", "verification-interruptibility1");
const summary = JSON.parse(fs.readFileSync(path.join(root, "browser-result-summary.json"), "utf8"));
const prototype = fs.readFileSync(path.join(root, "prototype.mjs"), "utf8");
const requiredCases = ["canonical-lighthouse-en", "dense-k7-7", "parallel-pressure", "long-label-pressure", "self-loop-pressure"];
const requireValue = (condition, message) => { if (!condition) throw new Error(`verification interruptibility audit: ${message}`); };

requireValue(summary.diagnosticOnly === true, "evidence must remain diagnostic-only");
requireValue(requiredCases.every((id) => summary.cases.some((item) => item.id === id)), "all control cases must be present");
requireValue(summary.cases.every((item) => item.status === "completed"), "whole-pass staged runs must complete");
requireValue(summary.cases.every((item) => item.cooperative.status === "cancelled" && item.cooperative.partialResultExposed === false), "cancellation must not expose partial Product output");
requireValue(summary.cases.some((item) => item.id === "dense-k7-7" && item.maxStageMs > summary.budgetPolicyProbe.diagnosticFailureThresholdMs), "dense over-budget stage evidence is required");
requireValue(prototype.includes("deriveAutomaticRoutes") && prototype.includes("deriveAutomaticRelationLabels") && prototype.includes("deriveAutomaticNodeLabels"), "prototype must use existing Product-owned stage functions");
requireValue(prototype.includes("partial-interruptibility-only"), "classification must remain explicit");

console.log(JSON.stringify({
  contract: summary.contract,
  cases: summary.cases.length,
  denseMaxStageMs: summary.cases.find((item) => item.id === "dense-k7-7").maxStageMs,
  classification: summary.status.classification,
  conclusion: "semantic-stage-seam-supported-but-intra-stage-interruptibility-not-established",
}, null, 2));
