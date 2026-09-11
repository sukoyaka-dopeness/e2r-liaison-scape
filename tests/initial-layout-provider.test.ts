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

test("invalid input falls back to current placement", () => {
  const result = deriveBoundedInitialLayout({ ...input, relations: [{ id: "bad", sourceId: "a", targetId: "missing" }] });
  assert.equal(result.status, "fallback");
  assert.equal(result.provider, "current-fallback");
  assert.equal(result.reason, "invalid-input");
});

test("budget exhaustion falls back without exposing a partial candidate", () => {
  const result = deriveBoundedInitialLayout({ ...input, budgetMs: 1, maxIterations: 100 });
  assert.equal(result.status, "fallback");
  assert.equal(result.provider, "current-fallback");
  assert.equal(result.reason, "budget-exceeded");
});
