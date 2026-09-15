import fs from "node:fs";

const artifact = JSON.parse(fs.readFileSync("experimental/occupied-geometry-feasibility-first-extent-growth1/result-summary.json", "utf8"));
const expected = new Set(["canonical", "dense", "label", "connected", "parallel", "self-loop"]);
if (artifact.contract !== "LIAISONSCAPE-OCCUPIED-GEOMETRY-FEASIBILITY-FIRST-EXTENT-GROWTH-v1") throw new Error("unexpected contract");
if (artifact.variantCount !== 3 || artifact.candidateCountBound !== 3) throw new Error("unexpected bounded variant count");
if (artifact.occupiedGeometry.clearanceMargin !== 0 || artifact.occupiedGeometry.routeCorridorHardConstraint) throw new Error("occupied geometry contract widened beyond bounded overlap");
if (artifact.extentGrowth.fitHardConstraint || artifact.productionMetricMutation || artifact.productAuthoritiesChanged) throw new Error("viewport or Product authority changed");
if (artifact.rows.length !== expected.size || artifact.rows.some(({ fixture }) => !expected.has(fixture))) throw new Error("fixture coverage mismatch");
for (const row of artifact.rows) {
  if (row.probes.length !== 3) throw new Error(`${row.fixture}: probe count mismatch`);
  if (!row.probes.every((probe) => probe.formulation.geometrySource.length === 3 && probe.formulation.clearanceMargin === 0)) throw new Error(`${row.fixture}: formulation contract mismatch`);
}
for (const fixture of ["canonical", "parallel", "self-loop"]) {
  const row = artifact.rows.find(({ fixture: candidate }) => candidate === fixture);
  if (!row.selectedOccupiedGeometry.occupied.hardFeasible) throw new Error(`${fixture}: control lost occupied feasibility`);
}
const connected = artifact.rows.find(({ fixture }) => fixture === "connected");
if (connected.selectedOccupiedGeometry.occupied.totalOccupiedOverlaps >= connected.baseline.occupied.totalOccupiedOverlaps) throw new Error("connected occupied geometry did not improve");
if (connected.selectedOccupiedGeometry.occupied.nodeBodyNodeBody !== 0) throw new Error("connected Node body overlap remains");
if (connected.selectedOccupiedGeometry.visualRisk.foreignRouteRelationLabelHits >= connected.baseline.visualRisk.foreignRouteRelationLabelHits) throw new Error("connected route/label residual did not improve");
if (connected.selectedOccupiedGeometry.occupied.hardFeasible) throw new Error("connected hard-feasibility boundary was not exposed");
console.log(JSON.stringify({ contract: artifact.contract, fixtures: artifact.rows.length, variants: artifact.variantCount, connected: { occupied: connected.selectedOccupiedGeometry.occupied, visualLabelOverlap: connected.selectedOccupiedGeometry.visualRisk.totalLabelOverlapPairs, foreignRouteHits: connected.selectedOccupiedGeometry.visualRisk.foreignRouteRelationLabelHits, extent: connected.selectedOccupiedGeometry.extent }, authoritiesUnchanged: !artifact.productionMetricMutation && !artifact.productAuthoritiesChanged }, null, 2));
