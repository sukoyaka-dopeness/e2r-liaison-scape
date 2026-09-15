import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/occupied-geometry-feasibility-first-extent-growth1/result-summary.json", "utf8"));

test("occupied-geometry feedback is bounded and authority-neutral", () => {
  assert.equal(artifact.variantCount, 3);
  assert.equal(artifact.candidateCountBound, 3);
  assert.equal(artifact.occupiedGeometry.clearanceMargin, 0);
  assert.equal(artifact.occupiedGeometry.routeCorridorHardConstraint, false);
  assert.equal(artifact.extentGrowth.fitHardConstraint, false);
  assert.equal(artifact.productionMetricMutation, false);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.deepEqual(artifact.rows.map((row) => row.fixture), ["canonical", "dense", "label", "connected", "parallel", "self-loop"]);
});

test("occupied geometry improves dense and single-connected feasibility signals", () => {
  for (const fixture of ["dense", "label", "connected"]) {
    const row = artifact.rows.find((candidate) => candidate.fixture === fixture)!;
    assert.ok(row.selectedOccupiedGeometry.occupied.totalOccupiedOverlaps < row.baseline.occupied.totalOccupiedOverlaps);
  }
  const connected = artifact.rows.find((candidate) => candidate.fixture === "connected")!;
  assert.equal(connected.selectedOccupiedGeometry.occupied.nodeBodyNodeBody, 0);
  assert.ok(connected.selectedOccupiedGeometry.visualRisk.foreignRouteRelationLabelHits < connected.baseline.visualRisk.foreignRouteRelationLabelHits);
});

test("single-connected occupied feasibility remains an explicit boundary", () => {
  const row = artifact.rows.find((candidate) => candidate.fixture === "connected")!;
  assert.equal(row.selectedOccupiedGeometry.occupied.hardFeasible, false);
  assert.ok(row.selectedOccupiedGeometry.occupied.relationLabelNodeBody > 0 || row.selectedOccupiedGeometry.occupied.nodeLabelRelationLabel > 0 || row.selectedOccupiedGeometry.occupied.relationLabelRelationLabel > 0);
  assert.equal(artifact.readiness.routeLabelOwnership, "OPEN");
  assert.equal(artifact.readiness.humanReview, "NOT READY");
});
