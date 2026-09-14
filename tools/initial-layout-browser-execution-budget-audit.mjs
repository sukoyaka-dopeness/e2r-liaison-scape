import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "experimental", "execution-budget-browser1");
const summaryPath = path.join(root, "browser-result-summary.json");
const harnessPath = path.join(root, "main.ts");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const harness = fs.readFileSync(harnessPath, "utf8");

const requiredCases = ["canonical-lighthouse-en", "dense-k7-7", "parallel-pressure", "long-label-pressure", "self-loop-pressure"];
const caseIds = summary.cases.map((item) => item.id);
const required = (condition, message) => {
  if (!condition) throw new Error(`execution budget audit: ${message}`);
};

required(summary.diagnosticOnly === true, "summary must remain diagnostic-only");
required(requiredCases.every((id) => caseIds.includes(id)), "all browser cases must be present");
required(summary.sourceBoundary.productVerification.includes("current source"), "Product verification boundary is missing");
required(summary.workerCancellation?.requested === true, "Worker cancellation probe is missing");
required(summary.lifecycleBrowserEvidence?.oldGenerationOutcome?.status === "stale", "stale lifecycle evidence is missing");
required(harness.includes("deriveBoundedAutomaticPresentation"), "harness must use current Product presentation authority");
required(harness.includes("new Worker"), "harness must include Worker transport evidence");
required(!harness.includes("../src/App"), "harness must not import Product UI authority");

const dense = summary.cases.find((item) => item.id === "dense-k7-7");
const hybridStillBlocks = dense.hybrid.maxMainThreadSliceMs > 50;
const conclusion = hybridStillBlocks
  ? "worker-proposal-supported-but-main-thread-verification-budget-not-established"
  : "hybrid-budget-candidate";

console.log(JSON.stringify({
  contract: summary.contract,
  cases: caseIds.length,
  workerCancellation: summary.workerCancellation,
  denseHybridMaxMainThreadSliceMs: dense.hybrid.maxMainThreadSliceMs,
  conclusion,
}, null, 2));
