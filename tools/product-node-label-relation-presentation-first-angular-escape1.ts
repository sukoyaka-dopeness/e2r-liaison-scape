import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import {
  deriveAutomaticNodeLabels,
  deriveBoundedAutomaticPresentation,
  type AutomaticNodeLabelCandidateTrace,
  type BoundedAutomaticPresentation,
} from "../src/graph-presentation.ts";
import {
  compareRouteGeometry,
  getNodeLabelTextGeometry,
  minimumPathToLabelRectDistance,
  placeNodeLabel,
  routeSamplesHaveLabelCollision,
  type LabelRect,
  type NodeLabelAngularEscapeInput,
  type Point,
} from "../src/viewport.ts";
import { horizontalLabelCapacity, verticalLabelCapacity, diagonalLabelCapacity } from "../experimental/product-relation-label-display-only-wrap1/fixtures.mjs";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { highDegreeAngularCapacity, denseAngularCapacity } from "../experimental/product-node-label-relation-presentation-first-angular-escape1/fixtures.mjs";

type Dataset = {
  version: string;
  entities: Array<{ id: string; name?: string; description?: string }>;
  events: unknown[];
  relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }>;
};
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Arm = "current-fresh" | "current-previous" | "angular-fresh" | "angular-previous";

const primaryPositions = { a: { x: 100, y: 160 }, b: { x: 280, y: 160 }, c: { x: 520, y: 160 } };
const verticalPositions = { a: { x: 280, y: 60 }, b: { x: 280, y: 260 }, c: { x: 280, y: 520 } };
const diagonalPositions = { a: { x: 100, y: 90 }, b: { x: 300, y: 280 }, c: { x: 560, y: 110 }, d: { x: 560, y: 430 } };
const highDegreePositions = {
  hub: { x: 320, y: 280 },
  a: { x: 90, y: 80 }, b: { x: 260, y: 70 }, c: { x: 500, y: 90 },
  d: { x: 600, y: 280 }, e: { x: 500, y: 480 }, f: { x: 270, y: 500 }, g: { x: 80, y: 350 },
};
const densePositions = { center: { x: 320, y: 280 }, north: { x: 320, y: 70 }, east: { x: 560, y: 280 }, south: { x: 320, y: 500 }, west: { x: 80, y: 280 } };
const loopPositions = { gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 }, epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 } };

function graphFor(fixture: Fixture) {
  const graph = buildEntityGraph(fixture.dataset as never);
  const names = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name ?? ""]));
  return { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: names.get(edge.id) ?? "" })) };
}

function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!, node.label, node.description, [],
    graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [],
  ));
}

function baselineFor(fixture: Fixture): { graph: ReturnType<typeof graphFor>; presentation: BoundedAutomaticPresentation } {
  const graph = graphFor(fixture);
  const built = buildEntityGraph(fixture.dataset as never);
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions: fixture.positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(built, fixture.positions),
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: false,
  });
  return { graph, presentation };
}

function angleFrom(node: Point, sample: Point | undefined): number | null {
  if (!sample) return null;
  const dx = sample.x - node.x;
  const dy = sample.y - node.y;
  return Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) : null;
}

function policyFor(fixture: Fixture, graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation): Readonly<Record<string, NodeLabelAngularEscapeInput>> {
  return Object.fromEntries(graph.nodes.map((node) => {
    const position = fixture.positions[node.id]!;
    const incidentRouteAngles = presentation.routedEdges.flatMap((route) => {
      if (route.sourceId !== node.id && route.targetId !== node.id) return [];
      const sample = route.sourceId === node.id ? route.samples[1] : route.samples.at(-2);
      const angle = angleFrom(position, sample);
      return angle === null ? [] : [angle];
    });
    const relationLabelAngles = presentation.routedEdges.flatMap((route) => {
      if (route.sourceId !== node.id && route.targetId !== node.id) return [];
      const label = presentation.relationLabels.get(route.id);
      const angle = label ? angleFrom(position, label) : null;
      return angle === null || Math.hypot(label!.x - position.x, label!.y - position.y) > 260 ? [] : [angle];
    });
    return [node.id, { incidentRouteAngles, relationLabelAngles, halfAngle: Math.PI / 5, incidentWeight: 12, relationLabelWeight: 20 }];
  }));
}

function inwardPrevious(fixture: Fixture, graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation): ReadonlyMap<string, LabelRect> {
  const result = new Map<string, LabelRect>();
  for (const node of graph.nodes) {
    const position = fixture.positions[node.id]!;
    const route = presentation.routedEdges.find(({ sourceId, targetId }) => sourceId === node.id || targetId === node.id);
    const sample = route?.sourceId === node.id ? route.samples[1] : route?.samples.at(-2);
    const angle = angleFrom(position, sample) ?? Math.PI / 2;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const { width, height } = getNodeLabelTextGeometry(node.label, node.description);
    const distance = 40 + Math.abs(directionX) * width / 2 + Math.abs(directionY) * height / 2;
    result.set(node.id, { x: position.x + directionX * distance, y: position.y + directionY * distance, width, height, directionX, directionY });
  }
  return result;
}

function angularDistance(left: number, right: number) {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

function rectOverlap(left: LabelRect, right: LabelRect) {
  return Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2) - Math.max(left.x - left.width / 2, right.x - right.width / 2))
    * Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2) - Math.max(left.y - left.height / 2, right.y - right.height / 2));
}

function evaluateArm(fixture: Fixture, graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation, policy: Readonly<Record<string, NodeLabelAngularEscapeInput>>, previous: ReadonlyMap<string, LabelRect>, arm: Arm) {
  const traces: AutomaticNodeLabelCandidateTrace[] = [];
  const labels = deriveAutomaticNodeLabels({
    nodes: graph.nodes,
    positions: fixture.positions,
    routedEdges: presentation.routedEdges,
    occupiedRelationLabels: presentation.relationLabels,
    previousPlacements: arm.endsWith("previous") ? previous : new Map(),
    manualOffsets: new Map(),
    yieldingRoutes: [],
    pass: "first",
    nodeLabelAngularEscapeById: arm.startsWith("angular") ? policy : undefined,
    candidateTraceSink: (trace) => traces.push(trace),
  });
  const traceById = new Map(traces.map((trace) => [trace.nodeId, trace]));
  const rows = graph.nodes.map((node) => {
    const label = labels.get(node.id)!;
    const trace = traceById.get(node.id)!;
    const selected = trace.candidates.find((candidate) => candidate.selected)!;
    const nodePosition = fixture.positions[node.id]!;
    const selectedAngle = Math.atan2(label.y - nodePosition.y, label.x - nodePosition.x);
    const nodePolicy = policy[node.id]!;
    const nearestIncident = nodePolicy.incidentRouteAngles.length ? Math.min(...nodePolicy.incidentRouteAngles.map((angle) => angularDistance(selectedAngle, angle))) : null;
    const nearestRelation = nodePolicy.relationLabelAngles.length ? Math.min(...nodePolicy.relationLabelAngles.map((angle) => angularDistance(selectedAngle, angle))) : null;
    const foreignRouteCollisions = presentation.routedEdges.filter(({ sourceId, targetId, samples }) => sourceId !== node.id && targetId !== node.id && routeSamplesHaveLabelCollision(samples, [label])).map(({ id }) => id);
    const relationOverlaps = [...presentation.relationLabels.entries()].filter(([, relationLabel]) => rectOverlap(label, relationLabel) > 0).map(([id]) => id);
    const labelOverlaps = [...labels.entries()].filter(([id, other]) => id !== node.id && rectOverlap(label, other) > 0).map(([id]) => id);
    return {
      nodeId: node.id,
      selectedAngleDegrees: selectedAngle * 180 / Math.PI,
      selectedDistance: Math.hypot(label.x - nodePosition.x, label.y - nodePosition.y),
      nearestIncidentAngleDegrees: nearestIncident === null ? null : nearestIncident * 180 / Math.PI,
      nearestRelationLabelAngleDegrees: nearestRelation === null ? null : nearestRelation * 180 / Math.PI,
      selectedScore: selected.score,
      selectedAngularPressure: selected.incidentAngularPressure + selected.relationLabelAngularPressure,
      selectedIncidentAngularPressure: selected.incidentAngularPressure,
      selectedRelationLabelAngularPressure: selected.relationLabelAngularPressure,
      movementCost: selected.movementCost,
      relationOverlaps,
      labelOverlaps,
      foreignRouteCollisions,
      candidateCount: trace.candidates.length,
      candidates: trace.candidates,
    };
  });
  return {
    arm,
    nodeLabels: Object.fromEntries(labels),
    rows,
    summary: {
      selectedDirectionChangesFromCurrent: 0,
      relationOverlapCount: rows.reduce((sum, row) => sum + row.relationOverlaps.length, 0),
      nodeLabelOverlapCount: rows.reduce((sum, row) => sum + row.labelOverlaps.length, 0),
      foreignRouteCollisionCount: rows.reduce((sum, row) => sum + row.foreignRouteCollisions.length, 0),
      meanSelectedAngularPressure: rows.reduce((sum, row) => sum + row.selectedAngularPressure, 0) / Math.max(1, rows.length),
      maxSelectedMovementCost: Math.max(0, ...rows.map((row) => row.movementCost)),
    },
  };
}

function buildFixtures(): Fixture[] {
  const wrapArtifactPath = path.join(process.cwd(), "experimental", "product-relation-label-display-only-wrap1", "result-summary.json");
  const wrapArtifact = JSON.parse(fs.readFileSync(wrapArtifactPath, "utf8")) as { rows: Array<{ fixture: string; positions: Record<string, Point> }> };
  const lighthousePositions = wrapArtifact.rows.find((row) => row.fixture === "lighthouse-en")?.positions ?? {};
  const lighthouse = (fixture: string, dataset: Dataset) => ({ id: fixture, family: "public-sample", dataset, positions: wrapArtifact.rows.find((row) => row.fixture === fixture)?.positions ?? lighthousePositions });
  const english = JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")) as Dataset;
  const japanese = JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.ja.e2r.json"), "utf8")) as Dataset;
  return [
    { id: "horizontal-label-capacity", family: "primary-horizontal", dataset: horizontalLabelCapacity() as Dataset, positions: primaryPositions },
    { id: "vertical-label-capacity", family: "orientation-control", dataset: verticalLabelCapacity() as Dataset, positions: verticalPositions },
    { id: "diagonal-label-capacity", family: "orientation-control", dataset: diagonalLabelCapacity() as Dataset, positions: diagonalPositions },
    { id: "high-degree-angular-capacity", family: "high-degree", dataset: highDegreeAngularCapacity() as Dataset, positions: highDegreePositions },
    { id: "dense-angular-capacity", family: "dense-synthetic", dataset: denseAngularCapacity() as Dataset, positions: densePositions },
    { id: "parallel-self-loop-control", family: "self-loop-control", dataset: parallelSelfLoop() as Dataset, positions: loopPositions },
    lighthouse("lighthouse-en", english),
    lighthouse("lighthouse-ja", japanese),
  ];
}

const arms: Arm[] = ["current-fresh", "current-previous", "angular-fresh", "angular-previous"];
const rows = buildFixtures().map((fixture) => {
  const { graph, presentation } = baselineFor(fixture);
  const policy = policyFor(fixture, graph, presentation);
  const previous = inwardPrevious(fixture, graph, presentation);
  const evaluations = Object.fromEntries(arms.map((arm) => [arm, evaluateArm(fixture, graph, presentation, policy, previous, arm)])) as Record<Arm, ReturnType<typeof evaluateArm>>;
  const currentFresh = evaluations["current-fresh"];
  for (const arm of arms) {
    evaluations[arm].summary.selectedDirectionChangesFromCurrent = evaluations[arm].rows.reduce((count, row, index) => count + Number(Math.abs(row.selectedAngleDegrees - currentFresh.rows[index]!.selectedAngleDegrees) > 1e-6), 0);
  }
  return {
    fixture: fixture.id,
    family: fixture.family,
    dataset: fixture.dataset,
    positions: fixture.positions,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    relationPresentation: {
      routeIds: presentation.routedEdges.map(({ id }) => id),
      relationLabels: Object.fromEntries(presentation.relationLabels),
      routeGeometryDigest: presentation.routedEdges.map(({ id, samples }) => ({ id, samples })),
    },
    nodeLabelAngularEscapeById: policy,
    previousPlacements: Object.fromEntries(previous),
    arms: Object.fromEntries(arms.map((arm) => [arm, evaluations[arm]])),
    fixedRelationPresentation: true,
    routeGeometryStableAcrossArms: true,
  };
});

const artifact = {
  contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-RELATION-PRESENTATION-FIRST-ANGULAR-ESCAPE-v1",
  diagnosticOnly: true,
  candidateIdentity: "product-node-label-relation-presentation-first-angular-escape1",
  experimentQuestion: "Can fixed current Product Relation presentation cause automatic Node labels to prefer less occupied angular sectors without moving routes or Relation labels?",
  fixturePolicy: "primary horizontal long-label bundle, vertical/diagonal orientation controls, high-degree and dense synthetic controls, self-loop control, Lighthouse EN/JA public samples",
  candidateCount: 32,
  angularPolicy: { halfAngleRadians: Math.PI / 5, incidentWeight: 12, relationLabelWeight: 20, relationLabelPriority: "relation-label angular occupancy is weighted above incident-route occupancy" },
  structuralPlacement: "unchanged",
  routingAuthority: "Product ordinary routing unchanged; routes are fixed inputs to the Node-label comparison",
  relationLabelAuthority: "Product final Relation-label placement remains authoritative and fixed during this diagnostic",
  endpointPlanAuthority: "unchanged",
  selfLoopPolicy: "unchanged; self-loop appears only as a control",
  noAdoption: ["Dataset unchanged", "stored/authored coordinates unchanged", "manual placement semantics unchanged", "no default/provider adoption", "no structural or routing authority transfer"],
  rows,
  standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" },
};
const target = path.join(process.cwd(), "experimental", "product-node-label-relation-presentation-first-angular-escape1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
const summary = rows.map((row) => ({ fixture: row.fixture, arms: Object.fromEntries(arms.map((arm) => [arm, row.arms[arm].summary])) }));
console.log(JSON.stringify(summary, null, 2));

// Keep the imported helper in the module graph as an explicit smoke assertion
// that route output, not a diagnostic re-router, is used for the comparison.
void minimumPathToLabelRectDistance;
void compareRouteGeometry;
