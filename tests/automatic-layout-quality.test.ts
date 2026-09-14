import assert from "node:assert/strict";
import test from "node:test";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";

test("HQ research quality aggregation is pure, complete, and deterministic", () => {
  const nodes = [{ id: "a", label: "日本語の長いラベル", description: "" }, { id: "b", label: "Long English label", description: "" }, { id: "c", label: "C", description: "" }];
  const edges = [{ id: "ab", sourceId: "a", targetId: "b", label: "relates to", parallelIndex: 0, parallelCount: 1 }, { id: "ca", sourceId: "c", targetId: "a", label: "関連", parallelIndex: 0, parallelCount: 1 }];
  const positions = { a: { x: 0, y: 0 }, b: { x: 260, y: 0 }, c: { x: 130, y: 180 } };
  const presentation = deriveBoundedAutomaticPresentation({ graph: { nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [], previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const first = deriveAutomaticLayoutQualityMetrics({ nodes, edges, positions, presentation });
  const second = deriveAutomaticLayoutQualityMetrics({ nodes, edges, positions, presentation });
  assert.deepEqual(first, second);
  for (const key of ["score", "crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelCorridorDeficit", "fitScale"]) assert.equal(key in first, true, key);
  assert.equal(Object.keys(positions).length, 3);
});
