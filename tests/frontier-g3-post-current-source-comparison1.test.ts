import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const artifact = JSON.parse(fs.readFileSync("experimental/frontier-g3-post-current-source-comparison1/result-summary.json", "utf8"));

test("Frontier, G3, and Post are materialized on the same current-source fixture rows", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.equal(artifact.rows.length, 7);
  for (const row of artifact.rows) {
    assert.deepEqual(Object.keys(row.candidates).sort(), ["frontier", "g3", "post"]);
    for (const candidate of Object.values(row.candidates) as Array<Record<string, unknown>>) {
      assert.match(String(candidate.source), /current-source/);
      assert.ok(Number(candidate.candidateCount) > 0);
      assert.ok(Number(candidate.evaluationCount) > 0);
      assert.match(String(candidate.selectedPositionFingerprint), /^[0-9a-f]{12}$/);
      assert.ok(candidate.positions && typeof candidate.positions === "object");
    }
    assert.equal(row.candidates.frontier.lineage, "frontier-12");
    assert.equal(row.candidates.g3.lineage, "global-placement3");
    assert.equal(row.candidates.post.lineage, "post");
  }
});

test("Comparison remains diagnostic and preserves standing holds", () => {
  assert.equal(artifact.interpretationPending, true);
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.readiness.productIntegration, "HOLD");
  assert.equal(artifact.readiness.initialLayoutReleaseBlocker, "OPEN");
});
