import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute } from "../src/graph-presentation.ts";
import { deriveProductParallelBundlePolicy } from "../src/product-parallel-bundle-policy.ts";
import { compareRouteGeometry, minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveOccupiedPathConflict, type LabelRect } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../experimental/product-owned-parallel-bundle-generalization1/fixtures.mjs";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Candidate = { id: string; spacing?: number; mode?: "bundle" | "pair" | "corridor" };

const primaryPositions: Record<string, Point> = {
  gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 },
  epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 },
};
const higherPositions: Record<string, Point> = { a: { x: 80, y: 120 }, b: { x: 440, y: 120 }, c: { x: 260, y: -40 }, d: { x: 260, y: 280 } };
const mixedPositions: Record<string, Point> = { a: { x: 100, y: 100 }, b: { x: 460, y: 100 }, c: { x: 100, y: 300 }, d: { x: 460, y: 300 }, e: { x: 100, y: 500 }, f: { x: 460, y: 500 } };

function relationMap(dataset: Dataset) { return new Map(dataset.relations.map((relation) => [relation.id, relation])); }
function pointDistance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function median(values: number[]): number { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function angleDistance(a: number, b: number): number { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function routeLength(route: DerivedAutomaticRoute): number { return route.samples.slice(1).reduce((sum, point, index) => sum + pointDistance(point, route.samples[index]!), 0); }
function routeDistance(route: DerivedAutomaticRoute, label: LabelRect): number { return minimumPathToLabelRectDistance(route.samples, label); }

function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>): LabelRect[] {
  return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
}

function finalConflictCount(presentation: BoundedAutomaticPresentation): number {
  let count = 0;
  for (let index = 0; index < presentation.routedEdges.length; index += 1) {
    if (routeSamplesHaveOccupiedPathConflict(presentation.routedEdges[index]!.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))) count += 1;
  }
  return count;
}

function groupGeometry(presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const groups = new Map<string, typeof presentation.routedEdges>();
  for (const route of presentation.routedEdges) {
    if (route.parallelCount <= 1 || route.sourceId === route.targetId) continue;
    const key = [route.sourceId, route.targetId].sort().join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  const rows = [...groups.entries()].map(([key, routes]) => {
    const laneSeparation = Math.min(...routes.flatMap((route, left) => routes.slice(left + 1).map((other) => pointDistance(route.samples[20]!, other.samples[20]!))), Infinity);
    const signs = routes.map((route) => {
      const source = positions[route.sourceId]!; const target = positions[route.targetId]!;
      return Math.sign((target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2));
    });
    const directionGroups = new Map<string, number[]>();
    for (const route of routes) directionGroups.set(`${route.sourceId}\u0000${route.targetId}`, [...(directionGroups.get(`${route.sourceId}\u0000${route.targetId}`) ?? []), Math.atan2(route.controlPoint.y - positions[route.sourceId]!.y, route.controlPoint.x - positions[route.sourceId]!.x)]);
    const endpointAngularSeparation = Math.min(...[...directionGroups.values()].flatMap((angles) => angles.flatMap((left, index) => angles.slice(index + 1).map((right) => angleDistance(left, right)))), Infinity);
    return { key, parallelCount: routes.length, directionComposition: Object.fromEntries([...directionGroups.entries()].map(([direction, values]) => [direction, values.length])), sideDistribution: signs.reduce<Record<string, number>>((result, sign) => { const side = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero"; result[side] = (result[side] ?? 0) + 1; return result; }, {}), laneSeparation: Number.isFinite(laneSeparation) ? laneSeparation : null, endpointAngularSeparation: Number.isFinite(endpointAngularSeparation) ? endpointAngularSeparation : null };
  });
  return rows;
}

function labelOwnership(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id)!;
    const ownerDistance = routeDistance(route, label);
    const foreignDistances = presentation.routedEdges.filter(({ id }) => id !== route.id).map((foreign) => routeDistance(foreign, label));
    const nearestForeignDistance = Math.min(...foreignDistances, Infinity);
    return { id: route.id, ownerDistance, nearestForeignDistance, ownershipMargin: nearestForeignDistance - ownerDistance, foreignCloser: nearestForeignDistance < ownerDistance };
  });
  return { medianOwnerDistance: median(rows.map(({ ownerDistance }) => ownerDistance)), medianNearestForeignDistance: median(rows.map(({ nearestForeignDistance }) => nearestForeignDistance).filter(Number.isFinite)), medianOwnershipMargin: median(rows.map(({ ownershipMargin }) => ownershipMargin).filter(Number.isFinite)), ownershipAmbiguity: rows.filter(({ ownershipMargin }) => ownershipMargin <= 4).length, foreignCloserCount: rows.filter(({ foreignCloser }) => foreignCloser).length, rows };
}

function viewportEnvelope(points: Point[]) {
  const xs = points.map(({ x }) => x); const ys = points.map(({ y }) => y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function evaluate(fixture: Fixture, candidate: Candidate) {
  const graphBase = buildEntityGraph(fixture.dataset as never);
  const byRelation = relationMap(fixture.dataset);
  const graph = { nodes: graphBase.nodes, edges: graphBase.edges.map((edge) => ({ ...edge, label: byRelation.get(edge.id)?.name ?? "" })) };
  const policy = candidate.id === "adaptive-bundle" ? deriveProductParallelBundlePolicy(graph.edges) : null;
  const presentation = deriveBoundedAutomaticPresentation({ graph, positions: fixture.positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(graphBase, fixture.positions), previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true, parallelBundleSpacing: policy?.spacing ?? candidate.spacing, parallelBundleMode: policy?.mode ?? candidate.mode ?? "bundle" });
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions: fixture.positions, presentation });
  const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions: fixture.positions, presentation });
  const routeLengths = presentation.routedEdges.map(routeLength);
  const routePoints = presentation.routedEdges.flatMap(({ samples }) => samples);
  const ordinaryRoutes = presentation.routedEdges.filter(({ parallelCount }) => parallelCount === 1);
  const selfLoops = presentation.routedEdges.filter(({ sourceId, targetId }) => sourceId === targetId);
  return { fixture: fixture.id, family: fixture.family, candidate: candidate.id, policy, presentation, graph, quality, visualRisk, metrics: { parallelGroups: groupGeometry(presentation, fixture.positions), parallelEdgeCount: presentation.routedEdges.filter(({ parallelCount, sourceId, targetId }) => parallelCount > 1 && sourceId !== targetId).length, routeMedian: median(routeLengths), routeMax: Math.max(...routeLengths, 0), routeTotal: routeLengths.reduce((sum, value) => sum + value, 0), occupiedPathConflictCount: finalConflictCount(presentation), labels: labelOwnership(presentation), ordinaryRouteCount: ordinaryRoutes.length, selfLoopCount: selfLoops.length, extent: viewportEnvelope([...Object.values(fixture.positions), ...routePoints]), fitScale: quality.fitScale, nodeCollisionPairs: quality.overlapPairs, labelOverlapPairs: visualRisk.totalLabelOverlapPairs, nodeRelationOverlapPairs: visualRisk.nodeRelationOverlapPairs, feedbackApplied: presentation.feedbackApplied } };
}

function churn(before: ReturnType<typeof evaluate>, after: ReturnType<typeof evaluate>) {
  const beforeRoutes = new Map(before.presentation.routedEdges.map((route) => [route.id, route]));
  const changedOrdinary = after.presentation.routedEdges.filter((route) => route.parallelCount === 1 && !compareRouteGeometry(beforeRoutes.get(route.id)?.samples ?? [], route.samples).equivalent).map(({ id }) => id);
  return { changedOrdinaryRouteCount: changedOrdinary.length, changedOrdinaryRouteIds: changedOrdinary };
}

function loadPublicFixture(id: string, file: string, positions: Record<string, Point>): Fixture {
  return { id, family: "public-sample", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", file), "utf8")) as Dataset, positions };
}

const fixtures: Fixture[] = [
  { id: "parallel-self-loop-control", family: "reverse-plus-same-direction-plus-self-loop", dataset: parallelSelfLoop() as Dataset, positions: primaryPositions },
  { id: "higher-multiplicity-5", family: "higher-multiplicity", dataset: higherMultiplicityParallel() as Dataset, positions: higherPositions },
  { id: "mixed-incident-parallel", family: "mixed-incident", dataset: mixedIncidentParallel() as Dataset, positions: mixedPositions },
  loadPublicFixture("lighthouse-en", "lighthouse-restoration-demo.en.e2r.json", JSON.parse(fs.readFileSync("experimental/frontier-actual-product-visual-sweep1/result-summary.json", "utf8")).rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions),
];
const candidatesByFixture = new Map(fixtures.map((fixture) => {
  const candidates = fixture.id === "parallel-self-loop-control"
    ? [{ id: "current" }, { id: "bundle-16", spacing: 16, mode: "bundle" as const }, { id: "pair-16", spacing: 16, mode: "pair" as const }, { id: "corridor-aware-16", spacing: 16, mode: "corridor" as const }, { id: "adaptive-bundle" }]
    : [{ id: "current" }, { id: "bundle-16", spacing: 16, mode: "bundle" as const }, { id: "adaptive-bundle" }];
  return [fixture.id, candidates] as const;
}));
const evaluations = fixtures.flatMap((fixture) => (candidatesByFixture.get(fixture.id) ?? []).map((candidate) => evaluate(fixture, candidate)));
const rows = fixtures.map((fixture) => {
  const fixtureEvaluations = evaluations.filter(({ fixture: id }) => id === fixture.id);
  const current = fixtureEvaluations.find(({ candidate }) => candidate === "current")!;
  return { fixture: fixture.id, family: fixture.family, positions: fixture.positions, graph: { nodes: current.graph.nodes.length, edges: current.graph.edges.length }, current: { ...current.metrics, quality: current.quality, visualRisk: current.visualRisk }, candidates: fixtureEvaluations.filter(({ candidate }) => candidate !== "current").map((evaluation) => ({ candidate: evaluation.candidate, policy: evaluation.policy, metrics: evaluation.metrics, quality: evaluation.quality, visualRisk: evaluation.visualRisk, churn: churn(current, evaluation) })) };
});
const output = { contract: "LIAISONSCAPE-PRODUCT-OWNED-PARALLEL-BUNDLE-GENERALIZATION-v1", diagnosticOnly: true, candidateIdentity: "product-owned-adaptive-bundle-v1", fixedReference: { spacing: 16, mode: "bundle" }, candidatePolicy: "bounded global graph-local spacing from maximum non-self parallel multiplicity, reverse-direction pairing, and maximum parallel label width; no side symmetry requirement", selfLoopPolicy: "unchanged and excluded from demand calculation", viewportPolicy: "unchanged", localRelaxation: "not introduced", fixtures: fixtures.map(({ id, family }) => ({ id, family })), rows, standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN", parallelIncidentArchitecture: "CLOSED" } };
const target = path.join(process.cwd(), "experimental", "product-owned-parallel-bundle-generalization1", "result-summary.json"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, graph: row.graph, current: { groups: row.current.parallelGroups, conflicts: row.current.occupiedPathConflictCount, crossings: row.current.quality.crossings, labels: row.current.labels, ordinary: row.current.ordinaryRouteCount, selfLoops: row.current.selfLoopCount }, candidates: row.candidates.map((candidate) => ({ candidate: candidate.candidate, policy: candidate.policy, groups: candidate.metrics.parallelGroups, conflicts: candidate.metrics.occupiedPathConflictCount, crossings: candidate.quality.crossings, routeMedian: candidate.metrics.routeMedian, labels: candidate.metrics.labels, ordinaryChurn: candidate.churn.changedOrdinaryRouteCount, labelOverlap: candidate.metrics.labelOverlapPairs, nodeCollision: candidate.metrics.nodeCollisionPairs })) })), null, 2));
