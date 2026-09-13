import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runSearch(extraEnvironment: Record<string, string> = {}, fixturePath = "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json") {
  const output = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "tools/generic-crossing-search.mjs",
    fixturePath,
  ], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
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
    profile?: { stages?: Record<string, { wallMs?: number }> };
    searchBudget: { relaxationApproximationMode: string; relaxationPrioritizationMode: string; relaxationPriorityTopK: number; relaxationAdaptiveMargin: number; relaxationFinalCanonicalizationMode: string; globalPlacementMode: string; globalPlacementAblation: string; globalSpacingScale: number; globalSpacingY: number; globalSpacingStage2Mode: string; screenSpaceAuditEnabled: boolean };
    globalPlacementMode: string;
    globalSpacingScale: number;
    globalSpacingY: number;
    globalSpacingStage2Mode: string;
    selected?: { family: string; positions?: Record<string, { x: number; y: number }>; metrics?: { fitScale: number; minimumSeparation: number; screenSpace?: { nodeMinimumSeparation: number; labelNear20: number; routeMax: number } | null } } | null;
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

test("global spacing is a diagnostic-only centered transform with an explicit Stage-2 bypass", () => {
  const spaced = runSearch({ E2R_GLOBAL_SPACING_SCALE: "1.5", E2R_GLOBAL_SPACING_STAGE2: "off" });
  assert.equal(spaced.searchBudget.globalSpacingScale, 1.5);
  assert.equal(spaced.searchBudget.globalSpacingStage2Mode, "off");
  assert.equal(spaced.globalSpacingScale, 1.5);
  assert.equal(spaced.globalSpacingStage2Mode, "off");
  assert.equal(spaced.selected?.family, "global-spacing-only");
});

test("screen-space audit applies the actual viewport fit scale without changing authority", () => {
  const audit = runSearch({ E2R_GLOBAL_SPACING_SCREEN_AUDIT: "1" });
  const metrics = audit.selected?.metrics;
  assert.equal(audit.searchBudget.screenSpaceAuditEnabled, true);
  assert.ok(metrics?.screenSpace);
  assert.ok(Math.abs((metrics?.screenSpace?.nodeMinimumSeparation ?? 0) - (metrics?.minimumSeparation ?? 0) * (metrics?.fitScale ?? 0)) < 1e-6);
  assert.ok((metrics?.screenSpace?.labelNear20 ?? -1) >= 0);
  assert.ok((metrics?.screenSpace?.routeMax ?? -1) >= 0);
});

test("viewport-anisotropic placement is an explicit diagnostic arm and can bypass Stage 2", () => {
  const anisotropic = runSearch({
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
  });
  assert.equal(anisotropic.searchBudget.globalPlacementMode, "viewport-anisotropic");
  assert.equal(anisotropic.searchBudget.globalSpacingScale, 0.88);
  assert.equal(anisotropic.searchBudget.globalSpacingY, 1.12);
  assert.equal(anisotropic.globalPlacementMode, "viewport-anisotropic");
  assert.equal(anisotropic.globalSpacingY, 1.12);
  assert.equal(anisotropic.selected?.family, "global-spacing-only");
});

test("global placement applies accepted round-once finalization after selection", () => {
  const finalized = runSearch({
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once",
  });
  assert.equal(finalized.searchBudget.relaxationFinalCanonicalizationMode, "round-once");
  assert.equal(finalized.selected?.family, "global-spacing-only");
  assert.ok(Object.values(finalized.selected?.positions ?? {}).every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y)));
});

test("diagnostic synthetic scaling inputs stay outside the production provider boundary", () => {
  const synthetic = runSearch({
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
  }, "synthetic:k4-4");
  assert.equal(synthetic.graph.nodes, 8);
  assert.equal(synthetic.graph.edges, 16);
  assert.ok((synthetic.profile?.stages?.["stage1-structural"]?.wallMs ?? 0) > 0);
});

test("production-native simplification bypasses Stage 1 and Stage 2 with one authoritative evaluation", () => {
  const simplified = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "direct-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once",
  }) as ReturnType<typeof runSearch> & {
    ablation?: { mode: string; stage1Search: string; stage2Search: string; fullPresentationEvaluations: number };
    profile?: { fullPresentationEvaluations?: number; stages?: Record<string, { fullPresentationEvaluations?: number }> };
  };
  assert.equal(simplified.searchBudget.globalPlacementAblation, "direct-anisotropic");
  assert.equal(simplified.ablation?.stage1Search, "bypassed");
  assert.equal(simplified.ablation?.stage2Search, "bypassed");
  assert.equal(simplified.ablation?.fullPresentationEvaluations, 2);
  assert.equal(simplified.profile?.stages?.["production-simplification-ablation"]?.fullPresentationEvaluations, 2);
  assert.equal(simplified.selected?.family, "product-current-anisotropic");
  assert.ok(Object.values(simplified.selected?.positions ?? {}).every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y)));
});

test("production-native two-arm ablation keeps authoritative selection bounded", () => {
  const twoArm = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "direct-two-arm",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
  }) as ReturnType<typeof runSearch> & {
    ablation?: { candidateFamilies: string[]; fullPresentationEvaluations: number };
  };
  assert.deepEqual(twoArm.ablation?.candidateFamilies, ["product-current", "product-current-anisotropic"]);
  assert.equal(twoArm.ablation?.fullPresentationEvaluations, 2);
  assert.equal(twoArm.profile?.stages?.["production-simplification-ablation"]?.fullPresentationEvaluations, 2);
  assert.ok(twoArm.selected?.family === "product-current" || twoArm.selected?.family === "product-current-anisotropic");
});

test("bounded grid ablation keeps cheap structural planning separate from authoritative validation", () => {
  const grid = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "bounded-grid-one",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
  }) as ReturnType<typeof runSearch> & {
    ablation?: { stage1Search: string; stage2Search: string; candidateArmCount: number; fullPresentationEvaluations: number; cheapPlanning?: { mode: string; evaluated: number; zeroCrossingFinalistCount: number } | null };
  };
  assert.equal(grid.ablation?.stage1Search, "bypassed");
  assert.equal(grid.ablation?.stage2Search, "bypassed");
  assert.equal(grid.ablation?.candidateArmCount, 1);
  assert.equal(grid.ablation?.fullPresentationEvaluations, 1);
  assert.equal(grid.ablation?.cheapPlanning?.mode, "bounded-grid-search");
  assert.ok((grid.ablation?.cheapPlanning?.evaluated ?? 0) > 0);
  assert.ok((grid.ablation?.cheapPlanning?.zeroCrossingFinalistCount ?? -1) >= 0);
  assert.ok(grid.selected?.family === "bounded-grid-anisotropic" || grid.selected === null);
});

test("structural frontier ablation retains a diverse bounded presentation portfolio", () => {
  const frontier = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-4",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "off",
  }) as ReturnType<typeof runSearch> & {
    ablation?: {
      candidateArmCount: number;
      fullPresentationEvaluations: number;
      cheapPlanning?: { mode: string; poolCount: number; frontierCount: number; representativeCount: number; representativeFamilies: string[] } | null;
      representatives?: Array<{ sourceFamily: string | null }>;
    };
  };
  assert.equal(frontier.searchBudget.globalPlacementAblation, "frontier-4");
  assert.equal(frontier.ablation?.candidateArmCount, 4);
  assert.equal(frontier.ablation?.fullPresentationEvaluations, 4);
  assert.equal(frontier.ablation?.cheapPlanning?.mode, "structural-frontier-farthest-point");
  assert.ok((frontier.ablation?.cheapPlanning?.poolCount ?? 0) >= 4);
  assert.ok((frontier.ablation?.cheapPlanning?.frontierCount ?? 0) > 0);
  assert.equal(frontier.ablation?.cheapPlanning?.representativeCount, 4);
  assert.equal(frontier.ablation?.cheapPlanning?.representativeFamilies?.length, 4);
  assert.equal(frontier.ablation?.representatives?.length, 4);
});

test("structural frontier K12 remains bounded while exposing the full diversity audit", () => {
  const frontier = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-12",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "off",
  }) as ReturnType<typeof runSearch> & {
    ablation?: {
      candidateArmCount: number;
      fullPresentationEvaluations: number;
      cheapPlanning?: { poolCount: number; frontierCount: number; representativeCount: number } | null;
    };
  };
  assert.equal(frontier.ablation?.candidateArmCount, 12);
  assert.equal(frontier.ablation?.fullPresentationEvaluations, 12);
  assert.ok((frontier.ablation?.cheapPlanning?.poolCount ?? 0) > 12);
  assert.ok((frontier.ablation?.cheapPlanning?.frontierCount ?? 0) > 0);
  assert.equal(frontier.ablation?.cheapPlanning?.representativeCount, 12);
});

test("density-aware adaptive frontier widens only when the cheap frontier itself is dense", () => {
  const adaptive = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-adaptive-12",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "off",
  }, "synthetic:k7-7") as ReturnType<typeof runSearch> & {
    ablation?: {
      candidateArmCount: number;
      fullPresentationEvaluations: number;
      cheapPlanning?: { mode: string; adaptiveLimit: number; frontierRetention: string; frontierCount: number } | null;
    };
  };
  assert.equal(adaptive.ablation?.cheapPlanning?.mode, "density-aware-adaptive-frontier");
  assert.equal(adaptive.ablation?.cheapPlanning?.adaptiveLimit, 22);
  assert.equal(adaptive.ablation?.cheapPlanning?.frontierRetention, "all-cheap-frontier");
  assert.equal(adaptive.ablation?.cheapPlanning?.frontierCount, 22);
  assert.equal(adaptive.ablation?.candidateArmCount, 22);
  assert.equal(adaptive.ablation?.fullPresentationEvaluations, 22);
  assert.equal(adaptive.selected?.metrics?.crossings, 129);
  assert.equal(adaptive.selected?.metrics?.labelRouteHits, 8);
  assert.equal(adaptive.selected?.metrics?.overlapPairs, 0);
});

test("progressive frontier completes the best cheap stratum before bounded representative fill", () => {
  const progressive = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-progressive-12",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "off",
  }, "synthetic:k7-7") as ReturnType<typeof runSearch> & {
    ablation?: {
      candidateArmCount: number;
      cheapPlanning?: { mode: string; progressivePolicy: string; initialStratumCount: number; widenedStrata: number } | null;
    };
  };
  assert.equal(progressive.ablation?.cheapPlanning?.mode, "structural-frontier-progressive-cheap-strata");
  assert.equal(progressive.ablation?.cheapPlanning?.progressivePolicy, "complete-best-cheap-stratum-then-frontier-fill; no authoritative early-stop bound");
  assert.equal(progressive.ablation?.cheapPlanning?.initialStratumCount, 12);
  assert.equal(progressive.ablation?.cheapPlanning?.widenedStrata, 0);
  assert.equal(progressive.ablation?.candidateArmCount, 12);
  assert.equal(progressive.selected?.metrics?.crossings, 129);
  assert.equal(progressive.selected?.metrics?.labelRouteHits, 8);
});

test("topology-aware frontier remains diagnostic and reports its feature mode", () => {
  const topology = runSearch({
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-topology-12",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "off",
  }) as ReturnType<typeof runSearch> & {
    ablation?: { cheapPlanning?: { mode: string; featureMode: string } | null };
  };
  assert.equal(topology.ablation?.cheapPlanning?.mode, "structural-topology-frontier-farthest-point");
  assert.equal(topology.ablation?.cheapPlanning?.featureMode, "topology-aware");
});

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
