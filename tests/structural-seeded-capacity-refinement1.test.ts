import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const artifact = JSON.parse(fs.readFileSync("experimental/structural-seeded-capacity-refinement1/result-summary.json", "utf8"));

test("structural-seeded refinement uses common-fixture topology and bounded stages", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.equal(artifact.productionMetricMutation, false);
  assert.equal(artifact.primarySeed, "Frontier");
  assert.equal(artifact.qualityReference, "Post");
  assert.ok(artifact.rows.length >= 4);
  for (const row of artifact.rows) {
    assert.match(row.topologyDigest, /^[0-9a-f]{16}$/);
    assert.equal(row.seeds.length, 2);
    for (const seed of row.seeds) {
      assert.ok(seed.seed.positions);
      assert.ok(seed.labelCapacity.candidateCount <= 3);
      assert.ok(seed.infiniteCanvas.candidateCount <= 1);
      assert.ok(seed.occupiedGeometry.candidateCount <= 3);
      if (seed.labelCapacity.selected) assert.equal(seed.labelCapacity.selected.invariants.orderingChanges, 0);
      if (seed.infiniteCanvas.selected) assert.equal(seed.infiniteCanvas.selected.invariants.orderingChanges, 0);
      if (seed.occupiedGeometry.selected) assert.equal(seed.occupiedGeometry.selected.invariants.orderingChanges, 0);
    }
  }
});

test("refinement keeps adoption and review holds", () => {
  assert.equal(artifact.classification, "STRUCTURAL-SEEDED REFINEMENT / PENDING-INTERPRETATION");
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
});
