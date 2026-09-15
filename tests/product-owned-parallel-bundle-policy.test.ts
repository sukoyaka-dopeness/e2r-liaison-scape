import assert from "node:assert/strict";
import test from "node:test";
import { deriveProductParallelBundlePolicy } from "../src/product-parallel-bundle-policy.ts";

const edge = (id: string, sourceId: string, targetId: string, parallelCount: number, label = "link") => ({ id, sourceId, targetId, parallelCount, label });

test("adaptive Product bundle policy ignores ordinary and Self-loop demand", () => {
  assert.deepEqual(deriveProductParallelBundlePolicy([
    edge("ordinary", "a", "b", 1),
    edge("loop", "a", "a", 4),
  ]), { spacing: 0, mode: "bundle", maxParallelCount: 0, hasReverseDirectionPair: false, maximumLabelWidth: 0, reason: "no-parallel" });
});

test("adaptive Product bundle policy distinguishes same-direction, reverse, and multiplicity demand", () => {
  assert.equal(deriveProductParallelBundlePolicy([edge("a1", "a", "b", 2), edge("a2", "a", "b", 2)]).spacing, 8);
  assert.equal(deriveProductParallelBundlePolicy([edge("a1", "a", "b", 2), edge("b1", "b", "a", 2)]).spacing, 16);
  assert.equal(deriveProductParallelBundlePolicy(Array.from({ length: 5 }, (_, index) => edge(`p${index}`, "a", "b", 5, "longer relation label"))).spacing, 28);
});

test("adaptive Product bundle policy is bounded and deterministic", () => {
  const edges = [edge("b", "b", "a", 3, "a longer Relation label"), edge("a", "a", "b", 3, "a longer Relation label")];
  const first = deriveProductParallelBundlePolicy(edges);
  const second = deriveProductParallelBundlePolicy([...edges].reverse());
  assert.deepEqual(first, second);
  assert.ok(first.spacing >= 0 && first.spacing <= 32);
});
