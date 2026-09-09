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

test("active Apollo drag ignores an already accepted remote label overlap but still reroutes for new node influence", () => {
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
  // Once Saturn V enters entity-6's influence, that remote route remains free
  // to reroute: active continuity is not an unconditional visual freeze.
  assert.deepEqual(changedIds(activePresentation(160)), ["entity-6", "entity-8", "entity-10"]);
});
