import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEntityGraph, getStoredCoordinates } from "../src/dataset.ts";
import { deriveAutomaticNodeLabels, deriveAutomaticRelationLabels, deriveAutomaticRoutes } from "../src/graph-presentation.ts";
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
