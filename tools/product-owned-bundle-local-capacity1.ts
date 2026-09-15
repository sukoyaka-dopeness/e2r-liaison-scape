import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute } from "../src/graph-presentation.ts";
import { deriveProductParallelBundleLocalDemands, deriveProductParallelBundlePolicy } from "../src/product-parallel-bundle-policy.ts";
import { compareRouteGeometry, minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveOccupiedPathConflict, type LabelRect } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../experimental/product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../experimental/product-owned-bundle-local-capacity1/fixtures.mjs";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Candidate = { id: string; spacing?: number; spacingByKey?: Readonly<Record<string, number>> };

const primaryPositions: Record<string, Point> = { gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 }, epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 } };
const higherPositions: Record<string, Point> = { a: { x: 80, y: 120 }, b: { x: 440, y: 120 }, c: { x: 260, y: -40 }, d: { x: 260, y: 280 } };
const mixedPositions: Record<string, Point> = { a: { x: 100, y: 100 }, b: { x: 460, y: 100 }, c: { x: 100, y: 300 }, d: { x: 460, y: 300 }, e: { x: 100, y: 500 }, f: { x: 460, y: 500 } };
const sharedPositions: Record<string, Point> = { a: { x: 260, y: 220 }, b: { x: 520, y: 80 }, c: { x: 520, y: 360 }, d: { x: 80, y: 80 }, e: { x: 700, y: 80 }, f: { x: 700, y: 360 } };

function median(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDistance(a: number, b: number) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function routeLength(route: DerivedAutomaticRoute) { return route.samples.slice(1).reduce((sum, point, index) => sum + distance(point, route.samples[index]!), 0); }
function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>): LabelRect[] { return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [])); }
function finalConflictCount(presentation: BoundedAutomaticPresentation) { return presentation.routedEdges.reduce((count, route, index) => count + Number(routeSamplesHaveOccupiedPathConflict(route.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))), 0); }

function groupGeometry(presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const groups = new Map<string, DerivedAutomaticRoute[]>();
  for (const route of presentation.routedEdges) {
    if (route.parallelCount <= 1 || route.sourceId === route.targetId) continue;
    const key = [route.sourceId, route.targetId].sort().join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, routes]) => {
    const laneSeparation = Math.min(...routes.flatMap((route, left) => routes.slice(left + 1).map((other) => distance(route.samples[20]!, other.samples[20]!))), Infinity);
    const sideDistribution = routes.reduce<Record<string, number>>((result, route) => {
      const source = positions[route.sourceId]!; const target = positions[route.targetId]!;
      const sign = Math.sign((target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2));
      const side = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero"; result[side] = (result[side] ?? 0) + 1; return result;
    }, {});
    const directions = new Map<string, DerivedAutomaticRoute[]>();
    for (const route of routes) directions.set(`${route.sourceId}\u0000${route.targetId}`, [...(directions.get(`${route.sourceId}\u0000${route.targetId}`) ?? []), route]);
    const endpointAngularSeparation = Math.min(...[...directions.values()].flatMap((group) => group.flatMap((route, index) => group.slice(index + 1).map((other) => angleDistance(Math.atan2(route.controlPoint.y - positions[route.sourceId]!.y, route.controlPoint.x - positions[route.sourceId]!.x), Math.atan2(other.controlPoint.y - positions[other.sourceId]!.y, other.controlPoint.x - positions[other.sourceId]!.x))))), Infinity);
    return { key, parallelCount: routes.length, directionComposition: Object.fromEntries([...directions].map(([direction, group]) => [direction, group.length])), sideDistribution, laneSeparation: Number.isFinite(laneSeparation) ? laneSeparation : null, endpointAngularSeparation: Number.isFinite(endpointAngularSeparation) ? endpointAngularSeparation : null };
  });
}

function labelOwnership(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id)!;
    const ownerDistance = minimumPathToLabelRectDistance(route.samples, label);
    const nearestForeignDistance = Math.min(...presentation.routedEdges.filter(({ id }) => id !== route.id).map((foreign) => minimumPathToLabelRectDistance(foreign.samples, label)), Infinity);
    return { id: route.id, ownerDistance, nearestForeignDistance, ownershipMargin: nearestForeignDistance - ownerDistance, foreignCloser: nearestForeignDistance < ownerDistance };
  });
  return { medianOwnerDistance: median(rows.map(({ ownerDistance }) => ownerDistance)), medianNearestForeignDistance: median(rows.map(({ nearestForeignDistance }) => nearestForeignDistance).filter(Number.isFinite)), medianOwnershipMargin: median(rows.map(({ ownershipMargin }) => ownershipMargin).filter(Number.isFinite)), ownershipAmbiguity: rows.filter(({ ownershipMargin }) => ownershipMargin <= 4).length, foreignCloserCount: rows.filter(({ foreignCloser }) => foreignCloser).length };
}

function evaluate(fixture: Fixture, candidate: Candidate) {
  const graphBase = buildEntityGraph(fixture.dataset as never);
  const relations = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation]));
  const graph = { nodes: graphBase.nodes, edges: graphBase.edges.map((edge) => ({ ...edge, label: relations.get(edge.id)?.name ?? "" })) };
  const presentation = deriveBoundedAutomaticPresentation({ graph, positions: fixture.positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(graphBase, fixture.positions), previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true, parallelBundleSpacing: candidate.spacing, parallelBundleSpacingByKey: candidate.spacingByKey, parallelBundleMode: "bundle" });
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions: fixture.positions, presentation });
  const risk = deriveAutomaticLayoutVisualRiskMetrics({ positions: fixture.positions, presentation });
  const lengths = presentation.routedEdges.map(routeLength);
  return { candidate, graph, presentation, metrics: { groups: groupGeometry(presentation, fixture.positions), crossings: quality.crossings, occupiedConflicts: finalConflictCount(presentation), labels: labelOwnership(presentation), labelOverlap: risk.totalLabelOverlapPairs, nodeCollision: quality.overlapPairs, nodeRelationOverlap: risk.nodeRelationOverlapPairs, routeMedian: median(lengths), routeTotal: lengths.reduce((sum, value) => sum + value, 0), selfLoops: presentation.routedEdges.filter(({ sourceId, targetId }) => sourceId === targetId).length } };
}

function ordinaryChurn(current: ReturnType<typeof evaluate>, candidate: ReturnType<typeof evaluate>) {
  const before = new Map(current.presentation.routedEdges.map((route) => [route.id, route.samples]));
  const changed = candidate.presentation.routedEdges.filter((route) => route.parallelCount === 1 && !compareRouteGeometry(before.get(route.id) ?? [], route.samples).equivalent).map(({ id }) => id);
  return { count: changed.length, ids: changed };
}

function combinations(entries: Array<{ key: string; options: number[] }>, index = 0, current: Record<string, number> = {}): Record<string, number>[] {
  if (index >= entries.length) return [{ ...current }];
  const entry = entries[index]!;
  return entry.options.flatMap((spacing) => combinations(entries, index + 1, { ...current, [entry.key]: spacing }));
}

function compareScore(left: number[], right: number[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function selectJoint(fixture: Fixture, current: ReturnType<typeof evaluate>, fixed: ReturnType<typeof evaluate>) {
  const demands = deriveProductParallelBundleLocalDemands(current.graph.edges);
  const options = demands.map((demand) => ({
    key: demand.key,
    options: [...new Set([0, 8, 12, 16, demand.spacing, Math.min(32, demand.spacing + 4), Math.min(32, demand.spacing + 8)])].sort((a, b) => a - b),
  }));
  const trials = combinations(options).map((spacingByKey) => {
    const evaluation = evaluate(fixture, { id: "bundle-local-joint", spacingByKey });
    const churn = ordinaryChurn(current, evaluation);
    const currentGroups = new Map(current.metrics.groups.map((group) => [group.key, group]));
    const regressions = evaluation.metrics.groups.filter((group) => {
      const baseline = currentGroups.get(group.key);
      return baseline !== undefined && ((group.laneSeparation ?? 0) + 0.5 < (baseline.laneSeparation ?? 0) || (group.endpointAngularSeparation ?? 0) + 0.02 < (baseline.endpointAngularSeparation ?? 0));
    }).map(({ key }) => key);
    const hard = evaluation.metrics.crossings + evaluation.metrics.occupiedConflicts + evaluation.metrics.labelOverlap + evaluation.metrics.nodeCollision + evaluation.metrics.nodeRelationOverlap;
    const groupSignal = evaluation.metrics.groups.reduce((sum, group) => sum + Math.log1p(group.laneSeparation ?? 0) + 4 * (group.endpointAngularSeparation ?? 0), 0);
    const demandByKey = new Map(demands.map((demand) => [demand.key, demand.spacing]));
    const spacingExcess = Object.entries(spacingByKey).reduce((sum, [key, spacing]) => sum + Math.max(0, spacing - (demandByKey.get(key) ?? 0)), 0);
    const spacingDeficit = Object.entries(spacingByKey).reduce((sum, [key, spacing]) => sum + Math.max(0, (demandByKey.get(key) ?? 0) - spacing), 0);
    const score = [hard, regressions.length, evaluation.metrics.labels.foreignCloserCount, evaluation.metrics.labels.ownershipAmbiguity, churn.count, spacingExcess, spacingDeficit, -groupSignal, evaluation.metrics.routeTotal];
    return { spacingByKey, evaluation, churn, regressions, score };
  });
  trials.sort((a, b) => compareScore(a.score, b.score));
  const selected = trials[0]!;
  return { demands, search: { combinations: trials.length, optionSetByKey: Object.fromEntries(options.map(({ key, options: values }) => [key, values])), ordering: ["hard-feasibility", "neighbor-regression", "foreign-closer", "ownership-ambiguity", "ordinary-churn", "spacing-excess-over-demand", "spacing-deficit", "bundle-geometry-signal", "route-total"] }, selected: { spacingByKey: selected.spacingByKey, regressions: selected.regressions, churn: selected.churn, metrics: selected.evaluation.metrics }, fixedChurn: ordinaryChurn(current, fixed) };
}

const frontier = JSON.parse(fs.readFileSync("experimental/frontier-actual-product-visual-sweep1/result-summary.json", "utf8"));
const fixtures: Fixture[] = [
  { id: "parallel-self-loop-control", family: "reverse-same-direction-self-loop", dataset: parallelSelfLoop() as Dataset, positions: primaryPositions },
  { id: "higher-multiplicity-5", family: "higher-multiplicity", dataset: higherMultiplicityParallel() as Dataset, positions: higherPositions },
  { id: "mixed-incident-parallel", family: "mixed-incident", dataset: mixedIncidentParallel() as Dataset, positions: mixedPositions },
  { id: "shared-endpoint-multiple-bundle", family: "multiple-bundle-shared-endpoint", dataset: sharedEndpointBundles() as Dataset, positions: sharedPositions },
  { id: "lighthouse-en", family: "public-sample", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")), positions: frontier.rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions },
];

const rows = fixtures.map((fixture) => {
  const current = evaluate(fixture, { id: "current" });
  const fixed = evaluate(fixture, { id: "bundle-16", spacing: 16 });
  const globalPolicy = deriveProductParallelBundlePolicy(current.graph.edges);
  const global = evaluate(fixture, { id: "graph-wide-adaptive", spacing: globalPolicy.spacing });
  const joint = selectJoint(fixture, current, fixed);
  return { fixture: fixture.id, family: fixture.family, positions: fixture.positions, graph: { nodes: current.graph.nodes.length, edges: current.graph.edges.length }, current: current.metrics, fixed16: { metrics: fixed.metrics, churn: ordinaryChurn(current, fixed) }, graphWideAdaptive: { policy: globalPolicy, metrics: global.metrics, churn: ordinaryChurn(current, global) }, bundleLocalJoint: joint };
});

const output = { contract: "LIAISONSCAPE-PRODUCT-OWNED-BUNDLE-LOCAL-CAPACITY-v1", diagnosticOnly: true, candidateIdentity: "product-owned-bundle-local-joint-feasibility-v1", policy: "bundle-local bounded demand candidates with full Product-authoritative joint feasibility selection", fixedReference: { spacing: 16, mode: "bundle" }, localRelaxation: "not introduced", selfLoopPolicy: "unchanged", structuralPlacement: "unchanged", parallelIncidentArchitecture: "CLOSED", viewportPolicy: "unchanged", rows, standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "product-owned-bundle-local-capacity1", "result-summary.json");
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, demands: row.bundleLocalJoint.demands, selected: row.bundleLocalJoint.selected, current: row.current, fixed16: row.fixed16, global: row.graphWideAdaptive })), null, 2));
