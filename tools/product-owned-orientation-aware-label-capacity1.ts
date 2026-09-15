import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveAutomaticRoutes, deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute } from "../src/graph-presentation.ts";
import { deriveProductParallelBundleLocalDemands } from "../src/product-parallel-bundle-policy.ts";
import { deriveProductOrientationAwareLabelPolicy, type ProductOrientationAwareLabelPolicy } from "../src/product-orientation-aware-label-capacity.ts";
import { compareRouteGeometry, minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveOccupiedPathConflict, type LabelRect } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../experimental/product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../experimental/product-owned-bundle-local-capacity1/fixtures.mjs";
import { horizontalLabelCapacity, verticalLabelCapacity, diagonalLabelCapacity } from "../experimental/product-owned-orientation-aware-label-capacity1/fixtures.mjs";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Candidate = { id: string; spacingByKey?: Readonly<Record<string, number>>; stagger: boolean };
type Evaluation = { candidate: Candidate; graph: ReturnType<typeof graphFor>; presentation: BoundedAutomaticPresentation; orientationPolicy: ProductOrientationAwareLabelPolicy; metrics: ReturnType<typeof metricsFor> };

const primaryPositions: Record<string, Point> = { gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 }, epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 } };
const higherPositions: Record<string, Point> = { a: { x: 80, y: 120 }, b: { x: 440, y: 120 }, c: { x: 260, y: -40 }, d: { x: 260, y: 280 } };
const mixedPositions: Record<string, Point> = { a: { x: 100, y: 100 }, b: { x: 460, y: 100 }, c: { x: 100, y: 300 }, d: { x: 460, y: 300 }, e: { x: 100, y: 500 }, f: { x: 460, y: 500 } };
const sharedPositions: Record<string, Point> = { a: { x: 260, y: 220 }, b: { x: 520, y: 80 }, c: { x: 520, y: 360 }, d: { x: 80, y: 80 }, e: { x: 700, y: 80 }, f: { x: 700, y: 360 } };
const horizontalPositions: Record<string, Point> = { a: { x: 100, y: 160 }, b: { x: 280, y: 160 }, c: { x: 520, y: 160 } };
const verticalPositions: Record<string, Point> = { a: { x: 220, y: 80 }, b: { x: 220, y: 440 }, c: { x: 520, y: 260 } };
const diagonalPositions: Record<string, Point> = { a: { x: 100, y: 100 }, b: { x: 420, y: 320 }, c: { x: 120, y: 500 }, d: { x: 520, y: 500 } };

function graphFor(fixture: Fixture) {
  const base = buildEntityGraph(fixture.dataset as never);
  const relations = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation]));
  return { nodes: base.nodes, edges: base.edges.map((edge) => ({ ...edge, label: relations.get(edge.id)?.name ?? "" })) };
}
function pointDistance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function routeLength(route: DerivedAutomaticRoute) { return route.samples.slice(1).reduce((sum, point, index) => sum + pointDistance(point, route.samples[index]!), 0); }
function median(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function angleDistance(a: number, b: number) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) { return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [])); }
function conflictCount(presentation: BoundedAutomaticPresentation) { return presentation.routedEdges.reduce((count, route, index) => count + Number(routeSamplesHaveOccupiedPathConflict(route.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))), 0); }

function groupMetrics(presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const groups = new Map<string, DerivedAutomaticRoute[]>();
  for (const route of presentation.routedEdges) if (route.parallelCount > 1 && route.sourceId !== route.targetId) { const key = [route.sourceId, route.targetId].sort().join("\u0000"); groups.set(key, [...(groups.get(key) ?? []), route]); }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, routes]) => {
    const lane = Math.min(...routes.flatMap((route, index) => routes.slice(index + 1).map((other) => pointDistance(route.samples[20]!, other.samples[20]!))), Infinity);
    const side = routes.reduce<Record<string, number>>((result, route) => { const source = positions[route.sourceId]!; const target = positions[route.targetId]!; const sign = Math.sign((target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2)); const label = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero"; result[label] = (result[label] ?? 0) + 1; return result; }, {});
    const directions = new Map<string, DerivedAutomaticRoute[]>(); for (const route of routes) directions.set(`${route.sourceId}\u0000${route.targetId}`, [...(directions.get(`${route.sourceId}\u0000${route.targetId}`) ?? []), route]);
    const endpointAngle = Math.min(...[...directions.values()].flatMap((group) => group.flatMap((route, index) => group.slice(index + 1).map((other) => angleDistance(Math.atan2(route.controlPoint.y - positions[route.sourceId]!.y, route.controlPoint.x - positions[route.sourceId]!.x), Math.atan2(other.controlPoint.y - positions[other.sourceId]!.y, other.controlPoint.x - positions[other.sourceId]!.x))))), Infinity);
    return { key, count: routes.length, side, laneSeparation: Number.isFinite(lane) ? lane : null, endpointAngularSeparation: Number.isFinite(endpointAngle) ? endpointAngle : null };
  });
}
function ownership(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => { const label = presentation.relationLabels.get(route.id)!; const owner = minimumPathToLabelRectDistance(route.samples, label); const foreign = Math.min(...presentation.routedEdges.filter(({ id }) => id !== route.id).map((other) => minimumPathToLabelRectDistance(other.samples, label)), Infinity); return { owner, foreign, margin: foreign - owner, foreignCloser: foreign < owner }; });
  return { medianOwnerDistance: median(rows.map(({ owner }) => owner)), medianForeignDistance: median(rows.map(({ foreign }) => foreign).filter(Number.isFinite)), medianMargin: median(rows.map(({ margin }) => margin).filter(Number.isFinite)), ambiguity: rows.filter(({ margin }) => margin <= 4).length, foreignCloser: rows.filter(({ foreignCloser }) => foreignCloser).length };
}
function metricsFor(presentation: BoundedAutomaticPresentation, quality: ReturnType<typeof deriveAutomaticLayoutQualityMetrics>, risk: ReturnType<typeof deriveAutomaticLayoutVisualRiskMetrics>) {
  const lengths = presentation.routedEdges.map(routeLength);
  return { groups: [], crossings: quality.crossings, occupiedConflicts: conflictCount(presentation), ownership: ownership(presentation), labelOverlap: risk.totalLabelOverlapPairs, nodeCollision: quality.overlapPairs, nodeRelationOverlap: risk.nodeRelationOverlapPairs, routeMedian: median(lengths), routeTotal: lengths.reduce((sum, value) => sum + value, 0), selfLoops: presentation.routedEdges.filter(({ sourceId, targetId }) => sourceId === targetId).length };
}

function evaluate(fixture: Fixture, candidate: Candidate): Evaluation {
  const graph = graphFor(fixture);
  const baseInput = { graph, positions: fixture.positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(buildEntityGraph(fixture.dataset as never), fixture.positions), previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true, parallelBundleSpacingByKey: candidate.spacingByKey, parallelBundleMode: "bundle" as const };
  const unstagged = deriveBoundedAutomaticPresentation(baseInput);
  const orientationPolicy = candidate.stagger ? deriveProductOrientationAwareLabelPolicy(unstagged.routedEdges) : { staggerByRelationId: {}, rows: [] };
  const presentation = candidate.stagger ? deriveBoundedAutomaticPresentation({ ...baseInput, relationLabelStaggerById: orientationPolicy.staggerByRelationId }) : unstagged;
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions: fixture.positions, presentation });
  const risk = deriveAutomaticLayoutVisualRiskMetrics({ positions: fixture.positions, presentation });
  const metrics = metricsFor(presentation, quality, risk);
  metrics.groups = groupMetrics(presentation, fixture.positions);
  return { candidate, graph, presentation, orientationPolicy, metrics };
}

function churn(current: Evaluation, candidate: Evaluation) { const before = new Map(current.presentation.routedEdges.map((route) => [route.id, route.samples])); const ids = candidate.presentation.routedEdges.filter((route) => route.parallelCount === 1 && !compareRouteGeometry(before.get(route.id) ?? [], route.samples).equivalent).map(({ id }) => id); return { count: ids.length, ids }; }
function combos(entries: Array<{ key: string; values: number[] }>, index = 0, current: Record<string, number> = {}): Record<string, number>[] { if (index >= entries.length) return [{ ...current }]; const entry = entries[index]!; return entry.values.flatMap((value) => combos(entries, index + 1, { ...current, [entry.key]: value })); }
function score(left: number[], right: number[]) { for (let index = 0; index < Math.min(left.length, right.length); index += 1) if (left[index] !== right[index]) return left[index]! - right[index]!; return left.length - right.length; }

const oldLocal = JSON.parse(fs.readFileSync("experimental/product-owned-bundle-local-capacity1/result-summary.json", "utf8"));
const previousSpacing = (id: string, graph: ReturnType<typeof graphFor>) => oldLocal.rows.find((row: { fixture: string }) => row.fixture === id)?.bundleLocalJoint.selected.spacingByKey ?? Object.fromEntries(deriveProductParallelBundleLocalDemands(graph.edges).map((demand) => [demand.key, demand.spacing]));

function selectOrientation(fixture: Fixture, current: Evaluation, reference: Evaluation) {
  const demands = deriveProductParallelBundleLocalDemands(current.graph.edges);
  const spacingByKey = reference.candidate.spacingByKey ?? Object.fromEntries(demands.map((demand) => [demand.key, demand.spacing]));
  const evaluation = evaluate(fixture, { id: "orientation-aware-stagger", spacingByKey, stagger: true });
  const referenceGroups = new Map(reference.metrics.groups.map((group) => [group.key, group]));
  const regressions = evaluation.metrics.groups.filter((group) => { const baseline = referenceGroups.get(group.key); return baseline !== undefined && ((group.laneSeparation ?? 0) + 0.5 < (baseline.laneSeparation ?? 0) || (group.endpointAngularSeparation ?? 0) + 0.02 < (baseline.endpointAngularSeparation ?? 0)); }).map(({ key }) => key);
  const routeChurn = churn(current, evaluation);
  return { demands, search: { combinations: 1, optionSetByKey: Object.fromEntries(Object.entries(spacingByKey).map(([key, value]) => [key, [value]])), ordering: ["bundle-local-reference-held-fixed", "hard-feasibility", "neighbor-regression", "foreign-closer", "ownership-ambiguity", "ordinary-churn"] }, selected: { spacingByKey, regressions, churn: routeChurn, staggerByRelationId: evaluation.orientationPolicy.staggerByRelationId, metrics: evaluation.metrics, capacityRows: evaluation.orientationPolicy.rows } };
}

const frontier = JSON.parse(fs.readFileSync("experimental/frontier-actual-product-visual-sweep1/result-summary.json", "utf8"));
const fixtures: Fixture[] = [
  { id: "parallel-self-loop-control", family: "reverse-same-direction-self-loop", dataset: parallelSelfLoop() as Dataset, positions: primaryPositions },
  { id: "higher-multiplicity-5", family: "higher-multiplicity", dataset: higherMultiplicityParallel() as Dataset, positions: higherPositions },
  { id: "mixed-incident-parallel", family: "mixed-incident", dataset: mixedIncidentParallel() as Dataset, positions: mixedPositions },
  { id: "shared-endpoint-multiple-bundle", family: "shared-endpoint", dataset: sharedEndpointBundles() as Dataset, positions: sharedPositions },
  { id: "horizontal-label-capacity", family: "horizontal-span", dataset: horizontalLabelCapacity() as Dataset, positions: horizontalPositions },
  { id: "vertical-label-capacity", family: "vertical-stagger", dataset: verticalLabelCapacity() as Dataset, positions: verticalPositions },
  { id: "diagonal-label-capacity", family: "diagonal-continuity", dataset: diagonalLabelCapacity() as Dataset, positions: diagonalPositions },
  { id: "lighthouse-en", family: "public-sample", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")), positions: frontier.rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions },
];

const rows = fixtures.map((fixture) => {
  const current = evaluate(fixture, { id: "current", stagger: false });
  const reference = evaluate(fixture, { id: "bundle-local-reference", spacingByKey: previousSpacing(fixture.id, current.graph), stagger: false });
  const orientation = selectOrientation(fixture, current, reference);
  const selected = evaluate(fixture, { id: "orientation-aware-stagger", spacingByKey: orientation.selected.spacingByKey, stagger: true });
  const wrapRows = selected.orientationPolicy.rows.filter((row) => row.spanDeficit >= 96).map((row) => ({ relationId: row.relationId, spanDeficit: row.spanDeficit, usableOwnerRouteSpan: row.usableOwnerRouteSpan, tangentialFootprint: row.tangentialFootprint }));
  return { fixture: fixture.id, family: fixture.family, positions: fixture.positions, graph: { nodes: current.graph.nodes.length, edges: current.graph.edges.length }, current: { ...current.metrics, groups: current.metrics.groups }, bundleLocalReference: { ...reference.metrics, groups: reference.metrics.groups, churn: churn(current, reference), spacingByKey: reference.candidate.spacingByKey }, orientationAware: { ...selected.metrics, groups: selected.metrics.groups, churn: churn(current, selected), spacingByKey: orientation.selected.spacingByKey, staggerByRelationId: orientation.selected.staggerByRelationId, capacityRows: orientation.selected.capacityRows, wrapRequiredOneLine: wrapRows.length > 0, wrapRows }, search: orientation.search };
});

const output = { contract: "LIAISONSCAPE-PRODUCT-OWNED-ORIENTATION-AWARE-LABEL-CAPACITY-STAGGER-v1", diagnosticOnly: true, candidateIdentity: "product-owned-orientation-aware-label-capacity-stagger-v1", oneLineLabels: true, wrapPolicy: "not implemented; deficits recorded for future display-only wrap checkpoint", localRelaxation: "not introduced", structuralPlacement: "unchanged", selfLoopSelector: "unchanged", parallelIncidentArchitecture: "CLOSED", viewportPolicy: "unchanged", routingAuthority: "Product ordinary routing unchanged", relationLabelAuthority: "Product final Relation-label placement unchanged", rows, standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "product-owned-orientation-aware-label-capacity1", "result-summary.json");
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, selectedSpacing: row.orientationAware.spacingByKey, stagger: row.orientationAware.staggerByRelationId, current: row.current, reference: row.bundleLocalReference, orientationAware: row.orientationAware, wrapRequiredOneLine: row.orientationAware.wrapRequiredOneLine, search: row.search })), null, 2));
