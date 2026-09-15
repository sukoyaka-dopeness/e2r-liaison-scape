import fs from "node:fs";

const artifact = JSON.parse(fs.readFileSync("experimental/infinite-canvas-local-density-extent-growth-rebaseline1/result-summary.json", "utf8"));
const required = new Set(["canonical", "dense", "label", "connected", "parallel", "self-loop"]);
if (artifact.contract !== "LIAISONSCAPE-INFINITE-CANVAS-LOCAL-DENSITY-EXTENT-GROWTH-REBASELINE-v1") throw new Error("unexpected contract");
if (artifact.variantCount !== 2 || artifact.candidateCountBound !== 2) throw new Error("unbounded or missing variant count");
if (artifact.viewportModel.layoutFitHardConstraint !== false) throw new Error("viewport fit remained a layout hard constraint");
if (artifact.productionMetricMutation || artifact.productAuthoritiesChanged) throw new Error("production authority changed");
if (artifact.rows.length !== required.size || artifact.rows.some(({ fixture }) => !required.has(fixture))) throw new Error("fixture coverage mismatch");
for (const row of artifact.rows) {
  if (row.probes.length !== 2) throw new Error(`${row.fixture}: probe count mismatch`);
  if (row.selectedInfiniteCanvas.formulation.growthPolicy !== "label-demand expansion without viewport fit clamp") throw new Error(`${row.fixture}: growth policy mismatch`);
  if (!Number.isFinite(row.selectedInfiniteCanvas.screenAudit.overviewFitScale)) throw new Error(`${row.fixture}: missing overview diagnostic`);
  if (row.selectedInfiniteCanvas.localDensity.labelBoundsOverlapPairs > row.previousFitBounded.localDensity.labelBoundsOverlapPairs && row.fixture === "connected") throw new Error(`${row.fixture}: growth increased hard node-label overlap`);
}
const connected = artifact.rows.find(({ fixture }) => fixture === "connected");
if (connected.selectedInfiniteCanvas.visualRisk.foreignRouteRelationLabelHits <= 0) throw new Error("connected routing/label residual was not exposed");
console.log(JSON.stringify({ contract: artifact.contract, fixtures: artifact.rows.length, variants: artifact.variantCount, connected: { extent: connected.selectedInfiniteCanvas.quality.extent, overviewFitScale: connected.selectedInfiniteCanvas.screenAudit.overviewFitScale, labelOverlap: connected.selectedInfiniteCanvas.visualRisk.totalLabelOverlapPairs, foreignRouteHits: connected.selectedInfiniteCanvas.visualRisk.foreignRouteRelationLabelHits }, authoritiesUnchanged: !artifact.productionMetricMutation && !artifact.productAuthoritiesChanged }, null, 2));
