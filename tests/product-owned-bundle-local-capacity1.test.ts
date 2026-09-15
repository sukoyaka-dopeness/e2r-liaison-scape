import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deriveAutomaticRoutes } from "../src/graph-presentation.ts";
import { deriveProductParallelBundleLocalDemands } from "../src/product-parallel-bundle-policy.ts";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-owned-bundle-local-capacity1/result-summary.json", import.meta.url), "utf8"));
const row = (id: string) => artifact.rows.find(({ fixture }: { fixture: string }) => fixture === id);
const edge = (id: string, sourceId: string, targetId: string, parallelCount: number, label = "link") => ({ id, sourceId, targetId, parallelCount, parallelIndex: 0, label });

test("bundle-local demand is deterministic, direction-aware, and excludes ordinary and Self-loop edges", () => {
  const edges = [
    edge("ab1", "a", "b", 2, "long relation"), edge("ba1", "b", "a", 2, "long relation"),
    edge("cd1", "c", "d", 2), edge("cd2", "c", "d", 2),
    edge("ordinary", "a", "c", 1), edge("loop", "a", "a", 3),
  ];
  const demands = deriveProductParallelBundleLocalDemands(edges);
  assert.deepEqual(demands, deriveProductParallelBundleLocalDemands([...edges].reverse()));
  assert.deepEqual(demands.map(({ key, relationCount, maxDirectionalCount, directionCount }) => ({ key, relationCount, maxDirectionalCount, directionCount })), [
    { key: "a\u0000b", relationCount: 2, maxDirectionalCount: 2, directionCount: 2 },
    { key: "c\u0000d", relationCount: 2, maxDirectionalCount: 2, directionCount: 1 },
  ]);
});

test("per-bundle spacing reaches route generation without changing another bundle", () => {
  const nodes = [
    { id: "a", label: "A", description: "", x: 0, y: 0 }, { id: "b", label: "B", description: "", x: 360, y: 0 },
    { id: "c", label: "C", description: "", x: 0, y: 240 }, { id: "d", label: "D", description: "", x: 360, y: 240 },
  ];
  const edges = [edge("ab1", "a", "b", 2), { ...edge("ab2", "a", "b", 2), parallelIndex: 1 }, edge("cd1", "c", "d", 2), { ...edge("cd2", "c", "d", 2), parallelIndex: 1 }];
  const positions = Object.fromEntries(nodes.map(({ id, x, y }) => [id, { x, y }]));
  const derive = (parallelBundleSpacingByKey: Record<string, number>) => deriveAutomaticRoutes({ graph: { nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [], parallelBundleSpacingByKey, parallelBundleMode: "bundle" });
  const local = derive({ "a\u0000b": 20, "c\u0000d": 8 });
  const reversed = derive({ "c\u0000d": 8, "a\u0000b": 20 });
  const allWide = derive({ "a\u0000b": 20, "c\u0000d": 20 });
  assert.deepEqual(local, reversed);
  assert.deepEqual(local.find(({ id }) => id === "ab1")!.samples, allWide.find(({ id }) => id === "ab1")!.samples);
  assert.notDeepEqual(local.find(({ id }) => id === "cd1")!.samples, allWide.find(({ id }) => id === "cd1")!.samples);
});

test("bounded joint selection avoids the prior primary cross-bundle regression", () => {
  const primary = row("parallel-self-loop-control");
  assert.deepEqual(primary.bundleLocalJoint.selected.spacingByKey, { "alpha\u0000beta": 20, "delta\u0000gamma": 12 });
  assert.deepEqual(primary.graphWideAdaptive.metrics.groups.find(({ key }: { key: string }) => key === "delta\u0000gamma").sideDistribution, { positive: 2 });
  assert.deepEqual(primary.bundleLocalJoint.selected.metrics.groups.find(({ key }: { key: string }) => key === "delta\u0000gamma").sideDistribution, { negative: 1, positive: 1 });
  assert.deepEqual(primary.bundleLocalJoint.selected.regressions, []);
  assert.equal(primary.bundleLocalJoint.selected.churn.count, 0);
});

test("selection stays bounded and exposes residual shared-endpoint coupling", () => {
  assert.deepEqual(artifact.rows.map(({ fixture }: { fixture: string }) => fixture), ["parallel-self-loop-control", "higher-multiplicity-5", "mixed-incident-parallel", "shared-endpoint-multiple-bundle", "lighthouse-en"]);
  assert.equal(row("higher-multiplicity-5").bundleLocalJoint.selected.spacingByKey["a\u0000b"], 16);
  assert.equal(row("mixed-incident-parallel").bundleLocalJoint.selected.spacingByKey["a\u0000b"], 24);
  assert.deepEqual(row("shared-endpoint-multiple-bundle").bundleLocalJoint.selected.spacingByKey, { "a\u0000b": 16, "a\u0000c": 16 });
  assert.equal(row("shared-endpoint-multiple-bundle").bundleLocalJoint.selected.metrics.labels.foreignCloserCount, 1);
  assert.equal(row("lighthouse-en").bundleLocalJoint.selected.spacingByKey["clara\u0000thomas"], 12);
  assert.ok(artifact.rows.every(({ bundleLocalJoint }: any) => bundleLocalJoint.search.combinations <= 42));
});

test("checkpoint remains diagnostic and preserves every standing boundary", () => {
  assert.equal(artifact.candidateIdentity, "product-owned-bundle-local-joint-feasibility-v1");
  assert.equal(artifact.localRelaxation, "not introduced");
  assert.equal(artifact.selfLoopPolicy, "unchanged");
  assert.equal(artifact.structuralPlacement, "unchanged");
  assert.equal(artifact.parallelIncidentArchitecture, "CLOSED");
  assert.deepEqual(artifact.standing, { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" });
});
