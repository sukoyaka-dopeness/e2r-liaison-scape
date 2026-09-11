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
    searchBudget: { relaxationApproximationMode: string; relaxationPrioritizationMode: string; relaxationPriorityTopK: number; relaxationAdaptiveMargin: number; relaxationFinalCanonicalizationMode: string };
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
        ordering: string;
        retention: string;
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
  assert.equal(audit.postStructuralRelaxation?.prioritization?.ordering, "original-sequential");
  assert.equal(audit.postStructuralRelaxation?.prioritization?.retention, "full-audit");
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

test("dynamic cheap candidate prioritization reranks after accepted moves", () => {
  const dynamic = runSearch({
    E2R_PRESENTATION_GEOMETRY_CACHE: "1",
    E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1",
    E2R_RELAXATION_PRIORITIZATION: "dynamic-cheap-ranking",
  }) as ReturnType<typeof runSearch> & {
    postStructuralRelaxation?: {
      evaluated: number;
      acceptedMoves: number;
      prioritization?: {
        dynamic: boolean;
        ordering: string;
        retention: string;
        candidatePlans: number;
        uniqueConsidered: number;
        rerankCount: number;
        acceptedMoveReranks: number;
        acceptedMoves: number;
        acceptedPlanIndexes: number[];
        planningMs: number;
        fullValidated: number;
        skippedFullValidation: number;
      } | null;
    } | null;
  };
  assert.equal(dynamic.searchBudget.relaxationPrioritizationMode, "dynamic-cheap-ranking");
  assert.equal(dynamic.postStructuralRelaxation?.prioritization?.dynamic, true);
  assert.equal(dynamic.postStructuralRelaxation?.prioritization?.ordering, "dynamic-group-reranked");
  assert.equal(dynamic.postStructuralRelaxation?.prioritization?.retention, "top-k-plus-risk-guard");
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.candidatePlans ?? 0) > 0);
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.uniqueConsidered ?? 0) > 0);
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.rerankCount ?? 0) > 0);
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.acceptedMoveReranks ?? 0) > 0);
  assert.equal(
    dynamic.postStructuralRelaxation?.prioritization?.acceptedPlanIndexes.length,
    dynamic.postStructuralRelaxation?.prioritization?.acceptedMoves,
  );
  assert.ok(Number.isFinite(dynamic.postStructuralRelaxation?.prioritization?.planningMs));
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.fullValidated ?? 0) > 0);
  assert.ok((dynamic.postStructuralRelaxation?.prioritization?.skippedFullValidation ?? 0) > 0);
  assert.ok((dynamic.postStructuralRelaxation?.evaluated ?? Infinity) > 0);
});

test("adaptive cheap retention preserves original order and widens after state changes", () => {
  const adaptive = runSearch({
    E2R_PRESENTATION_GEOMETRY_CACHE: "1",
    E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1",
    E2R_RELAXATION_PRIORITIZATION: "adaptive-cheap-ranking",
  }) as ReturnType<typeof runSearch> & {
    postStructuralRelaxation?: {
      prioritization?: {
        adaptive: boolean;
        ordering: string;
        retention: string;
        adaptiveWidenedGroups: number;
        adaptiveStateUpdateReranks: number;
        acceptedMoveReranks: number;
        skippedFullValidation: number;
        fullValidated: number;
      } | null;
    } | null;
  };
  const stats = adaptive.postStructuralRelaxation?.prioritization;
  assert.equal(adaptive.searchBudget.relaxationPrioritizationMode, "adaptive-cheap-ranking");
  assert.equal(adaptive.searchBudget.relaxationAdaptiveMargin, 0.1);
  assert.equal(stats?.adaptive, true);
  assert.equal(stats?.ordering, "original-sequential");
  assert.equal(stats?.retention, "adaptive-state-local");
  assert.ok((stats?.adaptiveWidenedGroups ?? 0) > 0);
  assert.ok((stats?.adaptiveStateUpdateReranks ?? 0) > 0);
  assert.ok((stats?.acceptedMoveReranks ?? 0) > 0);
  assert.ok((stats?.skippedFullValidation ?? 0) > 0);
  assert.ok((stats?.fullValidated ?? 0) > 0);
});

test("adaptive retention audit separates policy recall from unknown skipped candidates", () => {
  const audit = runSearch({
    E2R_PRESENTATION_GEOMETRY_CACHE: "1",
    E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1",
    E2R_RELAXATION_PRIORITIZATION: "adaptive-cheap-ranking",
    E2R_RELAXATION_PRIORITIZATION_AUDIT: "1",
  }) as ReturnType<typeof runSearch> & {
    postStructuralRelaxation?: {
      prioritization?: {
        retentionRecall: number | null;
        acceptedRetentionRecall: number | null;
        skippedFullValidation: number;
        fullValidated: number;
        fullImprovingRetained: number;
        fullImprovingCandidates: number;
      } | null;
    } | null;
  };
  const stats = audit.postStructuralRelaxation?.prioritization;
  assert.equal(stats?.skippedFullValidation, 0);
  assert.ok((stats?.fullValidated ?? 0) > 0);
  assert.ok((stats?.fullImprovingRetained ?? 0) <= (stats?.fullImprovingCandidates ?? 0));
  assert.ok((stats?.retentionRecall ?? -1) >= 0);
  assert.ok((stats?.acceptedRetentionRecall ?? -1) >= 0);
});

test("final coordinate canonicalization is a post-selection diagnostic boundary", () => {
  const audit = runSearch({ E2R_RELAXATION_FINAL_CANONICALIZATION: "audit" }) as ReturnType<typeof runSearch> & {
    floatSelected?: { family: string; positions: Record<string, { x: number; y: number }>; metrics: { score: number } } | null;
    roundedSelected?: { positions: Record<string, { x: number; y: number }> } | null;
    selected?: { family: string; positions: Record<string, { x: number; y: number }>; metrics: { score: number } } | null;
    finalCanonicalization?: {
      applied: boolean;
      boundary: string;
      rule: string;
      selectedCandidateIndex: number;
      maxDisplacement: number;
      selectedFamily: string;
      presentation: {
        routeGeometryChanged: number;
        relationLabelGeometryChanged: number;
        nodeLabelGeometryChanged: number;
        roundedOnlyDefects: Record<string, boolean>;
      };
    } | null;
  };
  assert.equal(audit.searchBudget.relaxationFinalCanonicalizationMode, "audit");
  assert.equal(audit.finalCanonicalization?.applied, false);
  assert.equal(audit.finalCanonicalization?.boundary, "AFTER_TRUE_FINAL_SELECTION_BEFORE_ACCEPTANCE");
  assert.equal(audit.finalCanonicalization?.rule, "nearest-integer");
  assert.equal(audit.finalCanonicalization?.selectedFamily, audit.floatSelected?.family);
  assert.equal(audit.finalCanonicalization?.selectedCandidateIndex, 0);
  assert.equal(audit.selected?.family, audit.floatSelected?.family);
  assert.deepEqual(audit.selected?.positions, audit.floatSelected?.positions);
  assert.equal(audit.selected?.metrics.score, audit.floatSelected?.metrics.score);
  assert.ok((audit.finalCanonicalization?.maxDisplacement ?? Infinity) <= Math.SQRT1_2);
  assert.ok(audit.roundedSelected);

  const rounded = runSearch({ E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once" }) as ReturnType<typeof runSearch> & {
    floatSelected?: { family: string; positions: Record<string, { x: number; y: number }> } | null;
    selected?: { family: string; positions: Record<string, { x: number; y: number }> } | null;
    roundedSelected?: { positions: Record<string, { x: number; y: number }> } | null;
    finalCanonicalization?: { applied: boolean } | null;
  };
  assert.equal(rounded.searchBudget.relaxationFinalCanonicalizationMode, "round-once");
  assert.equal(rounded.finalCanonicalization?.applied, true);
  assert.equal(rounded.selected?.family, rounded.floatSelected?.family);
  assert.deepEqual(rounded.selected?.positions, rounded.roundedSelected?.positions);
  assert.ok(Object.values(rounded.selected?.positions ?? {}).every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y)));
});
