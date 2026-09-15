import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { labelHeavyJa, parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

const audit = JSON.parse(fs.readFileSync("experimental/parallel-one-sided-product-quality-audit1/result-summary.json", "utf8"));

test("diagnostic Japanese fixture preserves Unicode and stable topology", () => {
  const dataset = labelHeavyJa();
  assert.match(dataset.entities[0].name, /日本語の長いノードラベル/);
  assert.match(dataset.entities[0].description, /長い説明文/);
  assert.match(dataset.relations[0].name, /長い日本語Relationラベル/);
  assert.equal(dataset.entities.length, 10);
  assert.equal(dataset.relations.length, 20);
});

test("diagnostic Parallel control records directions and Product-side imbalance", () => {
  const dataset = parallelSelfLoop();
  assert.equal(dataset.relations.filter(({ sourceId, targetId }) => sourceId === "alpha" && targetId === "beta").length, 2);
  assert.equal(dataset.relations.filter(({ sourceId, targetId }) => sourceId === "beta" && targetId === "alpha").length, 2);
  assert.equal(audit.fixtureIntegrity.sharedGenerator, true);
  assert.equal(audit.fixtureIntegrity.correctedUnicodeFixture, true);
  const alphaBeta = audit.groups.find((group: { key: string }) => group.key === "alpha\u0000beta");
  assert.deepEqual(alphaBeta.directionCounts, { forward: 2, reverse: 2 });
  assert.equal(alphaBeta.oneSided, false);
  assert.equal(alphaBeta.sideBalanced, false);
  assert.equal(alphaBeta.sideImbalanceRatio, 3);
  assert.equal(audit.productPath.explicitIncidentAllocatorPresent, false);
  assert.equal(audit.readiness.humanReview, "NOT READY");
});
