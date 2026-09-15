import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, deriveAutomaticRoutes, type AutomaticRelationLabelCandidateTrace, type BoundedAutomaticPresentation, type DerivedAutomaticRoute } from "../src/graph-presentation.ts";
import { compareRouteGeometry } from "../src/viewport.ts";
import { minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveOccupiedPathConflict, type LabelRect, type Point } from "../src/viewport.ts";
import { parallelSelfLoop } from "../experimental/diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../experimental/product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../experimental/product-owned-bundle-local-capacity1/fixtures.mjs";

type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Arm = "current-coarse" | "widened-coarse" | "current-fine" | "widened-fine";
type Evaluation = { presentation: BoundedAutomaticPresentation; routes: DerivedAutomaticRoute[]; traces: AutomaticRelationLabelCandidateTrace[]; metrics: ReturnType<typeof metricsFor> };

export const FINE_NORMAL_OFFSETS = [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24, -32, 32, -40, 40];

const primaryPositions: Record<string, Point> = { gamma: { x: 208, y: 174 }, beta: { x: 208, y: -10 }, alpha: { x: 35, y: -10 }, eta: { x: 553, y: -10 }, epsilon: { x: 380, y: 174 }, zeta: { x: 380, y: -10 }, delta: { x: 35, y: 174 }, theta: { x: 553, y: 174 } };
const higherPositions: Record<string, Point> = { a: { x: 80, y: 120 }, b: { x: 440, y: 120 }, c: { x: 260, y: -40 }, d: { x: 260, y: 280 } };
const mixedPositions: Record<string, Point> = { a: { x: 100, y: 100 }, b: { x: 460, y: 100 }, c: { x: 100, y: 300 }, d: { x: 460, y: 300 }, e: { x: 100, y: 500 }, f: { x: 460, y: 500 } };
const sharedPositions: Record<string, Point> = { a: { x: 260, y: 220 }, b: { x: 520, y: 80 }, c: { x: 520, y: 360 }, d: { x: 80, y: 80 }, e: { x: 700, y: 80 }, f: { x: 700, y: 360 } };

function graphFor(fixture: Fixture) {
  const base = buildEntityGraph(fixture.dataset as never);
  const relations = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation]));
  return { nodes: base.nodes, edges: base.edges.map((edge) => ({ ...edge, label: relations.get(edge.id)?.name ?? "" })) };
}
function pointDistance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function routeLength(route: DerivedAutomaticRoute) { return route.samples.slice(1).reduce((sum, point, index) => sum + pointDistance(point, route.samples[index]!), 0); }
function median(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) { return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [])); }
function conflictCount(presentation: BoundedAutomaticPresentation) { return presentation.routedEdges.reduce((count, route, index) => count + Number(routeSamplesHaveOccupiedPathConflict(route.samples, presentation.routedEdges.slice(0, index).map(({ samples }) => samples))), 0); }

function ownership(presentation: BoundedAutomaticPresentation) {
  const rows = presentation.routedEdges.map((route) => { const label = presentation.relationLabels.get(route.id)!; const owner = minimumPathToLabelRectDistance(route.samples, label); const foreign = Math.min(...presentation.routedEdges.filter(({ id }) => id !== route.id).map((other) => minimumPathToLabelRectDistance(other.samples, label)), Infinity); return { owner, foreign, margin: foreign - owner, foreignCloser: foreign < owner }; });
  return { medianOwnerDistance: median(rows.map(({ owner }) => owner)), medianForeignDistance: median(rows.map(({ foreign }) => foreign).filter(Number.isFinite)), medianMargin: median(rows.map(({ margin }) => margin).filter(Number.isFinite)), ambiguity: rows.filter(({ margin }) => margin <= 4).length, foreignCloser: rows.filter(({ foreignCloser }) => foreignCloser).length };
}
function groupMetrics(presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const groups = new Map<string, DerivedAutomaticRoute[]>();
  for (const route of presentation.routedEdges) if (route.parallelCount > 1 && route.sourceId !== route.targetId) { const key = [route.sourceId, route.targetId].sort().join("\u0000"); groups.set(key, [...(groups.get(key) ?? []), route]); }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, routes]) => {
    const lane = Math.min(...routes.flatMap((route, index) => routes.slice(index + 1).map((other) => pointDistance(route.samples[20]!, other.samples[20]!))), Infinity);
    const side = routes.reduce<Record<string, number>>((result, route) => { const source = positions[route.sourceId]!; const target = positions[route.targetId]!; const sign = Math.sign((target.x - source.x) * (route.controlPoint.y - (source.y + target.y) / 2) - (target.y - source.y) * (route.controlPoint.x - (source.x + target.x) / 2)); const label = sign < 0 ? "negative" : sign > 0 ? "positive" : "zero"; result[label] = (result[label] ?? 0) + 1; return result; }, {});
    return { key, count: routes.length, side, laneSeparation: Number.isFinite(lane) ? lane : null };
  });
}
function metricsFor(graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation, positions: Record<string, Point>) {
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions, presentation });
  const risk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  const lengths = presentation.routedEdges.map(routeLength);
  return { groups: groupMetrics(presentation, positions), crossings: quality.crossings, occupiedConflicts: conflictCount(presentation), ownership: ownership(presentation), labelOverlap: risk.totalLabelOverlapPairs, nodeCollision: quality.overlapPairs, nodeRelationOverlap: risk.nodeRelationOverlapPairs, routeMedian: median(lengths), routeTotal: lengths.reduce((sum, value) => sum + value, 0), selfLoops: presentation.routedEdges.filter(({ sourceId, targetId }) => sourceId === targetId).length };
}

function candidateSpacing(fixture: Fixture, arm: Arm): Readonly<Record<string, number>> | undefined {
  if (arm.startsWith("current")) return undefined;
  if (fixture.id === "parallel-self-loop-control") return { "alpha\u0000beta": 20, "delta\u0000gamma": 12 };
  if (fixture.id === "higher-multiplicity-5") return { "a\u0000b": 16 };
  if (fixture.id === "mixed-incident-parallel") return { "a\u0000b": 24 };
  if (fixture.id === "shared-endpoint-multiple-bundle") return { "a\u0000b": 16, "a\u0000c": 16 };
  return { "clara\u0000thomas": 12 };
}
function bestCandidateByOffset(trace: AutomaticRelationLabelCandidateTrace, normalOffset: number) {
  const candidates = trace.candidates.filter((candidate) => candidate.normalOffset === normalOffset);
  const best = candidates.slice().sort((left, right) => left.score - right.score || left.preference - right.preference)[0];
  if (!best) return null;
  return { sampleIndex: best.sampleIndex, normalOffset: best.normalOffset, labelOverlap: best.labelOverlap, nodeOverlap: best.nodeOverlap, edgeOverlap: best.edgeOverlap, foreignRouteIds: best.edgeOverlapPathIndexes.map((index) => trace.otherRouteIds?.[index]).filter((id): id is string => Boolean(id)), score: best.score, preference: best.preference, selected: best.selected };
}
function traceSummary(trace: AutomaticRelationLabelCandidateTrace) {
  const diagnostics = trace.candidates;
  const selected = diagnostics.find((candidate) => candidate.selected);
  const offsets = [...new Set(diagnostics.map(({ normalOffset }) => normalOffset))];
  return { pass: trace.pass, relationId: trace.relationId, processingIndex: trace.processingIndex, selected: selected ? { sampleIndex: selected.sampleIndex, normalOffset: selected.normalOffset, labelOverlap: selected.labelOverlap, nodeOverlap: selected.nodeOverlap, edgeOverlap: selected.edgeOverlap, foreignRouteIds: selected.edgeOverlapPathIndexes.map((index) => trace.otherRouteIds?.[index]).filter((id): id is string => Boolean(id)), score: selected.score } : null, zero: bestCandidateByOffset(trace, 0), offsetSummary: offsets.map((offset) => bestCandidateByOffset(trace, offset)).filter((value): value is NonNullable<typeof value> => value !== null) };
}

function evaluate(fixture: Fixture, arm: Arm): Evaluation {
  const graph = graphFor(fixture);
  const traces: AutomaticRelationLabelCandidateTrace[] = [];
  const fine = arm.endsWith("fine");
  const presentation = deriveBoundedAutomaticPresentation({ graph, positions: fixture.positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(buildEntityGraph(fixture.dataset as never), fixture.positions), previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true, parallelBundleSpacingByKey: candidateSpacing(fixture, arm), parallelBundleMode: "bundle", relationLabelNormalOffsets: fine ? FINE_NORMAL_OFFSETS : undefined, relationLabelCandidateTraceSink: (trace) => traces.push(trace) });
  const finalTraces = [...new Map(traces.filter((trace) => trace.pass === "feedback" || trace.pass === "first").map((trace) => [trace.relationId, trace])).values()];
  return { presentation, routes: presentation.routedEdges, traces: finalTraces, metrics: metricsFor(graph, presentation, fixture.positions) };
}
function ordinaryRouteChurn(before: Evaluation, after: Evaluation) {
  const previous = new Map(before.routes.map((route) => [route.id, route.samples]));
  const ids = after.routes.filter((route) => route.parallelCount === 1 && !compareRouteGeometry(previous.get(route.id) ?? [], route.samples).equivalent).map(({ id }) => id);
  return { count: ids.length, ids };
}

const frontier = JSON.parse(fs.readFileSync("experimental/frontier-actual-product-visual-sweep1/result-summary.json", "utf8"));
const fixtures: Fixture[] = [
  { id: "parallel-self-loop-control", family: "primary", dataset: parallelSelfLoop() as Dataset, positions: primaryPositions },
  { id: "higher-multiplicity-5", family: "higher-multiplicity", dataset: higherMultiplicityParallel() as Dataset, positions: higherPositions },
  { id: "mixed-incident-parallel", family: "mixed-incident", dataset: mixedIncidentParallel() as Dataset, positions: mixedPositions },
  { id: "shared-endpoint-multiple-bundle", family: "shared-endpoint", dataset: sharedEndpointBundles() as Dataset, positions: sharedPositions },
  { id: "lighthouse-en", family: "public-sample", dataset: JSON.parse(fs.readFileSync(path.join("..", "e2r-spec", "examples", "lighthouse-restoration-demo.en.e2r.json"), "utf8")), positions: frontier.rows.find((row: { fixture: string }) => row.fixture === "lighthouse-en").positions },
];

const arms: Arm[] = ["current-coarse", "widened-coarse", "current-fine", "widened-fine"];
const rows = fixtures.map((fixture) => {
  const evaluations = Object.fromEntries(arms.map((arm) => [arm, evaluate(fixture, arm)])) as Record<Arm, Evaluation>;
  const baseline = evaluations["current-coarse"];
  const armResults = Object.fromEntries(arms.map((arm) => { const evaluation = evaluations[arm]; return [arm, { ...evaluation.metrics, spacingByKey: candidateSpacing(fixture, arm), normalOffsets: arm.endsWith("fine") ? FINE_NORMAL_OFFSETS : [0, -24, 24, -40, 40], labelTraces: fixture.id === "parallel-self-loop-control" ? evaluation.traces.filter(({ relationId }) => ["r-ab-1", "r-ab-2", "r-ba-1", "r-ba-2", "r-cd-1", "r-cd-2"].includes(relationId)).map(traceSummary) : [], routeIds: evaluation.routes.map(({ id }) => id), ordinaryRouteChurn: ordinaryRouteChurn(baseline, evaluation) }]; }));
  return { fixture: fixture.id, family: fixture.family, positions: fixture.positions, graph: { nodes: graphFor(fixture).nodes.length, edges: graphFor(fixture).edges.length }, arms: armResults };
});
const output = { contract: "LIAISONSCAPE-PRODUCT-RELATION-LABEL-NORMAL-OFFSET-GRANULARITY-v1", diagnosticOnly: true, candidateIdentity: "product-relation-label-normal-offset-granularity1", coarseNormalOffsets: [0, -24, 24, -40, 40], fineNormalOffsets: FINE_NORMAL_OFFSETS, widenedBundlePolicy: "reuse prior Product-owned bundle-local spacing maps; no new route authority", wrap: "not evaluated; remains a separate display-only checkpoint", selfLoopPolicy: "unchanged", structuralPlacement: "unchanged", parallelIncidentArchitecture: "CLOSED", relationLabelAuthority: "Product final Relation-label placement unchanged", rows, standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "product-relation-label-normal-offset-granularity1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, arms: Object.fromEntries(arms.map((arm) => [arm, { ownership: row.arms[arm].ownership, groups: row.arms[arm].groups, traces: row.arms[arm].labelTraces }])) })), null, 2));
