import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation, type DerivedAutomaticRoute } from "../src/graph-presentation.ts";
import { compareRouteGeometry, getRelationLabelTextGeometry, minimumPathToLabelRectDistance, placeNodeLabel, relationLabelTextWidth, routeSamplesHaveOccupiedPathConflict, type Point, type RelationLabelWrapPolicy } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../experimental/product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../experimental/product-owned-bundle-local-capacity1/fixtures.mjs";
import { diagonalLabelCapacity, englishTokenCapacity, horizontalLabelCapacity, japaneseLabelCapacity, verticalLabelCapacity } from "../experimental/product-relation-label-display-only-wrap1/fixtures.mjs";

type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Arm = "current-one-line" | "reference-one-line" | "reference-wrap" | "orientation-wrap";
type Candidate = { spacingByKey?: Readonly<Record<string, number>>; staggerByRelationId?: Readonly<Record<string, number>> };

export const WRAP_POLICY: RelationLabelWrapPolicy = { maxLines: 2, maxLineWidth: 132, minimumWidth: 104, routeInset: 120, minimumDeficit: 12 };
export const FINE_NORMAL_OFFSETS = [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24, -32, 32, -40, 40];

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
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function routeLength(route: DerivedAutomaticRoute) { return route.samples.slice(1).reduce((sum, point, index) => sum + distance(point, route.samples[index]!), 0); }
function median(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) { return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [])); }
function conflictCount(presentation: BoundedAutomaticPresentation) { return presentation.routedEdges.reduce((count, route, index) => count + Number(routeSamplesHaveOccupiedPathConflict(route.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))), 0); }
function tangent(route: DerivedAutomaticRoute) {
  const index = Math.min(route.samples.length - 1, Math.max(0, 20));
  const previous = route.samples[Math.max(0, index - 1)] ?? route.samples[0] ?? { x: 1, y: 0 };
  const next = route.samples[Math.min(route.samples.length - 1, index + 1)] ?? route.samples.at(-1) ?? { x: 1, y: 0 };
  const length = Math.max(1, distance(previous, next));
  return { x: (next.x - previous.x) / length, y: (next.y - previous.y) / length };
}
function groupMetrics(presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const groups = new Map<string, DerivedAutomaticRoute[]>();
  for (const route of presentation.routedEdges) if (route.parallelCount > 1 && route.sourceId !== route.targetId) {
    const key = [route.sourceId, route.targetId].sort().join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, routes]) => {
    const lane = Math.min(...routes.flatMap((route, index) => routes.slice(index + 1).map((other) => distance(route.samples[20]!, other.samples[20]!))), Infinity);
    const side = routes.reduce<Record<string, number>>((result, route) => {
      const source = positions[route.sourceId]!;
      const target = positions[route.targetId]!;
      const sign = Math.sign((target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2));
      const name = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero";
      result[name] = (result[name] ?? 0) + 1;
      return result;
    }, {});
    return { key, count: routes.length, side, laneSeparation: Number.isFinite(lane) ? lane : null };
  });
}
function ownership(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id)!;
    const owner = minimumPathToLabelRectDistance(route.samples, label);
    const foreign = Math.min(...presentation.routedEdges.filter(({ id }) => id !== route.id).map((other) => minimumPathToLabelRectDistance(other.samples, label)), Infinity);
    return { owner, foreign, margin: foreign - owner, foreignCloser: foreign < owner };
  });
  return { medianOwnerDistance: median(rows.map(({ owner }) => owner)), medianForeignDistance: median(rows.map(({ foreign }) => foreign).filter(Number.isFinite)), medianMargin: median(rows.map(({ margin }) => margin).filter(Number.isFinite)), ambiguity: rows.filter(({ margin }) => margin <= 4).length, foreignCloser: rows.filter(({ foreignCloser }) => foreignCloser).length };
}
function displayRow(route: DerivedAutomaticRoute, label: string, policy?: RelationLabelWrapPolicy) {
  const oneLine = getRelationLabelTextGeometry(label, route.samples);
  const displayed = getRelationLabelTextGeometry(label, route.samples, policy);
  const frame = tangent(route);
  const oneLineTangentialFootprint = oneLine.width * Math.abs(frame.x) + oneLine.height * Math.abs(frame.y);
  const displayedTangentialFootprint = displayed.width * Math.abs(frame.x) + displayed.height * Math.abs(frame.y);
  const oneLineNormalFootprint = oneLine.width * Math.abs(frame.y) + oneLine.height * Math.abs(frame.x);
  const displayedNormalFootprint = displayed.width * Math.abs(frame.y) + displayed.height * Math.abs(frame.x);
  const lineBreakStrategy = displayed.lines.length <= 1 ? "none" : /\s/u.test(label) ? "word-or-character" : "character";
  const longest = Math.max(...displayed.lines.map(relationLabelTextWidth), 1);
  const shortest = Math.min(...displayed.lines.map(relationLabelTextWidth), longest);
  return {
    relationId: route.id,
    original: label,
    displayedLines: displayed.lines,
    lineCount: displayed.lines.length,
    lineBreakStrategy,
    oneLineWidth: oneLine.width,
    displayedWidth: displayed.width,
    oneLineHeight: oneLine.height,
    displayedHeight: displayed.height,
    wrapped: displayed.wrapped,
    lineBalance: shortest / longest,
    routeLength: routeLength(route),
    usableOwnerRouteSpan: displayed.usableOwnerRouteSpan,
    oneLineTangentialFootprint,
    displayedTangentialFootprint,
    oneLineNormalFootprint,
    displayedNormalFootprint,
    oneLineSpanDeficit: Math.max(0, oneLineTangentialFootprint - displayed.usableOwnerRouteSpan),
    displayedSpanDeficit: Math.max(0, displayedTangentialFootprint - displayed.usableOwnerRouteSpan),
  };
}
function metricsFor(graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions, presentation });
  const risk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  const lengths = presentation.routedEdges.map(routeLength);
  return { groups: groupMetrics(presentation, positions), crossings: quality.crossings, occupiedConflicts: conflictCount(presentation), ownership: ownership(presentation), labelOverlap: risk.totalLabelOverlapPairs, nodeCollision: quality.overlapPairs, nodeRelationOverlap: risk.nodeRelationOverlapPairs, foreignRouteHits: risk.foreignRouteRelationLabelHits, routeMedian: median(lengths), routeTotal: lengths.reduce((sum, value) => sum + value, 0), selfLoops: presentation.routedEdges.filter(({ sourceId, targetId }) => sourceId === targetId).length };
}
function candidateFor(fixture: Fixture, arm: Arm, orientationRows: Map<string, { spacingByKey?: Record<string, number>; staggerByRelationId?: Record<string, number> }>): Candidate {
  if (arm === "current-one-line") return {};
  const prior = orientationRows.get(fixture.id);
  if (!prior) return {};
  if (arm === "orientation-wrap") return prior;
  return { spacingByKey: prior.spacingByKey };
}
function evaluate(fixture: Fixture, arm: Arm, orientationRows: Map<string, { spacingByKey?: Record<string, number>; staggerByRelationId?: Record<string, number> }>) {
  const graph = graphFor(fixture);
  const candidate = candidateFor(fixture, arm, orientationRows);
  const fine = arm !== "current-one-line";
  const wrap = arm === "reference-wrap" || arm === "orientation-wrap";
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions: fixture.positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(buildEntityGraph(fixture.dataset as never), fixture.positions),
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: true,
    parallelBundleSpacingByKey: candidate.spacingByKey,
    parallelBundleMode: "bundle",
    relationLabelNormalOffsets: fine ? FINE_NORMAL_OFFSETS : undefined,
    relationLabelStaggerById: arm === "orientation-wrap" ? candidate.staggerByRelationId : undefined,
    relationLabelWrapPolicy: wrap ? WRAP_POLICY : undefined,
  });
  const labels = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name ?? ""]));
  return { presentation, routes: presentation.routedEdges, metrics: metricsFor(graph, presentation, fixture.positions), display: presentation.routedEdges.map((route) => displayRow(route, labels.get(route.id) ?? "", wrap ? WRAP_POLICY : undefined)) };
}
function ordinaryRouteChurn(before: ReturnType<typeof evaluate>, after: ReturnType<typeof evaluate>) {
  const previous = new Map(before.routes.map((route) => [route.id, route.samples]));
  const ids = after.routes.filter((route) => route.parallelCount === 1 && !compareRouteGeometry(previous.get(route.id) ?? [], route.samples).equivalent).map(({ id }) => id);
  return { count: ids.length, ids };
}

const prior = JSON.parse(fs.readFileSync("experimental/product-owned-orientation-aware-label-capacity1/result-summary.json", "utf8"));
const orientationRows = new Map(prior.rows.map((row: { fixture: string; orientationAware?: Candidate }) => [row.fixture, row.orientationAware ?? {}]));
const fixtures: Fixture[] = [
  { id: "parallel-self-loop-control", family: "reverse-same-direction-self-loop", dataset: parallelSelfLoop() as Dataset, positions: primaryPositions },
  { id: "higher-multiplicity-5", family: "higher-multiplicity", dataset: higherMultiplicityParallel() as Dataset, positions: higherPositions },
  { id: "mixed-incident-parallel", family: "mixed-incident", dataset: mixedIncidentParallel() as Dataset, positions: mixedPositions },
  { id: "shared-endpoint-multiple-bundle", family: "shared-endpoint", dataset: sharedEndpointBundles() as Dataset, positions: sharedPositions },
  { id: "horizontal-label-capacity", family: "horizontal-en", dataset: horizontalLabelCapacity() as Dataset, positions: horizontalPositions },
  { id: "japanese-label-capacity", family: "horizontal-ja", dataset: japaneseLabelCapacity() as Dataset, positions: horizontalPositions },
  { id: "english-token-punctuation", family: "english-break-controls", dataset: englishTokenCapacity() as Dataset, positions: horizontalPositions },
  { id: "vertical-label-capacity", family: "vertical", dataset: verticalLabelCapacity() as Dataset, positions: verticalPositions },
  { id: "diagonal-label-capacity", family: "diagonal", dataset: diagonalLabelCapacity() as Dataset, positions: diagonalPositions },
  { id: "lighthouse-en", family: "public-en", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")), positions: prior.rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions },
  { id: "lighthouse-ja", family: "public-ja", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.ja.e2r.json"), "utf8")), positions: prior.rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions },
];
const arms: Arm[] = ["current-one-line", "reference-one-line", "reference-wrap", "orientation-wrap"];
const rows = fixtures.map((fixture) => {
  const evaluations = Object.fromEntries(arms.map((arm) => [arm, evaluate(fixture, arm, orientationRows)])) as Record<Arm, ReturnType<typeof evaluate>>;
  const baseline = evaluations["current-one-line"];
  const armResults = Object.fromEntries(arms.map((arm) => {
    const evaluation = evaluations[arm];
    const candidate = candidateFor(fixture, arm, orientationRows);
    return [arm, { ...evaluation.metrics, display: evaluation.display, spacingByKey: candidate.spacingByKey, staggerByRelationId: candidate.staggerByRelationId, wrapPolicy: arm === "reference-wrap" || arm === "orientation-wrap" ? WRAP_POLICY : null, routeIds: evaluation.routes.map(({ id }) => id), ordinaryRouteChurn: ordinaryRouteChurn(baseline, evaluation), unnecessaryWrapCount: evaluation.display.filter(({ wrapped, oneLineSpanDeficit }) => wrapped && oneLineSpanDeficit === 0).length }];
  }));
  return { fixture: fixture.id, family: fixture.family, positions: fixture.positions, graph: { nodes: graphFor(fixture).nodes.length, edges: graphFor(fixture).edges.length }, arms: armResults };
});
const output = {
  contract: "LIAISONSCAPE-PRODUCT-RELATION-LABEL-DISPLAY-ONLY-WRAP-v1",
  diagnosticOnly: true,
  candidateIdentity: "product-relation-label-display-only-wrap1",
  authoredValuePolicy: "Dataset Relation names are unchanged; only derived Product display geometry changes",
  wrapPolicy: WRAP_POLICY,
  maxLines: 2,
  breakStrategy: "English whitespace-first with bounded character fallback; Japanese character fallback",
  geometryPolicy: "wrapped LabelRect width/height, SVG text lines, collision envelope, and hit area share one derived geometry",
  bundleCapacity: "reuse prior Product-owned widened/fine reference; no new spacing authority",
  orientationAwareStagger: "reuse prior diagnostic candidate only in orientation-wrap arm",
  structuralPlacement: "unchanged",
  selfLoopPolicy: "unchanged",
  parallelIncidentArchitecture: "CLOSED",
  routingAuthority: "Product ordinary routing unchanged",
  relationLabelAuthority: "Product final Relation-label placement remains authoritative; wrap is diagnostic-only",
  rows,
  standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" },
};
const target = path.join(process.cwd(), "experimental", "product-relation-label-display-only-wrap1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, arms: Object.fromEntries(arms.map((arm) => [arm, { ownership: row.arms[arm].ownership, display: row.arms[arm].display.filter(({ wrapped }) => wrapped), groups: row.arms[arm].groups, unnecessaryWrapCount: row.arms[arm].unnecessaryWrapCount }])) })), null, 2));
