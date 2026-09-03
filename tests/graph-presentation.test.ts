import assert from "node:assert/strict";
import test from "node:test";
import { deriveAutomaticRoutes, type AutomaticRoutingInput } from "../src/graph-presentation.ts";

function input(overrides: Partial<AutomaticRoutingInput> = {}): AutomaticRoutingInput {
  return {
    graph: {
      nodes: [
        { id: "a", label: "A", description: "", x: 0, y: 0 },
        { id: "b", label: "B", description: "", x: 200, y: 0 },
        { id: "c", label: "C", description: "", x: 100, y: 120 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" }],
    },
    positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 120 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    ...overrides,
  };
}

test("same input produces exact deterministic route output", () => {
  assert.deepEqual(deriveAutomaticRoutes(input()), deriveAutomaticRoutes(input()));
});

test("current Node positions drive route recomputation", () => {
  const first = deriveAutomaticRoutes(input())[0]!;
  const second = deriveAutomaticRoutes(input({ positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 80 }, c: { x: 100, y: 120 } } }))[0]!;
  assert.notEqual(first.path, second.path);
  assert.notDeepEqual(first.samples, second.samples);
});

test("current curve offsets drive route and control-point recomputation", () => {
  const first = deriveAutomaticRoutes(input())[0]!;
  const second = deriveAutomaticRoutes(input({ edgeCurveOffsets: { ab: 54 } }))[0]!;
  assert.notEqual(first.path, second.path);
  assert.notDeepEqual(first.controlPoint, second.controlPoint);
});

test("current self-loop overrides drive self-loop recomputation", () => {
  const selfLoop = input({
    graph: { nodes: input().graph.nodes, edges: [{ id: "aa", sourceId: "a", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "AA" }] },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
  });
  const first = deriveAutomaticRoutes(selfLoop)[0]!;
  const second = deriveAutomaticRoutes({ ...selfLoop, selfLoopOverrides: { aa: { orientation: Math.PI / 2, radius: 72 } } })[0]!;
  assert.notEqual(first.path, second.path);
  assert.notDeepEqual(first.controlPoint, second.controlPoint);
});

test("fixed-first and automatic priority remain independent of graph edge order", () => {
  const automatic = { id: "automatic", sourceId: "a", targetId: "b", parallelIndex: 1, parallelCount: 2, label: "automatic" };
  const fixed = { id: "fixed", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 2, label: "fixed" };
  const base = input({ graph: { nodes: input().graph.nodes, edges: [automatic, fixed] }, edgeCurveOffsets: { fixed: 0 } });
  const reversed = { ...base, graph: { ...base.graph, edges: [fixed, automatic] } };
  const byId = (routes: ReturnType<typeof deriveAutomaticRoutes>) => new Map(routes.map((route) => [route.id, route]));
  assert.deepEqual(byId(deriveAutomaticRoutes(base)), byId(deriveAutomaticRoutes(reversed)));
});

test("occupied-path sequencing and parallel eligibility remain deterministic", () => {
  const graph = {
    nodes: input().graph.nodes,
    edges: [
      { id: "ab-0", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 2, label: "" },
      { id: "ab-1", sourceId: "a", targetId: "b", parallelIndex: 1, parallelCount: 2, label: "" },
    ],
  };
  const first = deriveAutomaticRoutes(input({ graph }));
  const second = deriveAutomaticRoutes(input({ graph }));
  assert.deepEqual(first, second);
  assert.equal(first.every((route) => route.parallelSolverEligible), true);
});

test("supplied provisional Node-label geometry is consumed as route input", () => {
  const labelRect = { x: 80, y: -12, width: 40, height: 24, directionX: 0, directionY: 1 };
  const withoutLabel = deriveAutomaticRoutes(input())[0]!;
  const withLabel = deriveAutomaticRoutes(input({ provisionalNodeLabels: [labelRect] }))[0]!;
  assert.notEqual(withoutLabel.path, withLabel.path);
});

test("overlapping endpoint pairs preserve deterministic overlap indexing", () => {
  const graph = {
    nodes: input().graph.nodes,
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "" },
      { id: "ca", sourceId: "c", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "" },
    ],
  };
  const positions = { a: { x: 40, y: 40 }, b: { x: 40, y: 40 }, c: { x: 40, y: 40 } };
  const routes = deriveAutomaticRoutes(input({ graph, positions }));
  assert.notEqual(routes[0]!.path, routes[1]!.path);
  assert.deepEqual(routes, deriveAutomaticRoutes(input({ graph, positions })));
});

test("does not mutate graph, positions, labels, or override snapshots", () => {
  const value = input({
    edgeCurveOffsets: { ab: 12 },
    selfLoopOverrides: {},
    provisionalNodeLabels: [{ x: 80, y: -12, width: 40, height: 24, directionX: 0, directionY: 1 }],
  });
  const before = structuredClone(value);
  deriveAutomaticRoutes(value);
  assert.deepEqual(value, before);
});

test("returns routes in the original graph.edges order", () => {
  const graph = {
    nodes: input().graph.nodes,
    edges: [
      { id: "z", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "Z" },
      { id: "a", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "A" },
    ],
  };
  assert.deepEqual(deriveAutomaticRoutes(input({ graph })).map(({ id }) => id), ["z", "a"]);
});
