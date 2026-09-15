import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-owned-orientation-aware-label-capacity1/result-summary.json", import.meta.url), "utf8"));
const row = (id: string) => artifact.rows.find(({ fixture }: { fixture: string }) => fixture === id);

test("orientation-aware checkpoint keeps the reference spacing fixed and bounded", () => {
  assert.deepEqual(artifact.rows.map(({ fixture }: { fixture: string }) => fixture), [
    "parallel-self-loop-control", "higher-multiplicity-5", "mixed-incident-parallel", "shared-endpoint-multiple-bundle",
    "horizontal-label-capacity", "vertical-label-capacity", "diagonal-label-capacity", "lighthouse-en",
  ]);
  for (const item of artifact.rows) {
    assert.deepEqual(item.orientationAware.spacingByKey, item.bundleLocalReference.spacingByKey);
    assert.equal(item.search.combinations, 1);
    assert.deepEqual(item.search.ordering.slice(0, 2), ["bundle-local-reference-held-fixed", "hard-feasibility"]);
  }
});

test("tangent/normal capacity exposes horizontal one-line residual without adopting wrap", () => {
  const horizontal = row("horizontal-label-capacity");
  const wrapped = horizontal.orientationAware.capacityRows.filter(({ spanDeficit }: { spanDeficit: number }) => spanDeficit >= 96);
  assert.equal(horizontal.orientationAware.wrapRequiredOneLine, true);
  assert.deepEqual(wrapped.map(({ relationId }: { relationId: string }) => relationId), ["ab-long", "ab-longer"]);
  assert.ok(wrapped.every(({ orientation }: { orientation: string }) => orientation === "horizontal"));
  assert.equal(artifact.wrapPolicy, "not implemented; deficits recorded for future display-only wrap checkpoint");
  assert.equal(artifact.oneLineLabels, true);
});

test("vertical stagger and diagonal projection are represented continuously", () => {
  const vertical = row("vertical-label-capacity");
  assert.deepEqual(vertical.orientationAware.staggerByRelationId, { "ab-one": -48, "ab-three": 0, "ab-two": 48 });
  assert.ok(vertical.orientationAware.capacityRows.every(({ orientation }: { orientation: string }) => orientation === "vertical"));
  assert.equal(vertical.orientationAware.labelOverlap, 0);
  assert.equal(vertical.orientationAware.ownership.ambiguity, vertical.bundleLocalReference.ownership.ambiguity);

  const diagonal = row("diagonal-label-capacity");
  assert.ok(diagonal.orientationAware.capacityRows.every(({ orientation }: { orientation: string }) => orientation === "diagonal"));
  assert.deepEqual(diagonal.orientationAware.staggerByRelationId, { "ab-one": -24, "ab-two": 24 });
});

test("existing controls remain non-regressed while residual coupling stays visible", () => {
  const primary = row("parallel-self-loop-control");
  assert.equal(primary.orientationAware.selfLoops, 1);
  assert.equal(primary.orientationAware.churn.count, 0);
  assert.equal(primary.orientationAware.occupiedConflicts, 0);

  const higher = row("higher-multiplicity-5");
  assert.equal(higher.orientationAware.churn.count, 1);
  assert.equal(higher.orientationAware.ownership.ambiguity, 0);

  const mixed = row("mixed-incident-parallel");
  assert.equal(mixed.orientationAware.churn.count, 0);

  const shared = row("shared-endpoint-multiple-bundle");
  assert.equal(shared.orientationAware.ownership.ambiguity, 0);
  assert.equal(shared.orientationAware.ownership.foreignCloser, 0);
});

test("checkpoint preserves Product authority and all release holds", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-OWNED-ORIENTATION-AWARE-LABEL-CAPACITY-STAGGER-v1");
  assert.equal(artifact.candidateIdentity, "product-owned-orientation-aware-label-capacity-stagger-v1");
  assert.equal(artifact.structuralPlacement, "unchanged");
  assert.equal(artifact.parallelIncidentArchitecture, "CLOSED");
  assert.equal(artifact.routingAuthority, "Product ordinary routing unchanged");
  assert.equal(artifact.relationLabelAuthority, "Product final Relation-label placement unchanged");
  assert.deepEqual(artifact.standing, { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" });
});
