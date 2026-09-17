import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../tools/explicit-auto-layout-preview-admissibility-visual-gate1.mjs";

test("two-tier Preview gate keeps structural validity separate from strict eligibility", () => {
  const report = buildReport();
  assert.equal(report.selectedPolicy.name, "two-tier-preview");
  assert.equal(report.structuralGate.cases, 15);
  assert.equal(report.structuralGate.structuralInvalidCases, 0);
  assert.equal(report.structuralGate.candidateNoneCases, 0);
  assert.equal(report.structuralGate.candidateNoneRate, 0);
  assert.equal(report.structuralGate.strictEligibilityIsNotPreviewPolicy, true);
  assert.equal(report.visualBoundary.humanReviewStatus, "Unchanged; no Human Review disposition was opened or recorded.");
  assert.equal(report.productionChanges, false);
});
