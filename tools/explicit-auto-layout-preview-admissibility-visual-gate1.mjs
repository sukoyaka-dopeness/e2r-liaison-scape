import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve("experimental/explicit-auto-layout-product-eligibility-semantics1/result-summary.json");
const outputPath = path.resolve("experimental/explicit-auto-layout-preview-admissibility-visual-gate1/result-summary.json");

function summarizeCase(fixture, item) {
  const candidates = item.candidates ?? [];
  const best = [...candidates].sort((left, right) => left.metrics.full.score - right.metrics.full.score || left.family.localeCompare(right.family))[0] ?? null;
  const allFinite = item.candidateSetCompleteFinite === true && candidates.every((candidate) => candidate.completeFinite === true && typeof candidate.positionFingerprint === "string" && candidate.positionFingerprint.length > 0);
  return {
    fixture,
    pinCase: item.pinCase,
    candidateCount: candidates.length,
    structuralValid: allFinite,
    candidateNone: candidates.length === 0,
    bestFamilyByScore: best?.family ?? null,
    bestMetrics: best ? {
      crossings: best.metrics.full.crossings,
      overlapPairs: best.metrics.full.overlapPairs,
      labelRouteHits: best.metrics.full.labelRouteHits,
      labelOverlap: best.metrics.full.labelOverlap,
      labelNear20: best.metrics.full.labelNear20,
      score: best.metrics.full.score,
    } : null,
    strictEligibility: best?.predicate.full.eligible === true,
    strictFailedConditions: best?.predicate.full.failedConditions ?? [],
  };
}

export function buildReport(input = JSON.parse(fs.readFileSync(inputPath, "utf8"))) {
  const cases = input.fixtures.flatMap((fixture) => fixture.cases.map((item) => summarizeCase(fixture.fixture, item)));
  const structuralInvalidCases = cases.filter((item) => !item.structuralValid);
  const candidateNoneCases = cases.filter((item) => item.candidateNone);
  const strictEligibleCases = cases.filter((item) => item.strictEligibility);
  const failureCounts = Object.fromEntries(["crossings", "overlapPairs", "labelRouteHits", "labelOverlap", "labelNear20"].map((condition) => [
    condition,
    cases.filter((item) => item.strictFailedConditions.includes(condition)).length,
  ]));
  return {
    contract: "E2R-LIAISONSCAPE-EXPLICIT-AUTO-LAYOUT-PREVIEW-ADMISSIBILITY-VISUAL-GATE1",
    diagnosticOnly: true,
    sourceRevision: input.sourceRevision,
    objective: "Assess a bounded two-tier Explicit Auto Layout Preview policy without changing solver, strict eligibility, or production UI behavior.",
    selectedPolicy: {
      name: "two-tier-preview",
      catastrophic: "structural-invalid or catastrophic Product presentation failure blocks Preview and preserves the pre-operation display",
      nonCatastrophicResidual: "structurally valid, non-catastrophic residuals may be shown as the best available candidate with warnings/evidence",
      metricRule: "No single crossing or label-nearness count is a catastrophic decision by itself.",
    },
    structuralGate: {
      inputArtifact: "experimental/explicit-auto-layout-product-eligibility-semantics1/result-summary.json",
      cases: cases.length,
      structuralValidCases: cases.length - structuralInvalidCases.length,
      structuralInvalidCases: structuralInvalidCases.length,
      candidateNoneCases: candidateNoneCases.length,
      candidateNoneRate: cases.length === 0 ? null : candidateNoneCases.length / cases.length,
      strictEligibleBestByScoreCases: strictEligibleCases.length,
      strictEligibilityIsNotPreviewPolicy: true,
    },
    productEvidence: {
      coveredFixtures: ["lighthouse-en", "lighthouse-ja", "apollo-11-en", "label-heavy-ja-10", "dense-k7x7-bipartite", "parallel-self-loop-control"],
      coveredCases: "5 fixture families; no/few/all-pinned = 15 diagnostic cases; browser capture adds Lighthouse EN/JA, Titanic EN, label-heavy JA, and dense Product-faithful surfaces.",
      failureCountsOnBestScoreCandidate: failureCounts,
      interpretation: "The covered candidates are complete and finite, while strict eligibility is frequently false because of mixed presentation residuals. This evidence supports advisory treatment for non-catastrophic residuals, not an automatic catastrophic classifier.",
    },
    browserEvidence: [
      {
        surface: "Actual Product normal path",
        fixture: "lighthouse-en",
        url: "http://192.168.0.11:5175/e2r-liaison-scape/?acceptance-fixture=lighthouse&acceptance-locale=en",
        observed: "Pending banner and Cancel were visible; after completion the status cleared, Graph remained usable, Save Coordinates stayed disabled, and viewport controls showed a fitted view.",
      },
      {
        surface: "Actual Product normal path",
        fixture: "lighthouse-ja",
        url: "http://192.168.0.11:5175/e2r-liaison-scape/?acceptance-fixture=lighthouse&acceptance-locale=ja",
        observed: "Japanese pending/cancel copy appeared and cleared; translated toolbar, labels, and fitted Graph remained visible after completion.",
      },
      {
        surface: "Actual Product normal path",
        fixture: "titanic-en",
        url: "http://192.168.0.11:5175/e2r-liaison-scape/?acceptance-fixture=titanic&acceptance-locale=en",
        observed: "Pending state was observed during the slower open; it cleared to a finite fitted Graph with ordinary controls still available.",
      },
      {
        surface: "Product-faithful read-only preview seam",
        fixture: "label-heavy-ja-10",
        url: "http://192.168.0.11:5175/e2r-liaison-scape/experimental/product-evaluation-seam/cross-family-product-authoritative-auto-layout-portfolio-selector1/?fixture=label-heavy-ja-10&candidate=selected",
        observed: "Long Japanese Relation labels were rendered in the read-only candidate surface; the candidate-ready view supported local toolbar zoom from 55% to 61%.",
      },
      {
        surface: "Product-faithful read-only preview seam",
        fixture: "dense-k7-7 (source alias dense-k7x7-bipartite)",
        url: "http://192.168.0.11:5175/e2r-liaison-scape/experimental/product-evaluation-seam/cross-family-product-authoritative-auto-layout-portfolio-selector1/?fixture=dense-k7-7&candidate=selected",
        observed: "Dense 14-node/49-relation Graph stayed usable during pending and became candidate-ready after more than 9 seconds; the fitted 71% view exposed substantial line/label congestion for human inspection.",
      },
    ],
    visualBoundary: {
      sameZoomVsOverview: "Overview/fit and local zoom are separate observations; fit scale or aspect is not treated as a structural failure.",
      preOperationVsCandidate: "The normal-path fallback is the pre-operation display; candidate evidence is read-only and operation-local. Relative improvement does not waive a catastrophic failure.",
      candidateNoneAndCatastrophic: "No candidate-none case occurred in the 15 covered diagnostic cases. Catastrophic presentation remains a policy boundary, not a new threshold or automated classifier in this checkpoint.",
      humanReviewStatus: "Unchanged; no Human Review disposition was opened or recorded.",
    },
    provenance: {
      replayCommand: "node tools/explicit-auto-layout-preview-admissibility-visual-gate1.mjs",
      input: "current-source diagnostic result from explicit-auto-layout-product-eligibility-semantics1",
      sourceEvidence: ["src/automatic-layout-selection.ts", "src/automatic-layout-quality.ts", "src/App.tsx", "src/auto-layout.ts"],
      output: "experimental/explicit-auto-layout-preview-admissibility-visual-gate1/result-summary.json",
    },
    classification: "B. TWO-TIER PREVIEW POLICY SUPPORTED / CATASTROPHIC CLASSIFIER REMAINS OPEN",
    productionChanges: false,
  };
}

if (process.argv[1]?.endsWith("explicit-auto-layout-preview-admissibility-visual-gate1.mjs")) {
  fs.writeFileSync(outputPath, `${JSON.stringify(buildReport(), null, 2)}\n`);
  console.log(outputPath);
}
