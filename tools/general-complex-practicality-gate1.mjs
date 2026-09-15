import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { createPracticalityCases, positionsFor } from "../experimental/general-complex-practicality-gate1/fixture.ts";

function evaluate(item, phase) {
  const runs = [];
  let last = null;
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const placementStarted = performance.now();
    const positions = positionsFor(item, phase);
    const placementMs = performance.now() - placementStarted;
    const presentationStarted = performance.now();
    const presentation = deriveBoundedAutomaticPresentation({
      graph: item.graph,
      positions,
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      provisionalNodeLabels: [],
      previousNodeLabelPlacements: new Map(),
      previousRelationLabelPlacements: new Map(),
      manualNodeLabelOffsets: new Map(),
      manualRelationLabelAnchors: new Map(),
      feedbackEnabled: true,
    });
    const presentationMs = performance.now() - presentationStarted;
    const metrics = deriveAutomaticLayoutQualityMetrics({ nodes: item.graph.nodes, edges: item.graph.edges, positions, presentation });
    last = { id: item.id, description: item.description, phase, placementMs, presentationMs, totalMs: placementMs + presentationMs, fitScale: metrics.fitScale, extent: metrics.extent, overlapPairs: metrics.overlapPairs, crossings: metrics.crossings, labelRouteHits: metrics.labelRouteHits, labelOverlap: metrics.labelOverlap, finitePositions: Object.values(positions).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) };
    runs.push(last.totalMs);
  }
  return { ...last, medianTotalMs: [...runs].sort((a, b) => a - b)[1], repeats: runs.map((value) => Number(value.toFixed(3))) };
}

const rows = createPracticalityCases().flatMap((item) => [evaluate(item, "fast"), evaluate(item, "hq")]);
const artifact = {
  contract: "GENERAL-COMPLEX-DATASET-PRACTICALITY-GATE1-v1",
  diagnosticOnly: true,
  sourceBoundary: "Fast is the current three-iteration settleInitialPlacement path. HQ is the existing explicit solveAutoLayout source with 12 iterations. Both use the current Product-authoritative presentation and quality metric code; no provider or Product default is changed.",
  matrix: createPracticalityCases().map(({ id, description, dataset }) => ({ id, description, nodes: dataset.entities.length, relations: dataset.relations.length, coordinateLess: dataset.extensions === undefined })),
  rows,
  budget: { repeatsPerPhase: 3, phaseBound: "fixed source path; Node diagnostic timing, not a browser SLA" },
  disposition: { actualProductFast: "requires browser smoke", actualProductHq: "requires browser smoke", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" },
};
fs.writeFileSync("experimental/general-complex-practicality-gate1/result-summary.json", JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify(artifact, null, 2));
