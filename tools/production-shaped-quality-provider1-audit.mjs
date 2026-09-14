import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const provider = JSON.parse(fs.readFileSync(path.join(root, "experimental", "production-shaped-quality-provider1", "provider-result-summary.json"), "utf8"));
const browser = JSON.parse(fs.readFileSync(path.join(root, "experimental", "production-shaped-quality-provider1", "browser-result-summary.json"), "utf8"));

assert.equal(provider.aggregate.operationCount, 34);
assert.equal(provider.aggregate.completed, 34);
assert.equal(provider.aggregate.failClosed, 0);
assert.equal(provider.semanticEquivalence.allMatch, true);
assert.equal(provider.cancellation.resultExposed, false);
assert.equal(provider.budgetExhaustion.resultExposed, false);
assert.equal(browser.determinism.repeatedCanonicalResultEqual, true);
assert.equal(browser.cancellation.resultExposed, false);
assert.equal(browser.budgetExhaustion.resultExposed, false);
assert.equal(browser.cases.find((item) => item.id === "dense")?.maxMainThreadSliceMs > 50, true);
assert.equal(browser.disposition.productionProvider, "NOT ESTABLISHED");
console.log(JSON.stringify({ provider: "PASS", browser: "PASS", denseMainThreadSliceMs: browser.cases.find((item) => item.id === "dense")?.maxMainThreadSliceMs, disposition: browser.disposition }, null, 2));
