import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { curveOffsetFromControlPoint, placeNodeLabel } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "parallel-one-sided-product-quality-audit1");
const frontierArtifact = JSON.parse(fs.readFileSync(path.join(root, "experimental", "frontier-actual-product-visual-sweep1", "result-summary.json"), "utf8"));

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }
function sign(value) { return value === 0 ? 0 : value > 0 ? 1 : -1; }
function undirectedKey(sourceId, targetId) { return [sourceId, targetId].sort().join("\u0000"); }
function physicalSide(sourceId, targetId, controlPoint, positions) {
  const canonical = [sourceId, targetId].sort();
  const source = positions[canonical[0]];
  const target = positions[canonical[1]];
  const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  return sign((target.x - source.x) * (controlPoint.y - midpoint.y) - (target.y - source.y) * (controlPoint.x - midpoint.x));
}
function endpointAngle(center, point) { return Math.atan2(point.y - center.y, point.x - center.x); }
function angleDelta(left, right) { return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right))); }

const dataset = parallelSelfLoop();
const graph = buildEntityGraph(dataset);
const names = new Map(dataset.relations.map((relation) => [relation.id, relation.name]));
const edges = graph.edges.map((edge) => ({ ...edge, label: names.get(edge.id) ?? edge.id }));
const row = frontierArtifact.rows.find(({ fixture }) => fixture === "parallel-self-loop-control");
if (!row?.positions) throw new Error("parallel-self-loop-control Frontier positions are missing");
const positions = row.positions;
const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(positions[node.id], node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]), []));
const decisions = [];
const presentation = deriveBoundedAutomaticPresentation({
  graph: { nodes: graph.nodes, edges },
  positions,
  edgeCurveOffsets: {},
  selfLoopOverrides: {},
  provisionalNodeLabels,
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
  feedbackEnabled: true,
  routeDecisionSink: (decision) => decisions.push(decision),
});

const routeById = new Map(presentation.routedEdges.map((route) => [route.id, route]));
const edgeGroups = new Map();
for (const edge of edges) {
  const route = routeById.get(edge.id);
  const source = positions[edge.sourceId];
  const target = positions[edge.targetId];
  const key = undirectedKey(edge.sourceId, edge.targetId);
  const group = edgeGroups.get(key) ?? [];
  if (!route) throw new Error(`Missing route for ${edge.id}`);
  const offset = curveOffsetFromControlPoint(source, target, route.controlPoint);
  group.push({
    relationId: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    direction: `${edge.sourceId}->${edge.targetId}`,
    parallelIndex: edge.parallelIndex,
    parallelCount: edge.parallelCount,
    physicalSideSign: physicalSide(edge.sourceId, edge.targetId, route.controlPoint, positions),
    directedOffset: offset,
    endpointAngles: {
      source: endpointAngle(source, route.samples[0]),
      target: endpointAngle(target, route.samples.at(-1)),
    },
    route: { controlPoint: route.controlPoint, labelPoint: route.labelPoint, sampleCount: route.samples.length },
    label: presentation.relationLabels.get(edge.id) ?? null,
    labelOwnership: { sourceId: edge.sourceId, targetId: edge.targetId },
  });
  edgeGroups.set(key, group);
}

const groups = [...edgeGroups.entries()].map(([key, relations]) => {
  const sides = relations.map(({ physicalSideSign }) => physicalSideSign);
  const forward = relations.filter(({ sourceId, targetId }) => sourceId.localeCompare(targetId) < 0);
  const reverse = relations.filter(({ sourceId, targetId }) => sourceId.localeCompare(targetId) > 0);
  const sideCounts = Object.fromEntries([...new Set(sides)].sort().map((side) => [String(side), sides.filter((value) => value === side).length]));
  const endpointAngleSpreads = ["source", "target"].map((endpoint) => {
    const angles = relations.map((relation) => relation.endpointAngles[endpoint]);
    return { endpoint, minimumPairwiseSeparationRadians: Math.min(...angles.flatMap((left, index) => angles.slice(index + 1).map((right) => angleDelta(left, right))), Infinity) };
  });
  const sideValues = Object.values(sideCounts).map(Number);
  return { key, relationCount: relations.length, directionCounts: { forward: forward.length, reverse: reverse.length }, sideCounts, oneSided: new Set(sides).size < Math.min(2, relations.length), sideBalanced: sideValues.length > 1 && Math.max(...sideValues) === Math.min(...sideValues), sideImbalanceRatio: sideValues.length > 1 ? Math.max(...sideValues) / Math.max(1, Math.min(...sideValues)) : null, endpointAngleSpreads, relations };
});

const artifact = {
  contract: "LIAISONSCAPE-DIAGNOSTIC-PREVIEW-FIXTURE-INTEGRITY-PARALLEL-ONE-SIDED-PRODUCT-QUALITY-AUDIT-1",
  diagnosticOnly: true,
  fixture: { id: "parallel-self-loop-control", source: "shared diagnostic-fixtures.mjs", topologyDigest: digest({ entities: dataset.entities, relations: dataset.relations }), graph: { nodes: graph.nodes.length, relations: edges.length, selfLoops: edges.filter((edge) => edge.sourceId === edge.targetId).length, parallelRelations: edges.filter((edge) => edge.parallelCount > 1).length } },
  fixtureIntegrity: { sharedGenerator: true, correctedUnicodeFixture: true, candidatePositionSource: "frontier-actual-product-visual-sweep1/result-summary.json", candidatePositionFingerprint: digest(positions), topologyAndIdsReused: true },
  productPath: { current: "App -> deriveBoundedAutomaticPresentation -> routeGraphEdge -> relation-label placement", explicitIncidentAllocatorPresent: false, allocationSignal: "buildEntityGraph canonical parallelIndex/parallelCount plus routeGraphEdge canonicalPhysicalSideSign", endpointPlanArtifact: "not exposed by current Product presentation path" },
  groups,
  routeDecisionSummary: decisions.filter(({ pass }) => pass === "first" || pass === "feedback").map(({ pass, edgeId, processingIndex, candidateDiagnostics }) => ({ pass, edgeId, processingIndex, selected: candidateDiagnostics.find(({ selected }) => selected)?.offset ?? null, candidates: candidateDiagnostics.map(({ offset, occupiedPathConflict, labelPressure, preservesBaseSide, selected }) => ({ offset, occupiedPathConflict, labelPressure, preservesBaseSide, selected })) })),
  interpretationPending: true,
  readiness: { humanReview: "NOT READY", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" },
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ fixture: artifact.fixture, groups: groups.map(({ key, relationCount, directionCounts, sideCounts, oneSided }) => ({ key, relationCount, directionCounts, sideCounts, oneSided })), productPath: artifact.productPath }, null, 2));
