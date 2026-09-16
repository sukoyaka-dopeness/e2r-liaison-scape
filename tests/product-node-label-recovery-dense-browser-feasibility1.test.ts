import assert from "node:assert/strict";
import test from "node:test";
import sourceArtifact from "../experimental/product-node-label-recovery-dense-browser-feasibility1/source-result-summary.json" with { type: "json" };
import browserArtifact from "../experimental/product-node-label-recovery-dense-browser-feasibility1/browser-result-summary.json" with { type: "json" };

test("dense Node-label recovery remains diagnostic-only and exposes the browser boundary", () => {
  assert.equal(sourceArtifact.contract, "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-DENSE-BROWSER-FEASIBILITY-v1");
  assert.equal(sourceArtifact.diagnosticOnly, true);
  assert.equal(sourceArtifact.rows.length, 7);
  assert.deepEqual(sourceArtifact.campaign.fixtureFamilies, ["lighthouse-ish", "medium-dense", "large-dense", "high-degree-heavy", "label-heavy-en", "label-heavy-ja", "parallel-self-loop"]);
  assert.equal(sourceArtifact.boundary.movementCoefficient, "distance * 4");
  assert.equal(sourceArtifact.status.browserNativeFeasibility, "NOT ESTABLISHED");
  assert.equal(sourceArtifact.status.productDefault, "HOLD");
  assert.equal(sourceArtifact.status.productionProvider, "NOT ESTABLISHED");
  assert.equal(sourceArtifact.status.humanReview, "NOT READY");
  assert.equal(sourceArtifact.status.initialLayoutReleaseBlocker, "OPEN");

  for (const row of sourceArtifact.rows as any[]) {
    assert.equal(row.exact.cleanBaselineCandidateParity, true);
    assert.equal(row.exact.candidateRecoveryStableOnReuse || row.exact.recoveryFingerprintCount > 1, true);
    assert.ok(row.settled.candidateRows > 0);
    assert.ok(row.settled.candidateRecoveryComparisonMedianMs >= 0);
  }

  assert.equal(browserArtifact.contract, sourceArtifact.contract);
  assert.equal(browserArtifact.rows.length, 14);
  assert.equal(browserArtifact.classification.overall, "F: browser feasibility not established");
  assert.equal(browserArtifact.classification.primaryRuntimeAttribution, "E: full presentation pipeline dominates large-dense main-thread cost; recovery comparison itself is sub-millisecond in source probes");
  const large = browserArtifact.rows.filter((row: any) => row.fixture === "large-dense");
  assert.equal(large.length, 2);
  assert.ok(large.every((row: any) => row.longTaskMaxMs >= 10000));
  assert.ok(large.every((row: any) => Math.max(...row.deriveMs) >= 2500));
  assert.ok(browserArtifact.actualProductSmoke.every((row: any) => row.graphRendered && row.graphStable && row.consoleErrors === 0));
  assert.equal(browserArtifact.status.productDefault, "HOLD");
  assert.equal(browserArtifact.status.humanReview, "NOT READY");
});
