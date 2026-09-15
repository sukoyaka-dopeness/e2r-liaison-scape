import test from "node:test";
import assert from "node:assert/strict";
import { createPracticalityCases, positionsFor } from "../experimental/general-complex-practicality-gate1/fixture.ts";

test("Gate 1 matrix stays bounded, coordinate-less, and source-faithful", () => {
  const cases = createPracticalityCases();
  assert.deepEqual(cases.map(({ id }) => id), ["sparse", "dense", "long-label", "connected", "parallel-self-loop"]);
  for (const item of cases) {
    assert.equal(item.dataset.extensions, undefined);
    assert.equal(Object.keys(positionsFor(item, "fast")).length, item.dataset.entities.length);
    assert.equal(Object.keys(positionsFor(item, "hq")).length, item.dataset.entities.length);
  }
});

test("Fast and explicit HQ positions are deterministic for every control", () => {
  for (const item of createPracticalityCases()) {
    assert.deepEqual(positionsFor(item, "fast"), positionsFor(item, "fast"));
    assert.deepEqual(positionsFor(item, "hq"), positionsFor(item, "hq"));
  }
});
