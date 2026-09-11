import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runSearch(extraEnvironment: Record<string, string> = {}) {
  const output = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "tools/generic-crossing-search.mjs",
    "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      E2R_PRESENTATION_FINALIST_LIMIT: "1",
      E2R_PRESENTATION_REPAIR_ROUNDS: "1",
      E2R_RELAXATION_STEP_MODE: "omit-fine",
      E2R_RELAXATION_APPROXIMATION_AUDIT: "0",
      ...extraEnvironment,
    },
  });
  return JSON.parse(output) as {
    graph: { nodes: number; edges: number };
    searchBudget: { relaxationApproximationMode: string; relaxationPrioritizationMode: string; relaxationPriorityTopK: number };
    postStructuralRelaxation?: {
      approximation?: {
        mode: string;
        skippedFullValidation: number;
        fullValidated: number;
        averageScopeNodeCount: number;
        averageScopeEdgeCount: number;
      } | null;
    } | null;
  };
}

test("local presentation approximation is diagnostic opt-in and preserves full validation boundary", () => {
  const baseline = runSearch();
  assert.equal(baseline.searchBudget.relaxationApproximationMode, "off");

  const local = runSearch({ E2R_RELAXATION_APPROXIMATION: "local-screen" });
  assert.equal(local.searchBudget.relaxationApproximationMode, "local-screen");
  assert.equal(local.postStructuralRelaxation?.approximation?.mode, "local-screen");
  assert.ok((local.postStructuralRelaxation?.approximation?.skippedFullValidation ?? 0) > 0);
  assert.ok((local.postStructuralRelaxation?.approximation?.fullValidated ?? 0) > 0);
  assert.ok((local.postStructuralRelaxation?.approximation?.averageScopeNodeCount ?? Infinity) < local.graph.nodes);
  assert.ok((local.postStructuralRelaxation?.approximation?.averageScopeEdgeCount ?? Infinity) < local.graph.edges);
});

test("cheap candidate prioritization is diagnostic opt-in and keeps full presentation authoritative", () => {
  const audit = runSearch({
    E2R_RELAXATION_PRIORITIZATION: "cheap-ranking",
    E2R_RELAXATION_PRIORITIZATION_AUDIT: "1",
    E2R_RELAXATION_DEPENDENCY_TRACE: "1",
  }) as ReturnType<typeof runSearch> & {
    postStructuralRelaxation?: {
      prioritization?: {
        audit: boolean;
        considered: number;
        fullValidated: number;
        planningMs: number;
        improvementRecall: { top2: number | null };
      } | null;
    } | null;
  };
  assert.equal(audit.searchBudget.relaxationPrioritizationMode, "cheap-ranking");
  assert.equal(audit.searchBudget.relaxationPriorityTopK, 2);
  assert.equal(audit.postStructuralRelaxation?.prioritization?.audit, true);
  assert.ok((audit.postStructuralRelaxation?.prioritization?.considered ?? 0) > 0);
  assert.ok((audit.postStructuralRelaxation?.prioritization?.fullValidated ?? 0) > 0);
  assert.ok(
    (audit.postStructuralRelaxation?.prioritization?.fullValidated ?? 0)
      <= (audit.postStructuralRelaxation?.prioritization?.considered ?? 0),
  );
  assert.ok((audit.postStructuralRelaxation?.prioritization?.planningMs ?? Infinity) < 1000);
  assert.ok((audit.postStructuralRelaxation?.prioritization?.improvementRecall.top2 ?? 0) >= 0);

  const prototype = runSearch({ E2R_RELAXATION_PRIORITIZATION: "cheap-ranking" }) as ReturnType<typeof runSearch> & {
    postStructuralRelaxation?: { prioritization?: { skippedFullValidation: number; fullValidated: number } | null } | null;
  };
  assert.equal(prototype.searchBudget.relaxationPrioritizationMode, "cheap-ranking");
  assert.ok((prototype.postStructuralRelaxation?.prioritization?.skippedFullValidation ?? 0) > 0);
  assert.ok((prototype.postStructuralRelaxation?.prioritization?.fullValidated ?? 0) > 0);
});
