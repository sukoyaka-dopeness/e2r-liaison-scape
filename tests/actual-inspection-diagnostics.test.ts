import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEntityGraph, getStoredCoordinates } from "../src/dataset.ts";
import { deriveAutomaticNodeLabels, deriveAutomaticRelationLabels, deriveAutomaticRoutes, deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel } from "../src/viewport.ts";
import { diagnoseRoute } from "../experimental/product-evaluation-seam/actual-inspection/routing-diagnostics.ts";

function wideApolloSnapshot() {
  const dataset = JSON.parse(readFileSync("experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json", "utf8"));
  const graph = buildEntityGraph(dataset);
  const positions = getStoredCoordinates(dataset);
  const names = new Map(dataset.relations.map((relation) => [relation.id, typeof relation.name === "string" ? relation.name : ""]));
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id] ?? node,
    node.label,
    node.description,
    [],
    graph.nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
    [],
  ));
  const edges = graph.edges.map((edge) => ({ ...edge, label: names.get(edge.id) ?? "" }));
  const routedEdges = deriveAutomaticRoutes({ graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels });
  const relationLabels = deriveAutomaticRelationLabels({ routedEdges, nodes: graph.nodes.map((node) => positions[node.id] ?? node), previousPlacements: new Map(), manualAnchors: new Map() });
  const nodeLabels = deriveAutomaticNodeLabels({ nodes: graph.nodes, positions, routedEdges, occupiedRelationLabels: relationLabels, previousPlacements: new Map(), manualOffsets: new Map() });
  return { nodes: graph.nodes, edges, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, routedEdges, relationLabels: [...relationLabels], nodeLabels: [...nodeLabels] };
}

test("low-density recovery control isolates a single temporary obstacle", () => {
  const dataset = JSON.parse(readFileSync("experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-low-density.en.e2r.json", "utf8"));
  const graphBase = buildEntityGraph(dataset);
  const relationNames = new Map(dataset.relations.map((relation) => [relation.id, typeof relation.name === "string" ? relation.name : ""]));
  const graph = { nodes: graphBase.nodes, edges: graphBase.edges.map((edge) => ({ ...edge, label: relationNames.get(edge.id) ?? "" })) };
  const initialPositions = getStoredCoordinates(dataset);
  const initial = deriveAutomaticRoutes({ graph, positions: initialPositions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: [] });
  const rerouted = deriveAutomaticRoutes({
    graph,
    positions: { ...initialPositions, obstacle: { x: 200, y: 0 } },
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map(initial.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
  });
  const returned = deriveAutomaticRoutes({
    graph,
    positions: initialPositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
    previousAutomaticRoutes: new Map(rerouted.map((route) => [route.id, route])),
    draggedNodeId: "obstacle",
  });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 1);
  assert.match(initial[0]!.path, / L /u);
  assert.match(rerouted[0]!.path, / Q /u);
  assert.equal(returned[0]!.path, initial[0]!.path);
});

test("wide Apollo routing diagnostic isolates provisional-label curvature", () => {
  const diagnostic = diagnoseRoute(wideApolloSnapshot(), "entity-10");
  assert.ok(diagnostic);
  const current = diagnostic.variants.find(({ name }) => name === "current")!;
  const withoutLabels = diagnostic.variants.find(({ name }) => name === "without-provisional-labels")!;
  const withoutNodes = diagnostic.variants.find(({ name }) => name === "without-node-influence")!;
  assert.equal(current.matchesCurrent, true);
  assert.equal(withoutLabels.matchesCurrent, false);
  assert.equal(withoutNodes.matchesCurrent, true);
  assert.match(diagnostic.reasons.join("\n"), /Provisional node-label bounds change the selected route/);
});

test("active Apollo drag preserves locality and necessary crowded incident routing", () => {
  const dataset = JSON.parse(readFileSync("experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json", "utf8"));
  const graphBase = buildEntityGraph(dataset);
  const relationNames = new Map(dataset.relations.map((relation) => [relation.id, typeof relation.name === "string" ? relation.name : ""]));
  const graph = { nodes: graphBase.nodes, edges: graphBase.edges.map((edge) => ({ ...edge, label: relationNames.get(edge.id) ?? "" })) };
  const basePositions = getStoredCoordinates(dataset);
  const provisionalLabels = (positions: Record<string, { x: number; y: number }>) => graph.nodes.map((node) => placeNodeLabel(
    positions[node.id] ?? node,
    node.label,
    node.description,
    [],
    graph.nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
    [],
  ));
  const initial = deriveBoundedAutomaticPresentation({
    graph,
    positions: basePositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(basePositions),
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
  });
  const activePresentation = (distance: number) => {
    const positions = { ...basePositions, "saturn-v": { x: basePositions["saturn-v"]!.x, y: basePositions["saturn-v"]!.y + distance } };
    const labels = provisionalLabels(positions);
    return deriveBoundedAutomaticPresentation({
      graph,
      positions,
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      provisionalNodeLabels: labels,
      previousNodeLabelPlacements: new Map(initial.nodeLabels),
      previousRelationLabelPlacements: new Map(initial.relationLabels),
      manualNodeLabelOffsets: new Map(),
      manualRelationLabelAnchors: new Map(),
      previousAutomaticRoutes: new Map(initial.routedEdges.map((route) => [route.id, route])),
      draggedNodeId: "saturn-v",
      activeDraggedNodeId: "saturn-v",
      activelyDraggedNodeId: "saturn-v",
      continuityNodeLabels: graph.nodes.map((node, index) => node.id === "saturn-v" ? labels[index]! : initial.nodeLabels.get(node.id)!),
      previousContinuityNodeLabels: new Map(initial.nodeLabels),
      feedbackEnabled: false,
    });
  };
  const changedIds = (presentation: ReturnType<typeof activePresentation>) => presentation.routedEdges
    .filter((route) => initial.routedEdges.find(({ id }) => id === route.id)?.path !== route.path)
    .map(({ id }) => id);

  // The initial 14.8-unit move changes only Saturn V's incident routes. In
  // particular, existing NASA-label overlap must not make unrelated routes
  // flip merely because active drag defers full feedback.
  assert.deepEqual(changedIds(activePresentation(14.8)), ["entity-8", "entity-10"]);
  // The same active label snapshot removes the provisional-label ghost
  // obstacle from the incident NASA -> Saturn V route: a small active move
  // keeps its straight candidate instead of waiting for pointer-up feedback.
  assert.match(activePresentation(45).routedEdges.find(({ id }) => id === "entity-8")!.path, / L /);
  // Once Saturn V enters entity-6's influence, that remote route remains free
  // to reroute: active continuity is not an unconditional visual freeze.
  assert.deepEqual(changedIds(activePresentation(160)), ["entity-6", "entity-8", "entity-10"]);

  // NASA moved right by 45 graph units is the crowded counterpart: the
  // straight NASA -> Saturn V route approaches Columbia's Node, so its curve
  // remains necessary in both active and feedback-settled presentations.
  const nasaPositions = { ...basePositions, nasa: { x: basePositions.nasa!.x + 45, y: basePositions.nasa!.y } };
  const nasaLabels = provisionalLabels(nasaPositions);
  const nasaActive = deriveBoundedAutomaticPresentation({
    graph,
    positions: nasaPositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: nasaLabels,
    previousNodeLabelPlacements: new Map(initial.nodeLabels),
    previousRelationLabelPlacements: new Map(initial.relationLabels),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    previousAutomaticRoutes: new Map(initial.routedEdges.map((route) => [route.id, route])),
    draggedNodeId: "nasa",
    activeDraggedNodeId: "nasa",
    activelyDraggedNodeId: "nasa",
    continuityNodeLabels: graph.nodes.map((node, index) => node.id === "nasa" ? nasaLabels[index]! : initial.nodeLabels.get(node.id)!),
    previousContinuityNodeLabels: new Map(initial.nodeLabels),
    feedbackEnabled: false,
  });
  const nasaFinal = deriveBoundedAutomaticPresentation({
    graph,
    positions: nasaPositions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: nasaLabels,
    previousNodeLabelPlacements: new Map(initial.nodeLabels),
    previousRelationLabelPlacements: new Map(initial.relationLabels),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    previousAutomaticRoutes: new Map(initial.routedEdges.map((route) => [route.id, route])),
    draggedNodeId: "nasa",
    feedbackEnabled: true,
  });
  const nasaActiveRoute = nasaActive.routedEdges.find(({ id }) => id === "entity-8")!;
  const nasaFinalRoute = nasaFinal.routedEdges.find(({ id }) => id === "entity-8")!;
  assert.match(nasaActiveRoute.path, / Q /);
  assert.match(nasaFinalRoute.path, / Q /);
  assert.equal(nasaActiveRoute.path, nasaFinalRoute.path);

  // Mirror the Product's committed active-drag lifecycle rather than jumping
  // directly from an obstructed position back to the origin. A direct route
  // may first recover to an intermediate fresh curve before its original
  // route is available; that must not discard the direct-obstacle origin.
  const stagedActive = (
    previous: ReturnType<typeof deriveBoundedAutomaticPresentation>,
    y: number,
  ) => {
    const positions = { ...basePositions, "saturn-v": { x: basePositions["saturn-v"]!.x, y } };
    const labels = provisionalLabels(positions);
    return deriveBoundedAutomaticPresentation({
      graph,
      positions,
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      provisionalNodeLabels: labels,
      previousNodeLabelPlacements: new Map(previous.nodeLabels),
      previousRelationLabelPlacements: new Map(previous.relationLabels),
      manualNodeLabelOffsets: new Map(),
      manualRelationLabelAnchors: new Map(),
      previousAutomaticRoutes: new Map(previous.routedEdges.map((route) => [route.id, route])),
      draggedNodeId: "saturn-v",
      activeDraggedNodeId: "saturn-v",
      activelyDraggedNodeId: "saturn-v",
      continuityNodeLabels: graph.nodes.map((node, index) => node.id === "saturn-v" ? labels[index]! : previous.nodeLabels.get(node.id)!),
      previousContinuityNodeLabels: new Map(previous.nodeLabels),
      feedbackEnabled: false,
    });
  };
  let staged = stagedActive(initial, 120);
  assert.equal(staged.routedEdges.find(({ id }) => id === "entity-6")?.activeRecoveryObstacleId, "saturn-v");
  staged = stagedActive(staged, 150);
  staged = stagedActive(staged, 170);
  assert.deepEqual(staged.routedEdges.filter(({ activeRecoveryObstacleId }) => activeRecoveryObstacleId === "saturn-v").map(({ id }) => id), ["entity-3", "entity-6"]);
  staged = stagedActive(staged, 140);
  // The intermediate fresh candidate for entity-6 is still curved here. Its
  // provenance must survive so the later safe original can recover actively.
  assert.equal(staged.routedEdges.find(({ id }) => id === "entity-6")?.activeRecoveryObstacleId, "saturn-v");
  staged = stagedActive(staged, 110);
  staged = stagedActive(staged, 80);
  staged = stagedActive(staged, 40);
  staged = stagedActive(staged, basePositions["saturn-v"]!.y);
  assert.equal(
    staged.routedEdges.find(({ id }) => id === "entity-6")?.path,
    initial.routedEdges.find(({ id }) => id === "entity-6")?.path,
  );
});

test("wide Apollo round trip restores the fresh safe remote route after obstacle removal", () => {
  const initial = wideApolloSnapshot();
  const graph = { nodes: initial.nodes, edges: initial.edges };
  const movedPositions = {
    ...initial.positions,
    "saturn-v": { x: initial.positions["saturn-v"]!.x, y: initial.positions["saturn-v"]!.y + 120 },
  };
  const moved = deriveAutomaticRoutes({
    graph,
    positions: movedPositions,
    edgeCurveOffsets: initial.edgeCurveOffsets,
    selfLoopOverrides: initial.selfLoopOverrides,
    provisionalNodeLabels: initial.provisionalNodeLabels,
    previousAutomaticRoutes: new Map(initial.routedEdges.map((route) => [route.id, route])),
    draggedNodeId: "saturn-v",
  });
  const decisions: Array<{ edgeId: string; recoveredCurrentRoute: boolean }> = [];
  const returned = deriveAutomaticRoutes({
    graph,
    positions: initial.positions,
    edgeCurveOffsets: initial.edgeCurveOffsets,
    selfLoopOverrides: initial.selfLoopOverrides,
    provisionalNodeLabels: initial.provisionalNodeLabels,
    previousAutomaticRoutes: new Map(moved.map((route) => [route.id, route])),
    draggedNodeId: "saturn-v",
    routeDecisionSink: (decision) => decisions.push(decision),
  });
  const initialRoute = initial.routedEdges.find(({ id }) => id === "entity-6")!;
  const movedRoute = moved.find(({ id }) => id === "entity-6")!;
  const returnedRoute = returned.find(({ id }) => id === "entity-6")!;
  assert.notEqual(movedRoute.path, initialRoute.path);
  assert.equal(returnedRoute.path, initialRoute.path);
  assert.equal(decisions.find(({ edgeId }) => edgeId === "entity-6")?.recoveredCurrentRoute, true);
});
