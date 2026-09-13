import assert from "node:assert/strict";
import test from "node:test";
import { deriveAutomaticRoutes } from "../src/graph-presentation.ts";
import { ENTITY_ATTACHMENT_SHAPE, getEntityAttachment, routeSamplesHaveNodeInfluence } from "../src/viewport.ts";

type Node = { id: string; label: string; description: string; x: number; y: number };
type Edge = { id: string; sourceId: string; targetId: string; parallelIndex: number; parallelCount: number; label: string };

function routes(nodes: Node[], edges: Edge[], options: { spacing?: number; mode?: "pair" | "bundle" } = {}) {
  const positions = Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  return deriveAutomaticRoutes({
    graph: { nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    parallelBundleSpacing: options.spacing,
    parallelBundleMode: options.mode,
  });
}

function midpointSeparation(samples: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>) {
  const yValues = samples.map((path) => path[20]!.y).sort((left, right) => left - right);
  return Math.min(...yValues.slice(1).map((value, index) => value - yValues[index]!));
}

function sideSign(route: { controlPoint: { x: number; y: number }; sourceId: string; targetId: string }, nodes: Node[]) {
  const source = nodes.find(({ id }) => id === route.sourceId)!;
  const target = nodes.find(({ id }) => id === route.targetId)!;
  return Math.sign(
    (target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2)
      - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2),
  );
}

const endpoints: Node[] = [
  { id: "a", label: "A", description: "", x: 0, y: 0 },
  { id: "b", label: "B", description: "", x: 360, y: 0 },
];

function parallelEdges(sourceId = "a", targetId = "b", count = 2): Edge[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    sourceId,
    targetId,
    parallelIndex: index,
    parallelCount: count,
    label: `Parallel ${index + 1}`,
  }));
}

test("omitted bundle spacing is exactly the existing route behavior", () => {
  assert.deepEqual(
    routes(endpoints, parallelEdges()),
    routes(endpoints, parallelEdges(), { spacing: 0, mode: "bundle" }),
  );
});

test("pair spacing separates a two-Relation group without changing endpoint semantics", () => {
  const baseline = routes(endpoints, parallelEdges());
  const widened = routes(endpoints, parallelEdges(), { spacing: 16, mode: "pair" });
  assert.ok(midpointSeparation(widened.map(({ samples }) => samples)) > midpointSeparation(baseline.map(({ samples }) => samples)));
  for (const route of widened) {
    const source = endpoints.find(({ id }) => id === route.sourceId)!;
    const target = endpoints.find(({ id }) => id === route.targetId)!;
    assert.deepEqual(route.samples[0], getEntityAttachment({ center: source, direction: { x: route.controlPoint.x - source.x, y: route.controlPoint.y - source.y }, shape: ENTITY_ATTACHMENT_SHAPE }).point);
    assert.deepEqual(route.samples.at(-1), getEntityAttachment({ center: target, direction: { x: route.controlPoint.x - target.x, y: route.controlPoint.y - target.y }, shape: ENTITY_ATTACHMENT_SHAPE }).point);
  }
});

test("bundle spacing widens same-side slots in groups larger than two", () => {
  const edges = parallelEdges("a", "b", 3);
  const pair = routes(endpoints, edges, { spacing: 16, mode: "pair" });
  const bundle = routes(endpoints, edges, { spacing: 16, mode: "bundle" });
  assert.ok(midpointSeparation(bundle.map(({ samples }) => samples)) > midpointSeparation(pair.map(({ samples }) => samples)));
});

test("reverse-direction groups preserve opposite physical side ordering", () => {
  const forward = routes(endpoints, parallelEdges("a", "b"), { spacing: 16, mode: "bundle" });
  const reverse = routes(endpoints, parallelEdges("b", "a"), { spacing: 16, mode: "bundle" });
  assert.equal(sideSign(forward[0]!, endpoints), -sideSign(reverse[0]!, endpoints));
  assert.equal(sideSign(forward[1]!, endpoints), -sideSign(reverse[1]!, endpoints));
});

test("manual offsets and ordinary Relations are not changed by the opt-in parallel policy", () => {
  const nodes = [...endpoints, { id: "c", label: "C", description: "", x: 180, y: 160 }];
  const edges = [...parallelEdges(), { id: "ordinary", sourceId: "a", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "Ordinary" }];
  const baseline = routes(nodes, edges);
  const manuallyOffset = (spacing: number) => deriveAutomaticRoutes({
    graph: { nodes, edges },
    positions: Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    edgeCurveOffsets: { p1: 92 },
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    parallelBundleSpacing: spacing,
    parallelBundleMode: "bundle",
  });
  assert.deepEqual(manuallyOffset(16).find(({ id }) => id === "p1")!.samples, manuallyOffset(0).find(({ id }) => id === "p1")!.samples);
  assert.deepEqual(manuallyOffset(16).find(({ id }) => id === "ordinary")!.samples, baseline.find(({ id }) => id === "ordinary")!.samples);
});

test("bundle spacing coexists with obstacle arbitration", () => {
  const nodes: Node[] = [
    ...endpoints,
    { id: "obstacle", label: "Obstacle", description: "", x: 180, y: 70 },
    { id: "c", label: "C", description: "", x: 180, y: 260 },
  ];
  const edges = [...parallelEdges(), { id: "vertical", sourceId: "obstacle", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "Vertical" }];
  const widened = routes(nodes, edges, { spacing: 16, mode: "bundle" });
  const firstParallel = widened.find(({ id }) => id === "p1")!;
  assert.equal(routeSamplesHaveNodeInfluence(firstParallel.samples, [{ x: 180, y: 70 }]), false);
});

test("self-loop geometry is outside the parallel bundle policy", () => {
  const node: Node = { id: "a", label: "A", description: "", x: 0, y: 0 };
  const edge: Edge = { id: "loop", sourceId: "a", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "Loop" };
  assert.deepEqual(routes([node], [edge])[0]!.samples, routes([node], [edge], { spacing: 16, mode: "bundle" })[0]!.samples);
});
