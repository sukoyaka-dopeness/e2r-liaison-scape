import assert from "node:assert/strict";
import test from "node:test";
import { settleExplicitSeedEvaluation } from "./adapter.ts";

const graph = {
  entities: [{ id: "a" }, { id: "b" }, { id: "c" }],
  relations: [
    { id: "ab", sourceId: "a", targetId: "b" },
    { id: "bc", sourceId: "b", targetId: "c" },
  ],
};

const positions = {
  a: { x: 10, y: 20 },
  b: { x: 30, y: 40 },
  c: { x: 50, y: 60 },
};

test("accepts complete exact Node-ID coverage", () => {
  const result = settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: positions, options: { iterations: 0 } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.coverage, "EXACT_NODE_ID_COVERAGE");
    assert.deepEqual(result.positions, positions);
  }
});

test("rejects a missing Node position before settling", () => {
  const { c: _removed, ...missing } = positions;
  assert.deepEqual(
    settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: missing }),
    { ok: false, code: "MISSING_NODE_POSITION" },
  );
});

test("rejects an extra Node position under exact coverage", () => {
  assert.deepEqual(
    settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: { ...positions, extra: { x: 0, y: 0 } } }),
    { ok: false, code: "EXTRA_NODE_POSITION" },
  );
});

test("rejects malformed and non-finite positions", () => {
  assert.deepEqual(
    settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: { ...positions, b: { x: NaN, y: 40 } } }),
    { ok: false, code: "NON_FINITE_POSITION" },
  );
  assert.deepEqual(
    settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: { ...positions, b: { x: "30", y: 40 } } }),
    { ok: false, code: "INVALID_POSITION_SHAPE" },
  );
  assert.deepEqual(
    settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: [] }),
    { ok: false, code: "INVALID_POSITION_SHAPE" },
  );
});

test("does not discard explicit seed values at zero, one, or three iterations", () => {
  const alternative = {
    a: { x: 210, y: 220 },
    b: { x: 230, y: 240 },
    c: { x: 250, y: 260 },
  };
  for (const iterations of [0, 1, 3]) {
    const first = settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: positions, options: { iterations } });
    const second = settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: alternative, options: { iterations } });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.notDeepEqual(first.positions, second.positions);
      assert.deepEqual(first.positions, settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: positions, options: { iterations } }).positions);
    }
  }
});

test("uses Product-owned P3 composition for multiple components", () => {
  const multiComponent = {
    entities: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    relations: [{ id: "ab", sourceId: "a", targetId: "b" }, { id: "cd", sourceId: "c", targetId: "d" }],
  };
  const initialPositions = { a: { x: 0, y: 0 }, b: { x: 20, y: 0 }, c: { x: 200, y: 0 }, d: { x: 220, y: 0 } };
  const result = settleExplicitSeedEvaluation({ layoutInput: multiComponent, initialPositions, options: { iterations: 3, componentGap: 144 } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(Object.keys(result.positions).length, 4);
});

test("keeps self and parallel Relation normalization in Product", () => {
  const normalizedGraphInput = {
    entities: [{ id: "a" }, { id: "b" }],
    relations: [
      { id: "self", sourceId: "a", targetId: "a" },
      { id: "ab-1", sourceId: "a", targetId: "b" },
      { id: "ab-2", sourceId: "b", targetId: "a" },
    ],
  };
  const result = settleExplicitSeedEvaluation({
    layoutInput: normalizedGraphInput,
    initialPositions: { a: { x: 10, y: 10 }, b: { x: 20, y: 20 } },
    options: { iterations: 3 },
  });
  assert.equal(result.ok, true);
});

test("supports non-ASCII Node IDs without changing exact coverage", () => {
  const input = {
    entities: [{ id: "a" }, { id: "aa" }, { id: "譁ｰ" }],
    relations: [],
  };
  const result = settleExplicitSeedEvaluation({
    layoutInput: input,
    initialPositions: { a: { x: 1, y: 2 }, aa: { x: 3, y: 4 }, "譁ｰ": { x: 5, y: 6 } },
    options: { iterations: 0 },
  });
  assert.equal(result.ok, true);
});

test("does not mutate layout or explicit position inputs", () => {
  const layoutInput = structuredClone(graph);
  const initialPositions = structuredClone(positions);
  const layoutBefore = structuredClone(layoutInput);
  const positionsBefore = structuredClone(initialPositions);
  const result = settleExplicitSeedEvaluation({ layoutInput, initialPositions, options: { iterations: 3 } });
  assert.equal(result.ok, true);
  assert.deepEqual(layoutInput, layoutBefore);
  assert.deepEqual(initialPositions, positionsBefore);
});

test("runs as a pure evaluation-only Node boundary", () => {
  const result = settleExplicitSeedEvaluation({ layoutInput: graph, initialPositions: positions, options: { iterations: 1 } });
  assert.equal(result.ok, true);
});
