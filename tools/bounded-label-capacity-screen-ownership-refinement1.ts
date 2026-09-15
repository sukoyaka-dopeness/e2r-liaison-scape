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
type Rect = { width: number; height: number };

function makeCase(id: string, family: string, nodeCount: number, edgeCount: number, long = false, selfLoop = false, connected = false): Case {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index): Relation => {
    const targetIndex = connected && index < nodeCount - 1 ? (index + 1) % nodeCount : (index * 3 + 1) % nodeCount;
    return { id: `${id}-r${index}`, sourceId: ids[index % nodeCount]!, targetId: selfLoop && index === 0 ? ids[0]! : ids[targetIndex]!, name: long ? `関係 ${index} — 長い日本語 Relation-label の可読性確認` : `Relation ${index}` };
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

function currentPool(testCase: Case) {
  return Array.from({ length: testCase.count }, (_, index) => {
    const base = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) });
    return { family: `existing-${index + 1}`, positions: Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, { x: base[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: base[node.id]!.y + ((index + nodeIndex) % 5) - 2 }])) };
  });
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
  const nearestDistances = testCase.graph.nodes.map((node) => Math.min(...testCase.graph.nodes.filter(({ id }) => id !== node.id).map((other) => distance(positions[node.id]!, positions[other.id]!))));
  const nodeLabels = [...presentation.nodeLabels.values()]; const relationLabels = [...presentation.relationLabels.entries()];
  const median = (values: number[]) => values[Math.floor(values.length / 2)] ?? 0;
  const margins = relationLabels.map(([relationId, label]) => { const owner = presentation.routedEdges.find(({ id }) => id === relationId); const ownerDistance = owner ? routeDistance(owner.samples, label) : Infinity; const foreign = presentation.routedEdges.filter(({ id }) => id !== relationId).map((route) => routeDistance(route.samples, label)); return (Math.min(...foreign, Infinity) - ownerDistance) * fit.scale; });
  const points = Object.values(positions); const width = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)); const height = Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y));
  const screenLabelWidths = [...nodeLabels, ...relationLabels.map(([, label]) => label)].map((label) => label.width * fit.scale);
  const screenLabelHeights = [...nodeLabels, ...relationLabels.map(([, label]) => label)].map((label) => label.height * fit.scale);
  const screenAudit = { fitScale: fit.scale, effectiveTextScale: fit.scale, labelScreenOccupancy: visualRisk.labelScreenOccupancy, viewportRelativeExtent: { width: width * fit.scale / 800, height: height * fit.scale / 500 }, postFitMinimumNodeSeparation: Math.min(...nearestDistances) * fit.scale, postFitMedianNodeSeparation: median(nearestDistances.slice().sort((a, b) => a - b)) * fit.scale, postFitMedianLabelWidth: median(screenLabelWidths.slice().sort((a, b) => a - b)), postFitMedianLabelHeight: median(screenLabelHeights.slice().sort((a, b) => a - b)), ownerRouteForeignRouteMarginMedian: median(margins.slice().sort((a, b) => a - b)), ownerRouteForeignRouteMarginMinimum: Math.min(...margins, Infinity), ownerRouteForeignRouteMarginPositiveRatio: margins.filter((value) => value > 0).length / Math.max(1, margins.length) };
  return { family, positions, formulation, quality, visualRisk, screenAudit };
}

function refinementCandidate(testCase: Case, source: Record<string, Point>, variant: "fit-constrained" | "ownership-corridor" | "joint-bounded") {
  const componentIds = connectedComponents(testCase); const provisional = testCase.graph.nodes.map((node) => placeNodeLabel(source[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => source[id]!), []));
  const sourcePresentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions: source, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const intensity = variant === "fit-constrained" ? 0.42 : variant === "ownership-corridor" ? 0.58 : 0.7;
  const corridorWeight = variant === "fit-constrained" ? 0.15 : variant === "ownership-corridor" ? 0.5 : 0.35;
  const groups: Array<{ ids: string[]; points: Record<string, Point>; width: number; height: number; demand: number; corridor: number }> = [];
  for (const component of componentIds) for (const ids of localGroups(component, source)) {
    const groupCenter = center(ids, source); const edges = testCase.graph.edges.filter((edge) => ids.includes(edge.sourceId) && ids.includes(edge.targetId)); const crossingEdges = testCase.graph.edges.filter((edge) => ids.includes(edge.sourceId) !== ids.includes(edge.targetId));
    const labels = ids.map((id) => sourcePresentation.nodeLabels.get(id)!).filter(Boolean); const relationLabels = edges.map((edge) => sourcePresentation.relationLabels.get(edge.id)!).filter(Boolean);
    const width = Math.max(48, ...labels.map(({ width }) => width)); const height = Math.max(24, ...labels.map(({ height }) => height)); const relationWidth = relationLabels.reduce((sum, label) => sum + label.width, 0) / Math.max(1, relationLabels.length); const demand = edges.length / Math.max(1, ids.length); const corridor = relationWidth / 220 + crossingEdges.length / Math.max(1, ids.length);
    const scaleX = 1 + intensity * Math.min(0.72, width / 240 + demand / 16 + corridor * corridorWeight); const scaleY = 1 + intensity * Math.min(0.5, height / 120 + demand / 24);
    const points = Object.fromEntries(ids.map((id) => { const point = source[id]!; return [id, { x: groupCenter.x + (point.x - groupCenter.x) * scaleX, y: groupCenter.y + (point.y - groupCenter.y) * scaleY }]; }));
    groups.push({ ids, points, width: Math.max(...Object.values(points).map(({ x }) => x)) - Math.min(...Object.values(points).map(({ x }) => x)), height: Math.max(...Object.values(points).map(({ y }) => y)) - Math.min(...Object.values(points).map(({ y }) => y)), demand, corridor });
  }
  const columns = groups.length >= 3 ? 2 : 1; const gapX = variant === "ownership-corridor" ? 70 : 52; const gapY = variant === "fit-constrained" ? 42 : 54; const packedGroups: Array<{ group: typeof groups[number]; x: number; y: number }> = [];
  for (let index = 0; index < groups.length; index += 1) { const group = groups[index]!; const column = index % columns; const row = Math.floor(index / columns); const columnWidth = Math.max(...groups.filter((_, candidate) => candidate % columns === column).map(({ width }) => width), 1); const rowHeight = Math.max(...groups.filter((_, candidate) => Math.floor(candidate / columns) === row).map(({ height }) => height), 1); packedGroups.push({ group, x: column * (columnWidth + gapX), y: row * (rowHeight + gapY) }); }
  const raw: Record<string, Point> = {}; for (const { group, x, y } of packedGroups) { const minX = Math.min(...Object.values(group.points).map(({ x: value }) => value)); const minY = Math.min(...Object.values(group.points).map(({ y: value }) => value)); for (const id of group.ids) raw[id] = { x: x + group.points[id]!.x - minX, y: y + group.points[id]!.y - minY }; }
  const rawPoints = Object.values(raw); const rawWidth = Math.max(...rawPoints.map(({ x }) => x)) - Math.min(...rawPoints.map(({ x }) => x)); const rawHeight = Math.max(...rawPoints.map(({ y }) => y)) - Math.min(...rawPoints.map(({ y }) => y)); const sourceFit = fitGraphView(Object.values(source), 800, 500).scale; const sourceWidth = Math.max(...Object.values(source).map(({ x }) => x)) - Math.min(...Object.values(source).map(({ x }) => x)); const sourceHeight = Math.max(...Object.values(source).map(({ y }) => y)) - Math.min(...Object.values(source).map(({ y }) => y));
  const fitBudget = Math.max(sourceFit * 0.9, sourceFit - 0.045); const rawFit = fitGraphView(rawPoints, 800, 500).scale; const extentScale = rawFit < fitBudget ? Math.min(1, rawFit / Math.max(fitBudget, 0.001)) : 1; const rawCenter = center(Object.keys(raw), raw); const positions = Object.fromEntries(Object.entries(raw).map(([id, point]) => [id, { x: rawCenter.x + (point.x - rawCenter.x) * extentScale, y: rawCenter.y + (point.y - rawCenter.y) * extentScale }]));
  return { positions, formulation: { variant, groupCount: groups.length, grouping: "deterministic farthest-seed local groups", fitBudget, sourceFit, rawFit, extentScale, sourceExtent: { width: sourceWidth, height: sourceHeight }, rawExtent: { width: rawWidth, height: rawHeight }, corridorWeight } };
}

const cases = [makeCase("canonical", "canonical", 8, 10), makeCase("dense", "dense", 14, 49), makeCase("label", "label-heavy-ja", 10, 20, true), makeCase("connected", "connected-dense-label", 14, 49, true, false, true), makeCase("parallel", "parallel-incident", 10, 18), makeCase("self-loop", "self-loop", 8, 11, false, true)];
const variants = ["fit-constrained", "ownership-corridor", "joint-bounded"] as const;
const rows = cases.map((testCase) => {
  const existing = currentPool(testCase).map(({ family, positions }) => evaluate(testCase, family, positions)); const currentSelected = existing.slice().sort((a, b) => a.quality.score - b.quality.score)[0]!; const riskBest = existing.slice().sort((a, b) => a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.visualRisk.ownershipAmbiguityCount - b.visualRisk.ownershipAmbiguityCount || b.screenAudit.fitScale - a.screenAudit.fitScale || a.quality.score - b.quality.score)[0]!;
  const probes = variants.map((variant) => { const candidate = refinementCandidate(testCase, currentSelected.positions, variant); return evaluate(testCase, variant, candidate.positions, candidate.formulation); }); const fitBudget = Math.max(currentSelected.screenAudit.fitScale * 0.9, currentSelected.screenAudit.fitScale - 0.045); const feasible = probes.filter((probe) => probe.screenAudit.fitScale >= fitBudget); const ranked = (feasible.length ? feasible : probes).slice().sort((a, b) => a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.visualRisk.foreignRouteRelationLabelHits - b.visualRisk.foreignRouteRelationLabelHits || b.screenAudit.ownerRouteForeignRouteMarginMedian - a.screenAudit.ownerRouteForeignRouteMarginMedian || b.screenAudit.postFitMedianNodeSeparation - a.screenAudit.postFitMedianNodeSeparation || b.screenAudit.fitScale - a.screenAudit.fitScale || a.quality.score - b.quality.score); const jointlySafe = probes.filter((probe) => probe.screenAudit.fitScale >= fitBudget && probe.visualRisk.totalLabelOverlapPairs <= currentSelected.visualRisk.totalLabelOverlapPairs && probe.visualRisk.foreignRouteRelationLabelHits <= currentSelected.visualRisk.foreignRouteRelationLabelHits && probe.visualRisk.ownershipAmbiguityCount <= currentSelected.visualRisk.ownershipAmbiguityCount); const selectedForPreview = (jointlySafe.slice().sort((a, b) => a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || b.screenAudit.ownerRouteForeignRouteMarginMedian - a.screenAudit.ownerRouteForeignRouteMarginMedian || b.screenAudit.fitScale - a.screenAudit.fitScale)[0] ?? currentSelected); return { fixture: testCase.id, family: testCase.family, graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length, components: connectedComponents(testCase).length }, fitBudget, currentSelected, currentPoolVisualRiskBest: riskBest, probes, probeBest: ranked[0]!, jointlySafeVariantCount: jointlySafe.length, selectedForPreview };
});
const artifact = { contract: "LIAISONSCAPE-BOUNDED-LABEL-CAPACITY-SCREEN-OWNERSHIP-REFINEMENT-v1", diagnosticOnly: true, formulation: "deterministic local grouping plus 2D packing, bounded internal capacity expansion, baseline-relative fit budget, and diagnostic ownership margin", variantCount: 3, variants, screenViewport: { width: 800, height: 500, padding: 96 }, globalScalingOnly: false, productionMetricMutation: false, productAuthoritiesChanged: false, candidateCountBound: 3, selectionGate: "fit budget plus non-regression of all diagnostic overlap, foreign-route, and ownership-ambiguity counts; otherwise retain current candidate", rows, classification: "D. MULTI-COMPONENT BENEFIT CONFIRMED / SINGLE-COMPONENT FORMULATION OPEN", readiness: { qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "bounded-label-capacity-screen-ownership-refinement1", "result-summary.json"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`); console.log(JSON.stringify(rows.map(({ fixture, graph, fitBudget, currentSelected, probeBest, feasibleVariantCount }) => ({ fixture, graph, fitBudget, current: { fit: currentSelected.screenAudit.fitScale, overlap: currentSelected.visualRisk.totalLabelOverlapPairs, foreign: currentSelected.visualRisk.foreignRouteRelationLabelHits, ambiguity: currentSelected.visualRisk.ownershipAmbiguityCount }, probe: { family: probeBest.family, fit: probeBest.screenAudit.fitScale, overlap: probeBest.visualRisk.totalLabelOverlapPairs, foreign: probeBest.visualRisk.foreignRouteRelationLabelHits, ambiguity: probeBest.visualRisk.ownershipAmbiguityCount, margin: probeBest.screenAudit.ownerRouteForeignRouteMarginMedian }, feasibleVariantCount })), null, 2));
