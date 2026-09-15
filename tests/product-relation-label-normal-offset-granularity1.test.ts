import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-relation-label-normal-offset-granularity1/result-summary.json", import.meta.url), "utf8"));
const row = (id: string) => artifact.rows.find(({ fixture }: { fixture: string }) => fixture === id);
const arms = ["current-coarse", "widened-coarse", "current-fine", "widened-fine"];

test("four-arm normal-offset attribution stays bounded and uses the same Product geometry", () => {
  assert.deepEqual(artifact.coarseNormalOffsets, [0, -24, 24, -40, 40]);
  assert.deepEqual(artifact.fineNormalOffsets, [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24, -32, 32, -40, 40]);
  for (const item of artifact.rows) {
    assert.deepEqual(Object.keys(item.arms), arms);
    assert.ok(arms.every((arm) => item.arms[arm].normalOffsets.length <= 15));
    assert.deepEqual(item.arms["current-coarse"].routeIds, item.arms["current-fine"].routeIds);
    assert.deepEqual(item.arms["widened-coarse"].routeIds, item.arms["widened-fine"].routeIds);
  }
});

test("primary zero-offset rejection names the foreign sibling route", () => {
  const primary = row("parallel-self-loop-control");
  const coarse = Object.fromEntries(primary.arms["current-coarse"].labelTraces.map((trace: any) => [trace.relationId, trace]));
  assert.deepEqual(coarse["r-ab-2"].zero.foreignRouteIds, ["r-ba-1"]);
  assert.deepEqual(coarse["r-ba-1"].zero.foreignRouteIds, ["r-ba-2"]);
  assert.deepEqual(coarse["r-ba-2"].zero.foreignRouteIds, ["r-ba-1"]);
  assert.equal(coarse["r-ab-2"].zero.edgeOverlap > 0, true);
  assert.equal(coarse["r-ab-2"].selected.normalOffset, 24);
});

test("bundle widening is the primary ownership mechanism and finer offsets are secondary", () => {
  const primary = row("parallel-self-loop-control");
  assert.equal(primary.arms["current-coarse"].ownership.ambiguity, 1);
  assert.equal(primary.arms["current-fine"].ownership.ambiguity, 1);
  assert.equal(primary.arms["widened-coarse"].ownership.ambiguity, 0);
  assert.equal(primary.arms["widened-fine"].ownership.ambiguity, 0);
  assert.deepEqual(primary.arms["widened-coarse"].groups[0].side, { positive: 2, negative: 2 });
  assert.ok(primary.arms["widened-fine"].labelTraces.some((trace: any) => Math.abs(trace.selected.normalOffset) < 24));
  assert.equal(primary.arms["widened-fine"].ordinaryRouteChurn.count, 0);
});

test("controls retain the prior capacity and route-coupling boundaries", () => {
  assert.equal(row("higher-multiplicity-5").arms["widened-fine"].ownership.ambiguity, 0);
  assert.ok(row("higher-multiplicity-5").arms["widened-fine"].ordinaryRouteChurn.count >= 0);
  assert.equal(row("mixed-incident-parallel").arms["widened-fine"].ordinaryRouteChurn.count, 0);
  assert.equal(row("shared-endpoint-multiple-bundle").arms["widened-fine"].ownership.ambiguity, 0);
  assert.equal(row("lighthouse-en").arms["widened-fine"].ownership.ambiguity, 0);
});

test("checkpoint preserves authority and adoption holds", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-RELATION-LABEL-NORMAL-OFFSET-GRANULARITY-v1");
  assert.equal(artifact.widenedBundlePolicy, "reuse prior Product-owned bundle-local spacing maps; no new route authority");
  assert.equal(artifact.wrap, "not evaluated; remains a separate display-only checkpoint");
  assert.equal(artifact.selfLoopPolicy, "unchanged");
  assert.equal(artifact.structuralPlacement, "unchanged");
  assert.equal(artifact.parallelIncidentArchitecture, "CLOSED");
  assert.equal(artifact.relationLabelAuthority, "Product final Relation-label placement unchanged");
  assert.deepEqual(artifact.standing, { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" });
});
