import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = path.join(root, "experimental", "node-label-accumulator1", "browser-result-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

assert.equal(summary.diagnosticOnly, true);
assert.equal(summary.cases.length, 5);
for (const item of summary.cases) {
  for (const [pass, result] of Object.entries(item.passes)) {
    assert.equal(result.semanticEquivalent, true, `${item.id}/${pass}`);
    assert.equal(result.traceEquivalent, true, `${item.id}/${pass}`);
    assert.ok(result.initializeMs <= summary.budgetTargetsMs.preferredInteractiveSlice, `${item.id}/${pass}`);
    assert.ok(result.maxStepMs <= summary.budgetTargetsMs.preferredInteractiveSlice, `${item.id}/${pass}`);
  }
  assert.equal(item.cooperative.status, "cancelled", item.id);
  assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
}

const source = fs.readFileSync(path.join(root, "src", "graph-presentation.ts"), "utf8");
assert.match(source, /export function initializeAutomaticNodeLabelPlacement/);
assert.match(source, /export function stepAutomaticNodeLabelPlacement/);
assert.match(source, /while \(!state\.done\) stepAutomaticNodeLabelPlacement\(state\)/);

console.log("node-label-accumulator-equivalent-and-under-observed-interactive-reference");
