import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, type AutomaticRouteDecision, type BoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveOccupiedPathConflict, type LabelRect } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";

type Point = { x: number; y: number };
type Positions = Record<string, Point>;
type RouteVariant = { id: string; spacing?: number; mode?: "bundle" | "pair" | "corridor" };

const sourcePositions: Positions = {
  gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 },
  epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 },
};

function clonePositions(value: Positions): Positions { return Object.fromEntries(Object.entries(value).map(([id, point]) => [id, { ...point }])); }
function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function angle(a: Point, b: Point): number { return Math.atan2(b.y - a.y, b.x - a.x); }
function angleDistance(a: number, b: number): number { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function median(values: number[]): number { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }

function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Positions): LabelRect[] {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!, node.label, node.description, [],
    graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [],
  ));
}

function bounds(points: Point[]) {
  const xs = points.map(({ x }) => x); const ys = points.map(({ y }) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function rectPoints(rect: LabelRect): Point[] {
  return [{ x: rect.x - rect.width / 2, y: rect.y - rect.height / 2 }, { x: rect.x + rect.width / 2, y: rect.y - rect.height / 2 }, { x: rect.x - rect.width / 2, y: rect.y + rect.height / 2 }, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }];
}

function routeConflictCount(presentation: BoundedAutomaticPresentation): number {
  let count = 0;
  for (let index = 0; index < presentation.routedEdges.length; index += 1) {
    if (routeSamplesHaveOccupiedPathConflict(presentation.routedEdges[index]!.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))) count += 1;
  }
  return count;
}

function sideDistribution(presentation: BoundedAutomaticPresentation, positions: Positions, sourceId: string, targetId: string) {
  const routes = presentation.routedEdges.filter((route) => route.sourceId === sourceId && route.targetId === targetId || route.sourceId === targetId && route.targetId === sourceId);
  const signs = routes.map((route) => {
    const source = positions[route.sourceId]!; const target = positions[route.targetId]!;
    const cross = (target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2);
    return Math.sign(cross);
  });
  return { counts: signs.reduce<Record<string, number>>((result, sign) => { const key = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero"; result[key] = (result[key] ?? 0) + 1; return result; }, {}), signs };
}

function endpointSeparation(presentation: BoundedAutomaticPresentation, sourceId: string, targetId: string): number {
  const routes = presentation.routedEdges.filter((route) => route.sourceId === sourceId && route.targetId === targetId);
  const source = routes[0] ? presentation.routedEdges.find(({ id }) => id === routes[0]!.id) : undefined;
  void source;
  const angles = routes.map((route) => angle({ x: 0, y: 0 }, { x: route.controlPoint.x - (route.samples[0]?.x ?? 0), y: route.controlPoint.y - (route.samples[0]?.y ?? 0) }));
  let minimum = Infinity;
  for (let left = 0; left < angles.length; left += 1) for (let right = left + 1; right < angles.length; right += 1) minimum = Math.min(minimum, angleDistance(angles[left]!, angles[right]!));
  return Number.isFinite(minimum) ? minimum : null as never;
}

function localLabelMetrics(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id)!;
    const ownerDistance = minimumPathToLabelRectDistance(route.samples, label);
    const foreignDistance = Math.min(...presentation.routedEdges.filter(({ id }) => id !== route.id).map((other) => minimumPathToLabelRectDistance(other.samples, label)), Infinity);
    return { id: route.id, ownerDistance, foreignDistance, ownershipMargin: foreignDistance - ownerDistance };
  });
  return { medianOwnerDistance: median(rows.map(({ ownerDistance }) => ownerDistance)), minimumOwnerDistance: Math.min(...rows.map(({ ownerDistance }) => ownerDistance), Infinity), medianOwnershipMargin: median(rows.map(({ ownershipMargin }) => ownershipMargin)), ambiguousCount: rows.filter(({ ownershipMargin }) => ownershipMargin <= 4).length, rows };
}

function viewportMetrics(positions: Positions, presentation: BoundedAutomaticPresentation) {
  const nodeOnly = fitGraphView(Object.values(positions), 800, 500);
  const occupiedPoints = [...Object.values(positions), ...presentation.routedEdges.flatMap(({ samples }) => samples), ...[...presentation.nodeLabels.values(), ...presentation.relationLabels.values()].flatMap(rectPoints)];
  const occupied = bounds(occupiedPoints);
  const occupiedCenter = { x: (occupied.minX + occupied.maxX) / 2, y: (occupied.minY + occupied.maxY) / 2 };
  const nodeCenter = { x: (Math.min(...Object.values(positions).map(({ x }) => x)) + Math.max(...Object.values(positions).map(({ x }) => x))) / 2, y: (Math.min(...Object.values(positions).map(({ y }) => y)) + Math.max(...Object.values(positions).map(({ y }) => y))) / 2 };
  const projectedOccupiedCenter = { x: nodeOnly.pan.x + nodeOnly.scale * occupiedCenter.x, y: nodeOnly.pan.y + nodeOnly.scale * occupiedCenter.y };
  const presentationFit = fitGraphView(occupiedPoints, 800, 500);
  return { nodeOnlyFit: nodeOnly, presentationFit, nodeBoundsCenter: nodeCenter, occupiedBoundsCenter: occupiedCenter, postNodeFitOccupiedCenter: projectedOccupiedCenter, postNodeFitCenterOffset: { x: projectedOccupiedCenter.x - 400, y: projectedOccupiedCenter.y - 250 }, occupiedExtent: [occupied.maxX - occupied.minX, occupied.maxY - occupied.minY] };
}

function evaluate(graph: ReturnType<typeof buildEntityGraph>, positions: Positions, routeVariant: RouteVariant, selfLoopOverrides: Record<string, { orientation: number; radius: number }> = {}) {
  const decisions: AutomaticRouteDecision[] = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: relationById.get(edge.id)?.name ?? "" })) },
    positions, edgeCurveOffsets: {}, selfLoopOverrides, provisionalNodeLabels: provisionalLabels(graph, positions),
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true,
    parallelBundleSpacing: routeVariant.spacing, parallelBundleMode: routeVariant.mode ?? "bundle", routeDecisionSink: (decision) => decisions.push(decision),
  });
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: relationById.get(edge.id)?.name ?? "" })), positions, presentation });
  const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  const alphaBeta = sideDistribution(presentation, positions, "alpha", "beta");
  const routeLengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + distance(point, route.samples[index]!), 0));
  const selfLoop = presentation.routedEdges.find(({ id }) => id === "r-loop");
  const selfLoopOrigin = positions.epsilon!;
  const selfLoopOrientation = selfLoop ? angle(selfLoopOrigin, selfLoop.controlPoint) : null;
  const selectedDiagnostics = decisions.filter(({ pass }) => pass === "feedback" || pass === "first").flatMap(({ candidateDiagnostics }) => candidateDiagnostics);
  return {
    routeVariant, positions, presentation, quality, visualRisk,
    metrics: { alphaBetaSideDistribution: alphaBeta, alphaBetaForwardEndpointAngularSeparation: endpointSeparation(presentation, "alpha", "beta"), occupiedPathConflictCount: routeConflictCount(presentation), relationLabels: localLabelMetrics(presentation), routeMedian: median(routeLengths), routeMax: Math.max(...routeLengths), routeTotal: routeLengths.reduce((sum, value) => sum + value, 0), selfLoop: selfLoop ? { orientation: selfLoopOrientation, radius: distance(selfLoopOrigin, selfLoop.controlPoint), preferredOrientation: -Math.PI / 2, preferredDelta: angleDistance(selfLoopOrientation!, -Math.PI / 2), labelDistanceToOwnRoute: minimumPathToLabelRectDistance(selfLoop.samples, presentation.relationLabels.get("r-loop")!), } : null, selectedCandidateConflictSignals: selectedDiagnostics.filter(({ occupiedPathConflict }) => occupiedPathConflict).length, viewport: viewportMetrics(positions, presentation) },
  };
}

const dataset = parallelSelfLoop();
const graph = buildEntityGraph(dataset as never);
const relationById = new Map(dataset.relations.map((relation) => [relation.id, relation]));
const alpha = sourcePositions.alpha!; const beta = sourcePositions.beta!; const midpoint = { x: (alpha.x + beta.x) / 2, y: (alpha.y + beta.y) / 2 }; const vector = { x: beta.x - alpha.x, y: beta.y - alpha.y };
const candidates: Array<{ id: string; positions: Positions }> = [
  { id: "current", positions: clonePositions(sourcePositions) },
  { id: "local-spacing-1.15", positions: { ...clonePositions(sourcePositions), alpha: { x: midpoint.x - vector.x * 0.575, y: midpoint.y - vector.y * 0.575 }, beta: { x: midpoint.x + vector.x * 0.575, y: midpoint.y + vector.y * 0.575 } } },
  { id: "local-spacing-1.30", positions: { ...clonePositions(sourcePositions), alpha: { x: midpoint.x - vector.x * 0.65, y: midpoint.y - vector.y * 0.65 }, beta: { x: midpoint.x + vector.x * 0.65, y: midpoint.y + vector.y * 0.65 } } },
];
const routeVariants: RouteVariant[] = [{ id: "current-default" }, { id: "bundle-16", spacing: 16, mode: "bundle" }, { id: "pair-16", spacing: 16, mode: "pair" }, { id: "corridor-aware-16", spacing: 16, mode: "corridor" }];
const rows = candidates.flatMap((candidate) => routeVariants.map((variant) => ({ candidate: candidate.id, ...evaluate(graph, candidate.positions, variant) })));
const selfLoopProbeAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const selfLoopProbes = selfLoopProbeAngles.flatMap((orientation) => [38, 52, 66].map((radius) => ({ orientation, radius, ...evaluate(graph, sourcePositions, { id: "current-default" }, { "r-loop": { orientation, radius } }) })));
const automatic = rows.find(({ candidate, routeVariant }) => candidate === "current" && routeVariant.id === "current-default")!;
const output = {
  contract: "LIAISONSCAPE-PRODUCT-PRESENTATION-LOCAL-SPACING-PARALLEL-LABEL-SELF-LOOP-REFINEMENT-v1",
  diagnosticOnly: true,
  fixture: "parallel-self-loop-control",
  sourcePositionFingerprint: "0f8c410890f6",
  positionPolicy: "retain-current-topology-and-ordering; bounded-alpha-beta-local-displacement-only",
  candidates: candidates.map(({ id, positions }) => ({ id, positions, alphaBetaDistance: distance(positions.alpha!, positions.beta!) })),
  routeVariants: routeVariants.map(({ id }) => id),
  rows: rows.map(({ candidate, routeVariant, positions, metrics, quality, visualRisk }) => ({ candidate, routeVariant, positions, metrics, quality, visualRisk })),
  selfLoopAutomatic: automatic.metrics.selfLoop,
  selfLoopProbes: selfLoopProbes.map(({ routeVariant, positions, metrics, quality, visualRisk }) => ({ orientation: metrics.selfLoop?.orientation, radius: metrics.selfLoop?.radius, metrics, quality, visualRisk })),
  viewportFinding: "current-fit-uses-node-centers-only; compare post-node-fit occupied bounds against presentation-fit bounds; no viewport fix adopted in this diagnostic",
  authorityFinding: "routing-label-placement-self-loop-and-viewport-remain-Product-owned; no Incident allocator or endpoint-plan authority reopened",
  selection: "no production winner; retain current unless Actual Product smoke validates a bounded candidate",
  readiness: { productPresentationCandidate: "DIAGNOSTIC ONLY", humanReview: "NOT READY", productionProvider: "NOT ESTABLISHED", productDefault: "HOLD", initialLayoutReleaseBlocker: "OPEN" },
};
const target = path.join(process.cwd(), "experimental", "product-presentation-local-spacing-parallel-label-self-loop-refinement1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ candidates: output.candidates, summary: rows.map(({ candidate, routeVariant, metrics, quality, visualRisk }) => ({ candidate, variant: routeVariant.id, alphaBeta: metrics.alphaBetaSideDistribution, endpointRadians: metrics.alphaBetaForwardEndpointAngularSeparation, conflicts: metrics.occupiedPathConflictCount, label: { medianOwnerDistance: metrics.relationLabels.medianOwnerDistance, medianOwnershipMargin: metrics.relationLabels.medianOwnershipMargin, ambiguous: metrics.relationLabels.ambiguousCount }, selfLoop: metrics.selfLoop, crossings: quality.crossings, routeMedian: metrics.routeMedian, extent: quality.extent, fitScale: quality.fitScale, overlap: visualRisk.totalLabelOverlapPairs, centerOffset: metrics.viewport.postNodeFitCenterOffset })) , selfLoopAutomatic: output.selfLoopAutomatic }, null, 2));
