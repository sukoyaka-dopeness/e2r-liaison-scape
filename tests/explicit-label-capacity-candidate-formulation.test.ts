import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/explicit-label-capacity-candidate-formulation-probe1/result-summary.json", "utf8"));

describe("explicit label-capacity candidate formulation probe", () => {
  it("keeps the experiment bounded and authority-neutral", () => {
    assert.equal(artifact.variantCount, 3);
    assert.equal(artifact.globalScalingOnly, false);
    assert.equal(artifact.productionMetricMutation, false);
    assert.equal(artifact.productAuthoritiesChanged, false);
    assert.ok(artifact.rows.every((row) => row.probes.length === 3));
  });

  it("creates capacity diversity in both difficult fixtures", () => {
    for (const fixture of ["dense", "label"]) {
      const row = artifact.rows.find((candidate) => candidate.fixture === fixture)!;
      assert.ok(row.probeBest.capacityAudit.medianNearestNodeCenterDistance > row.currentSelected.capacityAudit.medianNearestNodeCenterDistance);
      assert.ok(row.probeBest.visualRisk.totalLabelOverlapPairs < row.currentSelected.visualRisk.totalLabelOverlapPairs);
    }
  });
});
