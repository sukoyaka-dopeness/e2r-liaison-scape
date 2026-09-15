import assert from "node:assert/strict";
import test from "node:test";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";

test("visual-risk diagnostics distinguish all label overlap classes and foreign-route ownership", () => {
  const positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  const label = { x: 50, y: 0, width: 40, height: 20 };
  const presentation = {
    routedEdges: [
      { id: "owner", sourceId: "a", targetId: "b", samples: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] },
      { id: "foreign", sourceId: "a", targetId: "b", samples: [{ x: 0, y: 1 }, { x: 50, y: 1 }, { x: 100, y: 1 }] },
    ],
    nodeLabels: new Map([["a", label], ["b", label]]),
    relationLabels: new Map([["owner", label], ["foreign", label]]),
    feedbackApplied: false,
  } as never;
  const metrics = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  assert.equal(metrics.nodeNodeOverlapPairs, 1);
  assert.equal(metrics.nodeRelationOverlapPairs, 4);
  assert.equal(metrics.relationRelationOverlapPairs, 1);
  assert.equal(metrics.foreignRouteRelationLabelHits, 2);
  assert.equal(metrics.ownershipAmbiguityCount, 2);
  assert.equal(metrics.totalLabelOverlapPairs, 6);
});
