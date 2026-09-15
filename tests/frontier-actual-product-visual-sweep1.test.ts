import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const artifact = JSON.parse(fs.readFileSync("experimental/frontier-actual-product-visual-sweep1/result-summary.json", "utf8"));

test("Frontier visual sweep materializes the bounded public and stress matrix", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.ok(artifact.rows.length >= 14);
  for (const row of artifact.rows) {
    assert.equal(row.status, "materialized");
    assert.ok(row.graph.nodes > 0);
    assert.ok(row.candidateCount > 0);
    assert.match(row.selectedPositionFingerprint, /^[0-9a-f]{12}$/);
    assert.equal(row.selectedFamily?.startsWith("structural-frontier"), true);
  }
});

test("Frontier visual sweep preserves standing holds", () => {
  assert.equal(artifact.classification, "MATERIALIZED / VISUAL SWEEP PENDING");
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
});
