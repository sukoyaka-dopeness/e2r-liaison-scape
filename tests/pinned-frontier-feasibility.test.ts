import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync("experimental/pinned-frontier-feasibility1/result-summary.json", "utf8"));

test("pinned Frontier feasibility artifact proves hard anchors, Product snapshot input, and no-pin parity", () => {
  assert.equal(artifact.contract, "E2R-LIAISONSCAPE-PINNED-FRONTIER-FEASIBILITY-1");
  assert.equal(artifact.allNoPinParity, true);
  assert.equal(artifact.allWorkerCompleted, true);
  assert.equal(artifact.allPinnedExact, true);
  assert.equal(artifact.allSnapshotsNonEmpty, true);
  assert.equal(artifact.productionWiring, false);
  assert.deepEqual(artifact.rows.map((row: { fixture: string }) => row.fixture), ["apollo-11-en", "dense-k7-7", "parallel-self-loop-control"]);
  for (const row of artifact.rows) {
    assert.deepEqual(row.rows.map((caseRow: { pinCase: string }) => caseRow.pinCase), ["no-pins", "one-saved", "few-staged", "many-mixed", "one-movable", "all-pinned"]);
    assert.ok(row.rows.every((caseRow: { exactPinnedCoordinates: boolean; finiteCompleteResult: boolean; structuredClone: boolean }) => caseRow.exactPinnedCoordinates && caseRow.finiteCompleteResult && caseRow.structuredClone));
    assert.ok(row.runtime.candidateGenerationMsMedian >= 0);
    assert.ok(row.runtime.productEvaluationMsMedian >= 0);
    assert.equal(row.worker.terminal.kind, "completed");
    assert.equal(row.worker.terminal.validation.ok, true);
  }
});

test("pinned feasibility remains diagnostic-only and keeps Product authorities outside the generator", () => {
  const source = fs.readFileSync("experimental/pinned-frontier-feasibility1/core.ts", "utf8");
  assert.match(source, /fixedAnchors/);
  assert.match(source, /deriveBoundedAutomaticPresentation/);
  assert.match(source, /previousAutomaticRoutes/);
  assert.doesNotMatch(source, /setPositions|applyStoredCoordinates|setCoordinatesDirty|saveCoordinates/);
  assert.equal(artifact.humanReview, "unchanged QUALIFIED; not reopened");
});
