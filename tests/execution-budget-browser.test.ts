import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve("experimental/execution-budget-browser1");
const harness = fs.readFileSync(path.join(root, "main.ts"), "utf8");
const summary = JSON.parse(fs.readFileSync(path.join(root, "browser-result-summary.json"), "utf8"));

test("browser execution budget harness preserves Product and lifecycle boundaries", () => {
  assert.match(harness, /deriveBoundedAutomaticPresentation/);
  assert.match(harness, /new Worker/);
  assert.match(harness, /beginOperation/);
  assert.doesNotMatch(harness, /\.\.\/src\/App/);
  assert.equal(summary.diagnosticOnly, true);
  assert.equal(summary.cases.length, 5);
  assert.equal(summary.workerCancellation.messageReceived, false);
  assert.equal(summary.lifecycleBrowserEvidence.oldGenerationOutcome.status, "stale");
});

test("dense evidence fails the proposed single-slice main-thread target", () => {
  const dense = summary.cases.find((item: { id: string }) => item.id === "dense-k7-7");
  assert.ok(dense);
  assert.ok(dense.hybrid.maxMainThreadSliceMs > 50);
  assert.equal(summary.status.qualitySolver, "HOLD / NOT ESTABLISHED");
});
