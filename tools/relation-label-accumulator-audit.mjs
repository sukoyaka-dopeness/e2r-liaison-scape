import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = path.join(root, "experimental", "relation-label-accumulator1", "browser-result-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

assert.equal(summary.diagnosticOnly, true);
assert.equal(summary.cases.length, 5);
for (const item of summary.cases) {
  for (const [pass, result] of Object.entries(item.passes)) {
    assert.equal(result.semanticEquivalent, true, `${item.id}/${pass}`);
    assert.equal(result.traceEquivalent, true, `${item.id}/${pass}`);
    assert.deepEqual(result.overBudgetSteps, [], `${item.id}/${pass}`);
    assert.ok(result.initializeMs <= summary.budgetTargetsMs.diagnosticCeiling, `${item.id}/${pass}`);
    assert.ok(result.maxStepMs <= summary.budgetTargetsMs.diagnosticCeiling, `${item.id}/${pass}`);
  }
  assert.equal(item.cooperative.status, "cancelled", item.id);
  assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
}

const source = fs.readFileSync(path.join(root, "src", "graph-presentation.ts"), "utf8");
assert.match(source, /export function initializeAutomaticRelationLabelPlacement/);
assert.match(source, /export function stepAutomaticRelationLabelPlacement/);
assert.match(source, /while \(!state\.done\) stepAutomaticRelationLabelPlacement\(state\)/);

console.log("relation-label-accumulator-equivalent-and-under-observed-diagnostic-ceiling");
