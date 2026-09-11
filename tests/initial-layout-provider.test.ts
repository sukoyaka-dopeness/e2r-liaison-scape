import test from "node:test";
import assert from "node:assert/strict";
import { deriveBoundedInitialLayout } from "../src/initial-layout-provider.ts";

const input = {
  entities: [
    { id: "a", label: "Alpha", description: "one" },
    { id: "b", label: "Beta", description: "two" },
    { id: "c", label: "Gamma", description: "three" },
  ],
  relations: [
    { id: "ab", sourceId: "a", targetId: "b" },
    { id: "bc", sourceId: "b", targetId: "c" },
  ],
};

test("bounded provider is deterministic, complete, and does not mutate input", () => {
  const first = deriveBoundedInitialLayout(input);
  const second = deriveBoundedInitialLayout({ ...input, entities: [...input.entities].reverse() });
  assert.equal(first.status, "prototype");
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(input.entities.map(({ id }) => id), ["a", "b", "c"]);
  assert.equal(Object.keys(first.positions).length, 3);
});

test("hidden non-Entity endpoints are ignored like the Product graph projection", () => {
  const result = deriveBoundedInitialLayout({ ...input, relations: [...input.relations, { id: "hidden", sourceId: "a", targetId: "event-1" }] });
  assert.equal(result.status, "prototype");
  assert.equal(Object.keys(result.positions).length, 3);
});

test("coarse objective is available through the bounded provider boundary", () => {
  const first = deriveBoundedInitialLayout({ ...input, strategy: "coarse-objective-prototype-v1" });
  const second = deriveBoundedInitialLayout({ ...input, entities: [...input.entities].reverse(), strategy: "coarse-objective-prototype-v1" });
  assert.equal(first.status, "prototype");
  assert.equal(first.provider, "coarse-objective-prototype-v1");
  assert.equal(first.strategy, "coarse-objective-prototype-v1");
  assert.equal(first.ownership, "derived");
  assert.deepEqual(first.positions, second.positions);
});

test("duplicate Entity IDs fall back to current placement", () => {
  const result = deriveBoundedInitialLayout({ ...input, entities: [...input.entities, { id: "a", label: "Duplicate" }] });
  assert.equal(result.status, "fallback");
  assert.equal(result.provider, "current-fallback");
  assert.equal(result.reason, "invalid-input");
  assert.equal(result.ownership, "derived");
});

test("budget exhaustion falls back without exposing a partial candidate", () => {
  const result = deriveBoundedInitialLayout({ ...input, budgetMs: 1, maxIterations: 100 });
  assert.equal(result.status, "fallback");
  assert.equal(result.provider, "current-fallback");
  assert.equal(result.reason, "budget-exceeded");
});

test("coarse budget exhaustion falls back as a whole result", () => {
  const result = deriveBoundedInitialLayout({ ...input, strategy: "coarse-objective-prototype-v1", budgetMs: 1, maxIterations: 100 });
  assert.equal(result.status, "fallback");
  assert.equal(result.provider, "current-fallback");
  assert.equal(result.strategy, "coarse-objective-prototype-v1");
  assert.equal(result.reason, "budget-exceeded");
});
