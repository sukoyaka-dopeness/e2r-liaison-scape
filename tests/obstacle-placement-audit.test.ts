import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("obstacle placement audit uses authoritative routes and generic local moves", () => {
  const output = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "tools/generic-crossing-search.mjs",
    "experimental/product-evaluation-seam/actual-inspection/apollo-11-product-inspection.en.e2r.json",
  ], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    env: {
      ...process.env,
      E2R_GLOBAL_PLACEMENT_ABLATION: "direct-current",
      E2R_GLOBAL_SPACING_STAGE2: "off",
      E2R_OBSTACLE_PLACEMENT_AUDIT: "1",
    },
  });
  const result = JSON.parse(output) as {
    selected?: { metrics?: { crossings: number } } | null;
    obstaclePlacementAudit?: {
      contract: string;
      candidateCount: number;
      focusNodes: Array<{ nodeId: string; routeIds: string[] }>;
      crossingRouteEvidence: Array<{ routeId: string; influencedObstacleIds: string[] }>;
      interpretation: { placementSensitiveSignal: boolean; qualitySafePlacementSignal: boolean };
    } | null;
  };
  const audit = result.obstaclePlacementAudit;
  assert.equal(audit?.contract, "OBSTACLE-SENSITIVE-PLACEMENT-AUDIT-v1");
  assert.ok((audit?.candidateCount ?? 0) > 0);
  assert.ok((audit?.focusNodes ?? []).every((focus) => focus.nodeId && focus.routeIds.length > 0));
  assert.ok((audit?.crossingRouteEvidence ?? []).every((route) => route.routeId && Array.isArray(route.influencedObstacleIds)));
  assert.equal(typeof audit?.interpretation.placementSensitiveSignal, "boolean");
  assert.equal(typeof audit?.interpretation.qualitySafePlacementSignal, "boolean");
  assert.equal(typeof result.selected?.metrics?.crossings, "number");
});
