import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = path.join(root, "experimental", "route-selection-accumulator1", "browser-result-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

assert.equal(summary.diagnosticOnly, true);
assert.equal(summary.cases.length, 5);
for (const item of summary.cases) {
  assert.equal(item.status, "completed", item.id);
  assert.equal(item.semanticEquivalent, true, item.id);
  assert.equal(item.acceptedPrefixLength, item.orderedEdgeCount, item.id);
  assert.equal(item.initializeOverBudget, false, item.id);
  assert.deepEqual(item.overBudgetSteps, [], item.id);
  assert.ok(item.initializeMs <= summary.budgetTargetsMs.preferredInteractiveSlice, item.id);
  assert.ok(item.maxStepMs <= summary.budgetTargetsMs.preferredInteractiveSlice, item.id);
  assert.equal(item.cooperative.status, "cancelled", item.id);
  assert.equal(item.cooperative.partialProductResultExposed, false, item.id);
}

const source = fs.readFileSync(path.join(root, "src", "graph-presentation.ts"), "utf8");
assert.match(source, /export function initializeAutomaticRouteSelection/);
assert.match(source, /export function stepAutomaticRouteSelection/);
assert.match(source, /while \(!state\.done\) stepAutomaticRouteSelection\(state\)/);

console.log("route-accumulator-semantically-equivalent-and-browser-bounded");
