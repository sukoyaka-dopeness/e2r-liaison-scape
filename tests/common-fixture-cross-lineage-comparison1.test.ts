import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const artifact = JSON.parse(fs.readFileSync("experimental/common-fixture-cross-lineage-comparison1/result-summary.json", "utf8"));

test("common-fixture cross-lineage artifact binds every candidate to one topology digest", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.equal(artifact.productionMetricMutation, false);
  assert.ok(artifact.rows.length >= 4);
  for (const row of artifact.rows) {
    assert.match(row.topologyDigest, /^[0-9a-f]{16}$/);
    assert.ok(row.graph.nodes > 0);
    assert.ok(row.candidates.fast.positions);
    assert.ok(row.candidates.structural.length >= 3);
    assert.ok(row.candidates.labelCapacity.positions);
    assert.ok(row.candidates.infiniteCanvas.positions);
    assert.ok(row.candidates.occupiedGeometry.positions);
  }
});

test("common-fixture comparison remains diagnostic and keeps standing holds", () => {
  assert.equal(artifact.classification, "COMMON-FIXTURE-MATERIALIZED / PENDING-INTERPRETATION");
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.readiness.productIntegration, "HOLD");
});
