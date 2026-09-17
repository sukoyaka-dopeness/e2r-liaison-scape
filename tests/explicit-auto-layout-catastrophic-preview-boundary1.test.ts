import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../tools/explicit-auto-layout-catastrophic-preview-boundary1.mjs";

test("catastrophic visual controls remain separate from structural invalidity", () => {
  const report = buildReport();
  const ordinary = report.controls.find((row) => row.fixture === "lighthouse-en");
  assert.ok(ordinary);
  assert.equal(ordinary.controls.pileup.completeFinite, true);
  assert.ok(ordinary.controls.pileup.metrics.overlapPairs >= 45);
  assert.equal(ordinary.controls.extentOutlier.completeFinite, true);
  assert.equal(report.structuralInvalidSeparateGate.decision, "These are hard structural rejection cases and are not evidence for a catastrophic visual classifier.");
  assert.equal(report.productionChanges, false);
});
