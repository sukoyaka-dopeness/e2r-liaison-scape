import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-presentation-local-spacing-parallel-label-self-loop-refinement1/result-summary.json", import.meta.url), "utf8"));

test("local Product presentation refinement artifact remains bounded and diagnostic-only", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.positionPolicy, "retain-current-topology-and-ordering; bounded-alpha-beta-local-displacement-only");
  assert.deepEqual(artifact.candidates.map(({ id }: { id: string }) => id), ["current", "local-spacing-1.15", "local-spacing-1.30"]);
  assert.deepEqual(artifact.candidates.map(({ alphaBetaDistance }: { alphaBetaDistance: number }) => alphaBetaDistance), [173, 198.95, 224.89999999999998]);
  assert.equal(artifact.rows.length, 12);
  assert.equal(artifact.selfLoopProbes.length, 12);
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.productDefault, "HOLD");
  for (const row of artifact.rows) {
    assert.equal(row.quality.crossings, 0);
    assert.ok(Number.isFinite(row.metrics.routeMedian));
    assert.ok(Number.isFinite(row.metrics.viewport.postNodeFitCenterOffset.x));
    assert.ok(Number.isFinite(row.metrics.viewport.postNodeFitCenterOffset.y));
  }
});
