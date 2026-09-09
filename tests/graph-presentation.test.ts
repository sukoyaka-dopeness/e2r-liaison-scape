import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveBoundedAutomaticPresentation,
  deriveAutomaticNodeLabels,
  deriveAutomaticRelationLabels,
  deriveAutomaticRoutes,
  type AutomaticNodeLabelInput,
  type AutomaticRelationLabelInput,
  type AutomaticRoutingInput,
} from "../src/graph-presentation.ts";
import { routeGraphEdge } from "../src/viewport.ts";

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

function relationLabelInput(overrides: Partial<AutomaticRelationLabelInput> = {}): AutomaticRelationLabelInput {
  const routingInput = input();
  return {
    routedEdges: deriveAutomaticRoutes(routingInput),
    nodes: routingInput.graph.nodes.map(({ x, y }) => ({ x, y })),
    previousPlacements: new Map(),
    manualAnchors: new Map(),
    ...overrides,
  };
}

function nodeLabelInput(overrides: Partial<AutomaticNodeLabelInput> = {}): AutomaticNodeLabelInput {
  const routingInput = input();
  return {
    nodes: routingInput.graph.nodes,
    positions: routingInput.positions,
    routedEdges: deriveAutomaticRoutes(routingInput),
    occupiedRelationLabels: new Map(),
    previousPlacements: new Map(),
    manualOffsets: new Map(),
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

test("active local Node drag preserves a safe previous non-incident route", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 120, y: 0 },
      { id: "c", label: "C", description: "", x: 240, y: 200 },
      { id: "d", label: "D", description: "", x: 440, y: 200 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" },
      { id: "cd", sourceId: "c", targetId: "d", parallelIndex: 0, parallelCount: 1, label: "CD" },
    ],
  };
  const positions = { a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, c: { x: 240, y: 200 }, d: { x: 440, y: 200 } };
  const initial = deriveAutomaticRoutes({ graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] });
  const movedPositions = { ...positions, a: { x: 0, y: 40 } };
  const moved = deriveAutomaticRoutes({
    graph,
    positions: movedPositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map(initial.map((route) => [route.id, route])),
    draggedNodeId: "a",
  });
  assert.deepEqual(moved.find(({ id }) => id === "cd"), initial.find(({ id }) => id === "cd"));
});

test("finalizing a temporary obstacle round trip recovers the fresh safe route", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 300, y: 0 },
      { id: "obstacle", label: "Obstacle", description: "", x: 150, y: 180 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "A to B" }],
  };
  const common = { graph, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] };
  const initialPositions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, obstacle: { x: 150, y: 180 } };
  const initial = deriveAutomaticRoutes({ ...common, positions: initialPositions });
  const rerouted = deriveAutomaticRoutes({
    ...common,
    positions: { ...initialPositions, obstacle: { x: 150, y: 0 } },
    previousAutomaticRoutes: new Map(initial.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
  });
  const decisions: Array<{ edgeId: string; usedPreviousRoute: boolean; recoveredCurrentRoute: boolean }> = [];
  const returned = deriveAutomaticRoutes({
    ...common,
    positions: initialPositions,
    previousAutomaticRoutes: new Map(rerouted.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
    routeDecisionSink: (decision) => decisions.push(decision),
  });
  assert.match(initial[0]!.path, / L /u);
  assert.match(rerouted[0]!.path, / Q /u);
  assert.equal(returned[0]!.path, initial[0]!.path);
  assert.equal(decisions[0]!.usedPreviousRoute, false);
  assert.equal(decisions[0]!.recoveredCurrentRoute, true);
});

test("active drag eagerly recovers only a detour directly caused by that Node", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 300, y: 0 },
      { id: "obstacle", label: "Obstacle", description: "", x: 150, y: 180 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "A to B" }],
  };
  const common = { graph, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] };
  const initialPositions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, obstacle: { x: 150, y: 180 } };
  const initial = deriveAutomaticRoutes({ ...common, positions: initialPositions });
  const activeObstacle = deriveAutomaticRoutes({
    ...common,
    positions: { ...initialPositions, obstacle: { x: 150, y: 0 } },
    previousAutomaticRoutes: new Map(initial.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
    activeDraggedNodeId: "obstacle",
  });
  assert.match(activeObstacle[0]!.path, / Q /u);
  assert.equal(activeObstacle[0]!.activeRecoveryObstacleId, "obstacle");
  const decisions: Array<{ usedPreviousRoute: boolean; recoveredCurrentRoute: boolean }> = [];
  const activeReturn = deriveAutomaticRoutes({
    ...common,
    positions: initialPositions,
    previousAutomaticRoutes: new Map(activeObstacle.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
    activeDraggedNodeId: "obstacle",
    routeDecisionSink: (decision) => decisions.push(decision),
  });
  assert.equal(activeReturn[0]!.path, initial[0]!.path);
  assert.equal(activeReturn[0]!.activeRecoveryObstacleId, undefined);
  assert.equal(decisions[0]!.usedPreviousRoute, false);
  assert.equal(decisions[0]!.recoveredCurrentRoute, true);
});

test("active drag does not eagerly replace a safe remote route without direct-obstacle provenance", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 300, y: 0 },
      { id: "obstacle", label: "Obstacle", description: "", x: 150, y: 180 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "A to B" }],
  };
  const previous = routeGraphEdge({ x: 0, y: 0 }, { x: 300, y: 0 }, 0, 1, [], [], false, 0, 108);
  const presentation = deriveAutomaticRoutes({
    graph,
    positions: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, obstacle: { x: 150, y: 180 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map([["ab", { ...graph.edges[0], ...previous, parallelSolverEligible: false }]]),
    draggedNodeId: "obstacle",
    activeDraggedNodeId: "obstacle",
  });
  assert.equal(presentation[0]!.path, previous.path);
});

test("route decision trace records safe non-incident continuity without changing routing", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 120, y: 0 },
      { id: "c", label: "C", description: "", x: 240, y: 200 },
      { id: "d", label: "D", description: "", x: 440, y: 200 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" },
      { id: "cd", sourceId: "c", targetId: "d", parallelIndex: 0, parallelCount: 1, label: "CD" },
    ],
  };
  const positions = { a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, c: { x: 240, y: 200 }, d: { x: 440, y: 200 } };
  const initial = deriveAutomaticRoutes({ graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] });
  const decisions: Array<{ edgeId: string; usedPreviousRoute: boolean }> = [];
  const moved = deriveAutomaticRoutes({
    graph,
    positions: { ...positions, a: { x: 0, y: 40 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map(initial.map((route) => [route.id, route])),
    draggedNodeId: "a",
    routeDecisionSink: (decision) => decisions.push(decision),
  });
  assert.deepEqual(moved.find(({ id }) => id === "cd"), initial.find(({ id }) => id === "cd"));
  assert.equal(decisions.find(({ edgeId }) => edgeId === "cd")?.usedPreviousRoute, true);
});

test("incident automatic routes can prefer a safe previous side", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 300, y: 0 },
      { id: "obstacle", label: "Obstacle", description: "", x: 150, y: 0 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" }],
  };
  const previousGeometry = routeGraphEdge(
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    0,
    1,
    [{ x: 150, y: 0 }],
    [],
    false,
    0,
    -108,
  );
  const decisions = [];
  const presentation = deriveAutomaticRoutes({
    graph,
    positions: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, obstacle: { x: 150, y: 0 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map([[
      "ab",
      { ...graph.edges[0], ...previousGeometry, parallelSolverEligible: false },
    ]]),
    draggedNodeId: "a",
    routeDecisionSink: (decision) => decisions.push(decision),
  });
  const selected = decisions.find(({ edgeId, pass }) => edgeId === "ab" && pass === "first")!.candidateDiagnostics.find(({ selected: isSelected }) => isSelected)!;
  assert.equal(Math.sign(selected.offset), -1);
  assert.equal(selected.nodeOverlapScore, 0);
  assert.equal(selected.occupiedPathConflict, false);
  assert.equal(presentation[0]!.path.includes(" Q "), true);
});

test("finalizing Node drag preserves a safe previous non-incident route", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", description: "", x: 0, y: 0 },
      { id: "b", label: "B", description: "", x: 120, y: 0 },
      { id: "c", label: "C", description: "", x: 240, y: 200 },
      { id: "d", label: "D", description: "", x: 440, y: 200 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" },
      { id: "cd", sourceId: "c", targetId: "d", parallelIndex: 0, parallelCount: 1, label: "CD" },
    ],
  };
  const positions = { a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, c: { x: 240, y: 200 }, d: { x: 440, y: 200 } };
  const movedPositions = { ...positions, a: { x: 0, y: 40 } };
  const common = {
    graph,
    positions: movedPositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  };
  const initial = deriveBoundedAutomaticPresentation({ ...common, positions });
  const active = deriveBoundedAutomaticPresentation({
    ...common,
    previousAutomaticRoutes: new Map(initial.routedEdges.map((route) => [route.id, route])),
    draggedNodeId: "a",
    activelyDraggedNodeId: "a",
    feedbackEnabled: false,
  });
  const final = deriveBoundedAutomaticPresentation({
    ...common,
    previousAutomaticRoutes: new Map(active.routedEdges.map((route) => [route.id, route])),
    previousNodeLabelPlacements: new Map(active.nodeLabels),
    previousRelationLabelPlacements: new Map(active.relationLabels),
    draggedNodeId: "a",
    feedbackEnabled: true,
  });
  assert.deepEqual(final.routedEdges.find(({ id }) => id === "cd"), active.routedEdges.find(({ id }) => id === "cd"));
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

test("bounded presentation feedback uses final Node-label bounds exactly once", () => {
  const provisional = [{ x: 100, y: -12, width: 80, height: 24, directionX: 0, directionY: 1 }];
  const base = input({ provisionalNodeLabels: provisional });
  const makePresentation = () => deriveBoundedAutomaticPresentation({
    ...base,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  });
  const presentation = makePresentation();
  assert.equal(presentation.feedbackApplied, true);
  assert.deepEqual(presentation, makePresentation());
  const finalLabels = base.graph.nodes.map((node, index) => presentation.nodeLabels.get(node.id) ?? provisional[index]!);
  assert.deepEqual(
    presentation.routedEdges,
    deriveAutomaticRoutes({ ...base, provisionalNodeLabels: finalLabels }),
  );
});

test("active Node drag can defer bounded feedback until drag end", () => {
  const provisional = [{ x: 100, y: -12, width: 80, height: 24, directionX: 0, directionY: 1 }];
  const base = input({ provisionalNodeLabels: provisional });
  const activeDrag = deriveBoundedAutomaticPresentation({
    ...base,
    feedbackEnabled: false,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  });
  assert.equal(activeDrag.feedbackApplied, false);
  assert.deepEqual(
    activeDrag.routedEdges,
    deriveAutomaticRoutes({ ...base, provisionalNodeLabels: provisional }),
  );
});

test("bounded feedback preserves manual curve authority", () => {
  const base = input({ edgeCurveOffsets: { ab: 54 } });
  const presentation = deriveBoundedAutomaticPresentation({
    ...base,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  });
  assert.deepEqual(presentation.routedEdges[0]!.controlPoint, { x: 100, y: 54 });
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

test("same inputs produce exact deterministic Node-label results", () => {
  assert.deepEqual(deriveAutomaticNodeLabels(nodeLabelInput()), deriveAutomaticNodeLabels(nodeLabelInput()));
});

test("same inputs produce exact deterministic Relation-label results", () => {
  assert.deepEqual(deriveAutomaticRelationLabels(relationLabelInput()), deriveAutomaticRelationLabels(relationLabelInput()));
});

test("current Node positions drive automatic Node-label recomputation", () => {
  const first = deriveAutomaticNodeLabels(nodeLabelInput());
  const second = deriveAutomaticNodeLabels(nodeLabelInput({ positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 80 }, c: { x: 100, y: 120 } } }));
  assert.notDeepEqual(first, second);
});

test("current route geometry drives automatic Relation-label follow", () => {
  const base = input();
  const first = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes(base),
  });
  const second = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes({ ...base, edgeCurveOffsets: { ab: 54 } }),
  });
  assert.notDeepEqual(first.get("ab"), second.get("ab"));
});

test("curve-offset-induced route changes move the automatic Relation label", () => {
  const base = input();
  const first = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes(base),
  }).get("ab");
  const second = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes({ ...base, edgeCurveOffsets: { ab: 54 } }),
  }).get("ab");
  assert.notDeepEqual(first, second);
});

test("self-loop route changes move the automatic Relation label", () => {
  const base = input({
    graph: { nodes: input().graph.nodes, edges: [{ id: "aa", sourceId: "a", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "AA" }] },
  });
  const first = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes(base),
  }).get("aa");
  const second = deriveAutomaticRelationLabels({
    ...relationLabelInput(),
    routedEdges: deriveAutomaticRoutes({ ...base, selfLoopOverrides: { aa: { orientation: Math.PI / 2, radius: 72 } } }),
  }).get("aa");
  assert.notDeepEqual(first, second);
});

test("occupied Relation-label rectangles preserve deterministic collision order", () => {
  const routingInput = input({
    graph: {
      nodes: input().graph.nodes,
      edges: [
        { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "First" },
        { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "Second" },
      ],
    },
  });
  const labelInput = relationLabelInput({
    routedEdges: deriveAutomaticRoutes(routingInput),
    nodes: routingInput.graph.nodes.map(({ x, y }) => ({ x, y })),
  });
  const first = deriveAutomaticRelationLabels(labelInput);
  const second = deriveAutomaticRelationLabels(labelInput);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.get("ab"), first.get("bc"));
});

test("Node-label derivation consumes Relation-label rectangles before Node order", () => {
  const base = deriveAutomaticNodeLabels(nodeLabelInput());
  const occupied = new Map([["synthetic", { x: 0, y: 50, width: 48, height: 20, directionX: 0, directionY: 1 }]]);
  const withRelationLabel = deriveAutomaticNodeLabels(nodeLabelInput({ occupiedRelationLabels: occupied }));
  assert.notDeepEqual(base.get("a"), withRelationLabel.get("a"));
});

test("manual Node-label offset data remains input-only and unmodified", () => {
  const manualOffsets = new Map([["a", { x: 15, y: -10 }]]);
  const value = nodeLabelInput({ manualOffsets });
  const before = structuredClone(value);
  const result = deriveAutomaticNodeLabels(value).get("a")!;
  assert.deepEqual(value, before);
  assert.equal(result.x, value.positions.a!.x + 15);
  assert.equal(result.y, value.positions.a!.y - 10);
});

test("manual Relation-label anchor data remains input-only and unmodified", () => {
  const manualAnchors = new Map([["ab", { fraction: 0.5, tangentOffset: 3, normalOffset: 10 }]]);
  const value = relationLabelInput({ manualAnchors });
  const before = structuredClone(value);
  deriveAutomaticRelationLabels(value);
  assert.deepEqual(value, before);
});

test("label derivation does not mutate graph, routes, or geometry snapshots", () => {
  const relation = relationLabelInput();
  const node = nodeLabelInput({ routedEdges: relation.routedEdges });
  const before = structuredClone({ relation, node });
  deriveAutomaticRelationLabels(relation);
  deriveAutomaticNodeLabels(node);
  assert.deepEqual({ relation, node }, before);
});

test("automatic label output follows the exact current App processing order", () => {
  const routingInput = input({
    graph: {
      nodes: input().graph.nodes,
      edges: [
        { id: "z", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "Z" },
        { id: "a", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "A" },
      ],
    },
  });
  const result = deriveAutomaticRelationLabels({
    routedEdges: deriveAutomaticRoutes(routingInput),
    nodes: routingInput.graph.nodes.map(({ x, y }) => ({ x, y })),
    previousPlacements: new Map(),
    manualAnchors: new Map(),
  });
  assert.deepEqual([...result.keys()], ["z", "a"]);
});
