import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-owned-parallel-bundle-generalization1/result-summary.json", import.meta.url), "utf8"));

function candidate(row: any, id: string) { return row.candidates.find((value: any) => value.candidate === id); }

test("Parallel bundle generalization remains diagnostic and covers the required controls", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.candidateIdentity, "product-owned-adaptive-bundle-v1");
  assert.deepEqual(artifact.rows.map(({ fixture }: { fixture: string }) => fixture), ["parallel-self-loop-control", "higher-multiplicity-5", "mixed-incident-parallel", "lighthouse-en"]);
  assert.equal(artifact.standing.productDefault, "HOLD");
  assert.equal(artifact.standing.humanReview, "NOT READY");
});

test("fixed widened reference improves ownership signals without crossings or final conflicts", () => {
  const primary = artifact.rows.find(({ fixture }: { fixture: string }) => fixture === "parallel-self-loop-control");
  const fixed = candidate(primary, "bundle-16");
  assert.equal(primary.current.quality.crossings, 0);
  assert.equal(fixed.quality.crossings, 0);
  assert.equal(primary.current.occupiedPathConflictCount, 0);
  assert.equal(fixed.metrics.occupiedPathConflictCount, 0);
  assert.equal(primary.current.labels.foreignCloserCount, 1);
  assert.equal(fixed.metrics.labels.foreignCloserCount, 0);
  assert.equal(primary.current.labels.ownershipAmbiguity, 1);
  assert.equal(fixed.metrics.labels.ownershipAmbiguity, 0);
  assert.equal(fixed.churn.changedOrdinaryRouteCount, 0);
});

test("graph-wide adaptive spacing exposes a cross-bundle regression and stays non-adopted", () => {
  const primary = artifact.rows.find(({ fixture }: { fixture: string }) => fixture === "parallel-self-loop-control");
  const adaptive = candidate(primary, "adaptive-bundle");
  const gammaDelta = adaptive.metrics.parallelGroups.find(({ key }: { key: string }) => key === "delta\u0000gamma");
  assert.equal(adaptive.policy.spacing, 20);
  assert.deepEqual(gammaDelta.sideDistribution, { positive: 2 });
  assert.equal(artifact.standing.productDefault, "HOLD");
});
