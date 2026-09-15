import fs from "node:fs";
import path from "node:path";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { solveAutoLayout } from "../src/auto-layout.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, type LabelRect } from "../src/viewport.ts";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name: string };
type Case = { id: string; family: string; graph: { nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>; edges: RoutingGraphEdge[] }; input: { entities: Array<{ id: string }>; relations: Relation[] }; count: number };

function makeCase(id: string, family: string, nodeCount: number, edgeCount: number, long = false, selfLoop = false, connected = false): Case {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index): Relation => {
    const targetIndex = connected && index < nodeCount - 1 ? (index + 1) % nodeCount : (index * 3 + 1) % nodeCount;
    const name = long ? `関係 ${index} — 長い日本語 Relation-label の可読性確認` : `Relation ${index}`;
    return { id: `${id}-r${index}`, sourceId: ids[index % nodeCount]!, targetId: selfLoop && index === 0 ? ids[0]! : ids[targetIndex]!, name };
  });
  const input = { entities: ids.map((entityId) => ({ id: entityId })), relations };
  const base = solveAutoLayout(input, { iterations: 3 });
  const groups = new Map<string, Relation[]>();
  for (const edge of relations) { const key = `${edge.sourceId}|${edge.targetId}`; groups.set(key, [...(groups.get(key) ?? []), edge]); }
  const edges = relations.map((edge) => { const group = groups.get(`${edge.sourceId}|${edge.targetId}`)!; return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, parallelIndex: group.findIndex(({ id }) => id === edge.id), parallelCount: group.length, label: edge.name }; });
  const nodes = ids.map((nodeId, index) => ({ id: nodeId, label: long ? `ノード ${index} — 長い日本語ラベル` : `Node ${index}`, description: long ? "説明文を含むラベル表示" : "", ...base[nodeId]! }));
  return { id, family, graph: { nodes, edges }, input, count: family === "dense" || family === "connected-dense-label" ? 12 : 8 };
}

function connectedComponents(testCase: Case): string[][] {
  const neighbors = new Map(testCase.graph.nodes.map(({ id }) => [id, new Set<string>()]));
  for (const edge of testCase.graph.edges) if (edge.sourceId !== edge.targetId) { neighbors.get(edge.sourceId)?.add(edge.targetId); neighbors.get(edge.targetId)?.add(edge.sourceId); }
  const remaining = new Set(neighbors.keys()); const result: string[][] = [];
  while (remaining.size) { const seed = [...remaining].sort()[0]!; const queue = [seed]; const ids: string[] = []; remaining.delete(seed); while (queue.length) { const id = queue.shift()!; ids.push(id); for (const next of [...(neighbors.get(id) ?? [])].sort()) if (remaining.delete(next)) queue.push(next); } result.push(ids.sort()); }
  return result.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function distance(left: Point, right: Point): number { return Math.hypot(left.x - right.x, left.y - right.y); }
function center(ids: string[], source: Record<string, Point>): Point { return { x: ids.reduce((sum, id) => sum + source[id]!.x, 0) / ids.length, y: ids.reduce((sum, id) => sum + source[id]!.y, 0) / ids.length }; }

function localGroups(ids: string[], source: Record<string, Point>): string[][] {
  const groupCount = ids.length >= 12 ? 3 : ids.length >= 8 ? 2 : 1;
  if (groupCount === 1) return [ids.slice().sort()];
  const seeds: string[] = [ids.slice().sort()[0]!];
  while (seeds.length < groupCount) seeds.push(ids.filter((id) => !seeds.includes(id)).sort((left, right) => {
    const leftScore = Math.min(...seeds.map((seed) => distance(source[left]!, source[seed]!)));
    const rightScore = Math.min(...seeds.map((seed) => distance(source[right]!, source[seed]!)));
    return rightScore - leftScore || left.localeCompare(right);
  })[0]!);
  const groups = seeds.map(() => [] as string[]);
  for (const id of ids.slice().sort()) { const target = seeds.reduce((best, seed, index) => distance(source[id]!, source[seed]!) < distance(source[id]!, source[seeds[best]!]!) ? index : best, 0); groups[target]!.push(id); }
  return groups.filter((group) => group.length).map((group) => group.sort());
}

function routeDistance(samples: readonly Point[], label: LabelRect): number {
  return Math.min(...samples.map((point) => Math.hypot(Math.max(Math.abs(point.x - label.x) - label.width / 2, 0), Math.max(Math.abs(point.y - label.y) - label.height / 2, 0))), Infinity);
}

function evaluate(testCase: Case, family: string, positions: Record<string, Point>, formulation: unknown = null) {
  const provisionalNodeLabels = testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
  const presentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: testCase.graph.nodes, edges: testCase.graph.edges, positions, presentation });
  const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  const fit = fitGraphView(Object.values(positions), 800, 500);
  const nodeLabels = [...presentation.nodeLabels.values()];
  let labelBoundsOverlapPairs = 0;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) {
    if (Math.abs(nodeLabels[left]!.x - nodeLabels[right]!.x) < (nodeLabels[left]!.width + nodeLabels[right]!.width) / 2 && Math.abs(nodeLabels[left]!.y - nodeLabels[right]!.y) < (nodeLabels[left]!.height + nodeLabels[right]!.height) / 2) labelBoundsOverlapPairs += 1;
  }
  const neighborDistances = testCase.graph.nodes.map((node) => Math.min(...testCase.graph.nodes.filter(({ id }) => id !== node.id).map((other) => distance(positions[node.id]!, positions[other.id]!))));
  const sortedNeighborDistances = neighborDistances.slice().sort((a, b) => a - b);
  const localDensity = testCase.graph.nodes.map((node) => {
    const label = presentation.nodeLabels.get(node.id);
    const radius = Math.max(72, ((label?.width ?? 48) + (label?.height ?? 24)) * 0.75);
    return testCase.graph.nodes.filter((other) => other.id !== node.id && distance(positions[node.id]!, positions[other.id]!) < radius).length;
  });
  const margins = [...presentation.relationLabels.entries()].map(([relationId, label]) => { const owner = presentation.routedEdges.find(({ id }) => id === relationId); const ownerDistance = owner ? routeDistance(owner.samples, label) : Infinity; const foreign = presentation.routedEdges.filter(({ id }) => id !== relationId).map((route) => routeDistance(route.samples, label)); return (Math.min(...foreign, Infinity) - ownerDistance) * fit.scale; });
  const points = Object.values(positions); const width = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)); const height = Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y));
  const extentUnconstrainedScore = quality.score - (quality.extent[0] + quality.extent[1]) * 0.25;
  const median = (values: number[]) => values[Math.floor(values.length / 2)] ?? 0;
  return { family, positions, formulation, quality, extentUnconstrainedScore, visualRisk, localDensity: { maxNeighborCount: Math.max(...localDensity, 0), medianNeighborCount: median(localDensity.slice().sort((a, b) => a - b)), minimumCenterSeparation: Math.min(...neighborDistances, Infinity), medianNearestNeighbor: median(sortedNeighborDistances), labelBoundsOverlapPairs, componentExtents: connectedComponents(testCase).map((ids) => ({ ids: ids.length, width: Math.max(...ids.map((id) => positions[id]!.x)) - Math.min(...ids.map((id) => positions[id]!.x)), height: Math.max(...ids.map((id) => positions[id]!.y)) - Math.min(...ids.map((id) => positions[id]!.y)) })) }, screenAudit: { overviewFitScale: fit.scale, extent: { width, height }, ownerRouteForeignRouteMarginMedian: median(margins.slice().sort((a, b) => a - b)), ownerRouteForeignRouteMarginMinimum: Math.min(...margins, Infinity), ownerRouteForeignRouteMarginPositiveRatio: margins.filter((value) => value > 0).length / Math.max(1, margins.length) } };
}

function currentPool(testCase: Case) {
  return Array.from({ length: testCase.count }, (_, index) => { const base = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) }); return { family: `existing-${index + 1}`, positions: Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, { x: base[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: base[node.id]!.y + ((index + nodeIndex) % 5) - 2 }])) }; });
}

function extentGrowthCandidate(testCase: Case, source: Record<string, Point>, variant: "local-density-growth" | "local-density-growth-corridor") {
  const componentIds = connectedComponents(testCase); const provisional = testCase.graph.nodes.map((node) => placeNodeLabel(source[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => source[id]!), []));
  const sourcePresentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions: source, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const intensity = variant === "local-density-growth" ? 0.78 : 0.94; const corridorWeight = variant === "local-density-growth" ? 0.35 : 0.65;
  const groups: Array<{ ids: string[]; points: Record<string, Point>; width: number; height: number }> = [];
  for (const component of componentIds) for (const ids of localGroups(component, source)) {
    const groupCenter = center(ids, source); const edges = testCase.graph.edges.filter((edge) => ids.includes(edge.sourceId) && ids.includes(edge.targetId)); const crossingEdges = testCase.graph.edges.filter((edge) => ids.includes(edge.sourceId) !== ids.includes(edge.targetId));
    const labels = ids.map((id) => sourcePresentation.nodeLabels.get(id)!).filter(Boolean); const relationLabels = edges.map((edge) => sourcePresentation.relationLabels.get(edge.id)!).filter(Boolean);
    const maxLabelWidth = Math.max(48, ...labels.map(({ width }) => width)); const maxLabelHeight = Math.max(24, ...labels.map(({ height }) => height)); const relationWidth = relationLabels.reduce((sum, label) => sum + label.width, 0) / Math.max(1, relationLabels.length); const demand = edges.length / Math.max(1, ids.length); const corridor = relationWidth / 220 + crossingEdges.length / Math.max(1, ids.length);
    const scaleX = 1 + intensity * Math.min(1.15, maxLabelWidth / 150 + demand / 10 + corridor * corridorWeight); const scaleY = 1 + intensity * Math.min(0.9, maxLabelHeight / 90 + demand / 18);
    const points = Object.fromEntries(ids.map((id) => { const point = source[id]!; return [id, { x: groupCenter.x + (point.x - groupCenter.x) * scaleX, y: groupCenter.y + (point.y - groupCenter.y) * scaleY }]; }));
    groups.push({ ids, points, width: Math.max(...Object.values(points).map(({ x }) => x)) - Math.min(...Object.values(points).map(({ x }) => x)), height: Math.max(...Object.values(points).map(({ y }) => y)) - Math.min(...Object.values(points).map(({ y }) => y)) });
  }
  const columns = groups.length >= 3 ? 2 : 1; const gapX = variant === "local-density-growth-corridor" ? 110 : 86; const gapY = variant === "local-density-growth-corridor" ? 92 : 74; const packed: Array<{ group: typeof groups[number]; x: number; y: number }> = [];
  for (let index = 0; index < groups.length; index += 1) { const group = groups[index]!; const column = index % columns; const row = Math.floor(index / columns); const columnWidth = Math.max(...groups.filter((_, candidate) => candidate % columns === column).map(({ width }) => width), 1); const rowHeight = Math.max(...groups.filter((_, candidate) => Math.floor(candidate / columns) === row).map(({ height }) => height), 1); packed.push({ group, x: column * (columnWidth + gapX), y: row * (rowHeight + gapY) }); }
  const positions: Record<string, Point> = {}; for (const { group, x, y } of packed) { const minX = Math.min(...Object.values(group.points).map(({ x: value }) => value)); const minY = Math.min(...Object.values(group.points).map(({ y: value }) => value)); for (const id of group.ids) positions[id] = { x: x + group.points[id]!.x - minX, y: y + group.points[id]!.y - minY }; }
  const points = Object.values(positions); return { positions, formulation: { variant, groupCount: groups.length, growthPolicy: "label-demand expansion without viewport fit clamp", sourceExtent: { width: Math.max(...Object.values(source).map(({ x }) => x)) - Math.min(...Object.values(source).map(({ x }) => x)), height: Math.max(...Object.values(source).map(({ y }) => y)) - Math.min(...Object.values(source).map(({ y }) => y)) }, grownExtent: { width: Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)), height: Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y)) }, corridorWeight, viewportFitConstraint: "diagnostic-only" } };
}

const cases = [makeCase("canonical", "canonical", 8, 10), makeCase("dense", "dense", 14, 49), makeCase("label", "label-heavy-ja", 10, 20, true), makeCase("connected", "connected-dense-label", 14, 49, true, false, true), makeCase("parallel", "parallel-incident", 10, 18), makeCase("self-loop", "self-loop", 8, 11, false, true)];
const variants = ["local-density-growth", "local-density-growth-corridor"] as const;
const previousPath = path.join(process.cwd(), "experimental", "bounded-label-capacity-screen-ownership-refinement1", "result-summary.json"); const previous = JSON.parse(fs.readFileSync(previousPath, "utf8")) as { rows: Array<{ fixture: string; probes: Array<{ positions: Record<string, Point> }>; probeBest: { positions: Record<string, Point> }; selectedForPreview: { positions: Record<string, Point> } }> };
const rows = cases.map((testCase) => {
  const existing = currentPool(testCase).map(({ family, positions }) => evaluate(testCase, family, positions)); const currentSelected = existing.slice().sort((a, b) => a.quality.score - b.quality.score)[0]!;
  const previousRow = previous.rows.find(({ fixture }) => fixture === testCase.id); const previousPositions = previousRow?.probeBest.positions ?? previousRow?.selectedForPreview.positions ?? previousRow?.probes[0]?.positions ?? currentSelected.positions; const fitBounded = evaluate(testCase, "previous-fit-bounded-refinement", previousPositions, { source: "bounded-label-capacity-screen-ownership-refinement1", comparison: "probeBest, not selectedForPreview fallback" });
  const probes = variants.map((variant) => { const candidate = extentGrowthCandidate(testCase, currentSelected.positions, variant); return evaluate(testCase, variant, candidate.positions, candidate.formulation); });
  const selected = probes.slice().sort((a, b) => a.localDensity.labelBoundsOverlapPairs - b.localDensity.labelBoundsOverlapPairs || a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.visualRisk.foreignRouteRelationLabelHits - b.visualRisk.foreignRouteRelationLabelHits || a.quality.score - b.quality.score)[0]!;
  return { fixture: testCase.id, family: testCase.family, graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length, components: connectedComponents(testCase).length }, currentHQ: currentSelected, previousFitBounded: fitBounded, extentUnconstrainedCurrentRanking: existing.slice().sort((a, b) => a.extentUnconstrainedScore - b.extentUnconstrainedScore)[0]!.family, probes, selectedInfiniteCanvas: selected, hardFailureSignals: { currentNodeLabelOverlap: currentSelected.localDensity.labelBoundsOverlapPairs, previousNodeLabelOverlap: fitBounded.localDensity.labelBoundsOverlapPairs, selectedNodeLabelOverlap: selected.localDensity.labelBoundsOverlapPairs, selectedAvoidableCompression: selected.localDensity.medianNearestNeighbor < fitBounded.localDensity.medianNearestNeighbor * 0.85 && selected.screenAudit.extent.width < fitBounded.screenAudit.extent.width } };
});
const artifact = { contract: "LIAISONSCAPE-INFINITE-CANVAS-LOCAL-DENSITY-EXTENT-GROWTH-REBASELINE-v1", diagnosticOnly: true, formulation: "bounded deterministic local grouping and label-demand expansion with no viewport fit clamp; fitScale retained only as overview-camera diagnostic", fixtures: cases.map(({ id, family }) => ({ id, family })), variantCount: variants.length, variants, candidateCountBound: variants.length, comparisons: ["current-hq-candidate", "previous-fit-bounded-refinement", "infinite-canvas-local-density-candidate"], viewportModel: { canvas: "effectively-infinite", overviewViewport: { width: 800, height: 500, padding: 96 }, fitScaleMeaning: "camera/information-density diagnostic only", layoutFitHardConstraint: false }, localDensitySignals: ["actual Node-label bounds overlap", "nearest-neighbor separation", "label-relative local neighbor count", "component extent", "Relation-label overlap", "foreign-route pressure", "ownership margin"], productionMetricMutation: false, productAuthoritiesChanged: false, historicalFitInterpretation: "forward-only supersession: prior fit/extent gates remain historical experiment evidence; they are not treated as Product layout requirements", rows, classification: "PENDING-CLASSIFICATION", readiness: { infiniteCanvasModel: "PENDING", localDensityFormulation: "PENDING", nodeOverlapSafety: "PENDING", humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "infinite-canvas-local-density-extent-growth-rebaseline1", "result-summary.json"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, graph, currentHQ, previousFitBounded, selectedInfiniteCanvas, hardFailureSignals }) => ({ fixture, graph, current: { extent: currentHQ.quality.extent, fit: currentHQ.screenAudit.overviewFitScale, nodeLabelOverlap: currentHQ.localDensity.labelBoundsOverlapPairs, labelOverlap: currentHQ.visualRisk.totalLabelOverlapPairs }, previous: { extent: previousFitBounded.quality.extent, fit: previousFitBounded.screenAudit.overviewFitScale, nodeLabelOverlap: previousFitBounded.localDensity.labelBoundsOverlapPairs, labelOverlap: previousFitBounded.visualRisk.totalLabelOverlapPairs }, infinite: { family: selectedInfiniteCanvas.family, extent: selectedInfiniteCanvas.quality.extent, fit: selectedInfiniteCanvas.screenAudit.overviewFitScale, nodeLabelOverlap: selectedInfiniteCanvas.localDensity.labelBoundsOverlapPairs, labelOverlap: selectedInfiniteCanvas.visualRisk.totalLabelOverlapPairs, foreign: selectedInfiniteCanvas.visualRisk.foreignRouteRelationLabelHits, margin: selectedInfiniteCanvas.screenAudit.ownerRouteForeignRouteMarginMedian }, hardFailureSignals })), null, 2));
