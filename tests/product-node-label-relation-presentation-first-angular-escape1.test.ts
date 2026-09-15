import assert from "node:assert/strict";
import test from "node:test";
import artifact from "../experimental/product-node-label-relation-presentation-first-angular-escape1/result-summary.json" with { type: "json" };
import { deriveAutomaticNodeLabels, deriveAutomaticRoutes } from "../src/graph-presentation.ts";
import { placeNodeLabel, type Point } from "../src/viewport.ts";

function simpleNodeInput() {
  const nodes = [
    { id: "a", label: "A", description: "", x: 0, y: 0 },
    { id: "b", label: "B", description: "", x: 240, y: 0 },
  ];
  const positions: Record<string, Point> = { a: { x: 0, y: 0 }, b: { x: 240, y: 0 } };
  const routedEdges = deriveAutomaticRoutes({
    graph: { nodes, edges: [{ id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "relation" }] },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: [],
  });
  return { nodes, positions, routedEdges };
}

test("Node-label angular diagnostic keeps the default candidate output unchanged", () => {
  const traces: any[] = [];
  const withoutTrace = placeNodeLabel({ x: 0, y: 0 }, "Node", "", [], [], []);
  const withTrace = placeNodeLabel({ x: 0, y: 0 }, "Node", "", [], [], [], undefined, [], undefined, undefined, undefined, undefined, (candidates) => traces.push(candidates));
  assert.deepEqual(withTrace, withoutTrace);
  assert.equal(traces[0]?.length, 32);
  assert.ok(traces[0]?.every((candidate: any) => candidate.incidentAngularPressure === 0 && candidate.relationLabelAngularPressure === 0));
});

test("angular occupancy is an opt-in scoring signal and can escape a marked sector", () => {
  const current = placeNodeLabel({ x: 0, y: 0 }, "Node", "", [], [], []);
  const traces: any[] = [];
  const escaped = placeNodeLabel(
    { x: 0, y: 0 }, "Node", "", [], [], [], undefined, [], undefined, undefined, undefined, undefined,
    (candidates) => traces.push(candidates),
    { incidentRouteAngles: [], relationLabelAngles: [Math.PI / 2], halfAngle: Math.PI / 5, incidentWeight: 0, relationLabelWeight: 100 },
  );
  assert.equal(traces[0]?.length, 32);
  assert.notDeepEqual(escaped, current);
  assert.ok(traces[0]?.find((candidate: any) => candidate.selected)?.relationLabelAngularPressure === 0);
  assert.ok(traces[0]?.some((candidate: any) => candidate.relationLabelAngularPressure > 0));
});

test("fixed Relation presentation remains unchanged while Node-label arms vary", () => {
  const { nodes, positions, routedEdges } = simpleNodeInput();
  const relationLabels = new Map([[
    "ab",
    { x: 120, y: -34, width: 80, height: 22, directionX: 0, directionY: -1 },
  ]]);
  const baselineRoutes = routedEdges.map(({ id, samples }) => ({ id, samples }));
  const current = deriveAutomaticNodeLabels({ nodes, positions, routedEdges, occupiedRelationLabels: relationLabels, previousPlacements: new Map(), manualOffsets: new Map() });
  const angular = deriveAutomaticNodeLabels({
    nodes,
    positions,
    routedEdges,
    occupiedRelationLabels: relationLabels,
    previousPlacements: new Map(),
    manualOffsets: new Map(),
    nodeLabelAngularEscapeById: { a: { incidentRouteAngles: [0], relationLabelAngles: [-Math.PI / 2], relationLabelWeight: 20, incidentWeight: 12 } },
  });
  assert.equal(current.size, angular.size);
  assert.deepEqual(routedEdges.map(({ id, samples }) => ({ id, samples })), baselineRoutes);
  assert.deepEqual([...relationLabels.entries()], [["ab", relationLabels.get("ab")] ]);
});

test("artifact records bounded controls and the current fresh arm does not show an established escape benefit", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-NODE-LABEL-RELATION-PRESENTATION-FIRST-ANGULAR-ESCAPE-v1");
  assert.equal(artifact.candidateCount, 32);
  assert.equal(artifact.standing.humanReview, "NOT READY");
  assert.equal(artifact.standing.productDefault, "HOLD");
  assert.ok(artifact.rows.some((row: any) => row.fixture === "high-degree-angular-capacity"));
  assert.ok(artifact.rows.some((row: any) => row.fixture === "lighthouse-en"));
  assert.ok(artifact.rows.some((row: any) => row.fixture === "lighthouse-ja"));
  for (const row of artifact.rows as any[]) {
    assert.equal(row.fixedRelationPresentation, true);
    assert.equal(row.routeGeometryStableAcrossArms, true);
    assert.equal(row.arms["current-fresh"].summary.selectedDirectionChangesFromCurrent, 0);
    assert.equal(row.arms["angular-fresh"].summary.selectedDirectionChangesFromCurrent, 0);
    assert.equal(row.arms["current-previous"].summary.maxSelectedMovementCost > 0, true);
    assert.equal(row.arms["angular-previous"].summary.maxSelectedMovementCost > 0, true);
    for (const arm of Object.values(row.arms) as any[]) for (const candidateRow of arm.rows) assert.equal(candidateRow.candidateCount, 32);
  }
});
