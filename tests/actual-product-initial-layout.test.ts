import test from "node:test";
import assert from "node:assert/strict";
import { deriveActualProductInitialLayout } from "../src/actual-product-initial-layout.ts";

const nodes = [{ id: "a", label: "Alpha", description: "" }, { id: "b", label: "Beta", description: "" }];
const edges = [{ id: "ab", sourceId: "a", targetId: "b", label: "connects" }];

test("coarse opt-in applies only to coordinate-less Product graphs", () => {
  const result = deriveActualProductInitialLayout({ nodes, edges, storedPositions: {}, optIn: "coarse-objective-prototype-v1" });
  assert.equal(result.authority, "bounded-provider");
  assert.equal(result.strategy, "coarse-objective-prototype-v1");
  assert.equal(result.provider, "coarse-objective-prototype-v1");
  assert.equal(result.status, "prototype");
  assert.ok(Object.values(result.positions).every((point) => Number.isInteger(point.x) && Number.isInteger(point.y)));
});

test("fully stored coordinates remain authoritative under coarse opt-in", () => {
  const result = deriveActualProductInitialLayout({ nodes, edges, storedPositions: { a: { x: 10, y: 20 }, b: { x: 200, y: 220 } }, optIn: "coarse-objective-prototype-v1" });
  assert.deepEqual(result.positions, { a: { x: 10, y: 20 }, b: { x: 200, y: 220 } });
  assert.equal(result.authority, "stored");
  assert.equal(result.provider, "stored-coordinates");
});

test("mixed coordinates retain existing Product completion semantics", () => {
  const result = deriveActualProductInitialLayout({ nodes, edges, storedPositions: { a: { x: 10, y: 20 } }, optIn: "coarse-objective-prototype-v1" });
  assert.deepEqual(result.positions.a, { x: 10, y: 20 });
  assert.equal(result.authority, "mixed-completion");
  assert.equal(result.provider, "current-product");
});

test("without opt-in coordinate-less graphs retain the current Product provider", () => {
  const result = deriveActualProductInitialLayout({ nodes, edges, storedPositions: {} });
  assert.equal(result.authority, "current");
  assert.equal(result.provider, "current-product");
  assert.equal(result.strategy, undefined);
  assert.ok(Object.values(result.positions).every((point) => Number.isInteger(point.x) && Number.isInteger(point.y)));
});

test("stored fractional coordinates remain authoritative and unrounded", () => {
  const result = deriveActualProductInitialLayout({
    nodes,
    edges,
    storedPositions: { a: { x: 10.25, y: 20.75 }, b: { x: 200.5, y: 220.125 } },
  });
  assert.deepEqual(result.positions, { a: { x: 10.25, y: 20.75 }, b: { x: 200.5, y: 220.125 } });
  assert.equal(result.authority, "stored");
});

test("mixed fractional coordinates remain authoritative while completion stays Product-owned", () => {
  const result = deriveActualProductInitialLayout({
    nodes,
    edges,
    storedPositions: { a: { x: 10.25, y: 20.75 } },
  });
  assert.deepEqual(result.positions.a, { x: 10.25, y: 20.75 });
  assert.equal(result.authority, "mixed-completion");
});
