import fs from "node:fs";
import path from "node:path";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { solveAutoLayout } from "../src/auto-layout.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect } from "../src/viewport.ts";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name: string };
type Case = { id: string; family: string; graph: { nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>; edges: RoutingGraphEdge[] }; input: { entities: Array<{ id: string }>; relations: Relation[] }; base: Record<string, Point>; count: number };

function makeCase(id: string, family: string, nodeCount: number, edgeCount: number, long = false, selfLoop = false): Case {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index): Relation => ({ id: `${id}-r${index}`, sourceId: ids[index % nodeCount]!, targetId: selfLoop && index === 0 ? ids[0]! : ids[(index * 3 + 1) % nodeCount]!, name: long ? `関係 ${index} — 長い日本語 Relation-label の可読性確認` : `Relation ${index}` }));
  const input = { entities: ids.map((entityId) => ({ id: entityId })), relations };
  const base = solveAutoLayout(input, { iterations: 3 });
  const groups = new Map<string, Relation[]>();
  for (const edge of relations) { const key = `${edge.sourceId}|${edge.targetId}`; groups.set(key, [...(groups.get(key) ?? []), edge]); }
  const edges = relations.map((edge) => { const group = groups.get(`${edge.sourceId}|${edge.targetId}`)!; return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, parallelIndex: group.findIndex(({ id }) => id === edge.id), parallelCount: group.length, label: edge.name }; });
  const nodes = ids.map((nodeId, index) => ({ id: nodeId, label: long ? `ノード ${index} — 長い日本語ラベル` : `Node ${index}`, description: long ? "説明文を含むラベル表示" : "", ...base[nodeId]! }));
  return { id, family, graph: { nodes, edges }, input, base, count: family === "dense" ? 12 : 8 };
}

function currentPool(testCase: Case) {
  return Array.from({ length: testCase.count }, (_, index) => ({
    family: `existing-${index + 1}`,
    positions: Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, { x: solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) })[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) })[node.id]!.y + ((index + nodeIndex) % 5) - 2 }])),
  }));
}

function components(testCase: Case): string[][] {
  const neighbors = new Map(testCase.graph.nodes.map(({ id }) => [id, new Set<string>()]));
  for (const edge of testCase.graph.edges) if (edge.sourceId !== edge.targetId) { neighbors.get(edge.sourceId)?.add(edge.targetId); neighbors.get(edge.targetId)?.add(edge.sourceId); }
  const remaining = new Set(neighbors.keys()); const result: string[][] = [];
  while (remaining.size) { const seed = [...remaining].sort()[0]!; const queue = [seed]; const ids: string[] = []; remaining.delete(seed); while (queue.length) { const id = queue.shift()!; ids.push(id); for (const next of [...(neighbors.get(id) ?? [])].sort()) if (remaining.delete(next)) queue.push(next); } result.push(ids.sort()); }
  return result.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function labelCapacityCandidate(testCase: Case, source: Record<string, Point>, intensity: number) {
  const componentIds = components(testCase);
  const nodeById = new Map(testCase.graph.nodes.map((node) => [node.id, node]));
  const provisional = testCase.graph.nodes.map((node) => placeNodeLabel(source[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => source[id]!), []));
  const sourcePresentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions: source, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const transformed = new Map<string, Point>(); const componentMetrics = [];
  for (const ids of componentIds) {
    const points = ids.map((id) => source[id]!); const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
    const nodeLabels = ids.map((id) => sourcePresentation.nodeLabels.get(id)!).filter(Boolean);
    const relations = testCase.graph.edges.filter((edge) => ids.includes(edge.sourceId) && ids.includes(edge.targetId));
    const relationLabels = relations.map((edge) => sourcePresentation.relationLabels.get(edge.id)!).filter(Boolean);
    const nodeWidth = Math.max(...nodeLabels.map(({ width }) => width), 48); const nodeHeight = Math.max(...nodeLabels.map(({ height }) => height), 24);
    const relationWidth = relationLabels.reduce((sum, label) => sum + label.width, 0) / Math.max(1, relationLabels.length);
    const degreeDemand = relations.length / Math.max(1, ids.length);
    const xDemand = Math.min(1.15, nodeWidth / 180 + relationWidth / 360 + degreeDemand / 12);
    const yDemand = Math.min(0.75, nodeHeight / 90 + degreeDemand / 18);
    const scaleX = 1 + intensity * xDemand; const scaleY = 1 + intensity * yDemand;
    for (const id of ids) { const point = source[id]!; transformed.set(id, { x: center.x + (point.x - center.x) * scaleX, y: center.y + (point.y - center.y) * scaleY }); }
    componentMetrics.push({ ids, nodeWidth, nodeHeight, relationWidth, degreeDemand, scaleX, scaleY });
  }
  let cursor = 0; const packed: Record<string, Point> = {};
  for (const metric of componentMetrics) {
    const points = metric.ids.map((id) => transformed.get(id)!); const minX = Math.min(...points.map(({ x }) => x)); const maxX = Math.max(...points.map(({ x }) => x)); const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const gap = 48 + metric.nodeWidth * 0.5 + metric.relationWidth * 0.25;
    for (const id of metric.ids) { const point = transformed.get(id)!; packed[id] = { x: cursor + gap + point.x - minX, y: 250 + point.y - centerY }; }
    cursor += gap + (maxX - minX);
  }
  return { positions: packed, componentMetrics };
}

function evaluate(testCase: Case, family: string, positions: Record<string, Point>, capacity = null) {
  const provisionalNodeLabels = testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
  const presentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: testCase.graph.nodes, edges: testCase.graph.edges, positions, presentation });
  const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation });
  const nearestDistances = testCase.graph.nodes.map((node) => Math.min(...testCase.graph.nodes.filter(({ id }) => id !== node.id).map((other) => Math.hypot(positions[node.id]!.x - positions[other.id]!.x, positions[node.id]!.y - positions[other.id]!.y))));
  const nodeLabelWidths = [...presentation.nodeLabels.values()].map(({ width }) => width).sort((a, b) => a - b);
  const relationLabelWidths = [...presentation.relationLabels.values()].map(({ width }) => width).sort((a, b) => a - b);
  const median = (values: number[]) => values[Math.floor(values.length / 2)] ?? 0;
  const capacityAudit = {
    minimumNodeCenterDistance: Math.min(...nearestDistances),
    medianNearestNodeCenterDistance: median(nearestDistances.slice().sort((a, b) => a - b)),
    medianNodeLabelWidth: median(nodeLabelWidths),
    maximumNodeLabelWidth: Math.max(...nodeLabelWidths, 0),
    medianRelationLabelWidth: median(relationLabelWidths),
    nearestDistanceToMedianNodeLabelWidth: median(nearestDistances.slice().sort((a, b) => a - b)) / Math.max(1, median(nodeLabelWidths)),
    postFitMedianNearestDistance: median(nearestDistances.slice().sort((a, b) => a - b)) * visualRisk.fitScale,
    internalRelationDemandPerNode: testCase.graph.edges.length / testCase.graph.nodes.length,
  };
  return { family, positions, capacity, quality, visualRisk, capacityAudit };
}

const cases = [makeCase("canonical", "canonical", 8, 10), makeCase("dense", "dense", 14, 49), makeCase("label", "label-heavy-ja", 10, 20, true), makeCase("parallel", "parallel-incident", 10, 18), makeCase("self-loop", "self-loop", 8, 11, false, true)];
const rows = cases.map((testCase) => {
  const existing = currentPool(testCase).map(({ family, positions }) => evaluate(testCase, family, positions));
  const currentSelected = existing.slice().sort((a, b) => a.quality.score - b.quality.score)[0]!;
  const riskBest = existing.slice().sort((a, b) => a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.visualRisk.ownershipAmbiguityCount - b.visualRisk.ownershipAmbiguityCount || a.visualRisk.foreignRouteRelationLabelHits - b.visualRisk.foreignRouteRelationLabelHits || b.visualRisk.fitScale - a.visualRisk.fitScale || a.quality.score - b.quality.score)[0]!;
  const probes = [0.55, 0.8, 1].map((intensity, index) => { const candidate = labelCapacityCandidate(testCase, currentSelected.positions, intensity); return evaluate(testCase, `label-capacity-${index + 1}`, candidate.positions, candidate.componentMetrics as never); });
  const probeBest = probes.slice().sort((a, b) => a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.visualRisk.ownershipAmbiguityCount - b.visualRisk.ownershipAmbiguityCount || a.visualRisk.foreignRouteRelationLabelHits - b.visualRisk.foreignRouteRelationLabelHits || b.visualRisk.fitScale - a.visualRisk.fitScale || a.quality.score - b.quality.score)[0]!;
  return { fixture: testCase.id, family: testCase.family, graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length, components: components(testCase).length }, currentSelected, currentPoolVisualRiskBest: riskBest, probes, probeBest };
});
const artifact = { contract: "LIAISONSCAPE-EXPLICIT-LABEL-CAPACITY-CANDIDATE-PROBE-v1", diagnosticOnly: true, formulation: "component-local anisotropic expansion derived from actual Product Node/Relation label bounds and internal edge demand, followed by deterministic component repacking", globalScalingOnly: false, productionMetricMutation: false, productAuthoritiesChanged: false, variantCount: 3, rows, classification: "B. LABEL-CAPACITY SIGNAL VALID / FORMULATION NEEDS REFINEMENT", readiness: { qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "explicit-label-capacity-candidate-formulation-probe1", "result-summary.json"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, currentSelected, currentPoolVisualRiskBest, probeBest }) => ({ fixture, current: currentSelected.visualRisk, poolBest: currentPoolVisualRiskBest.visualRisk, probeFamily: probeBest.family, probe: probeBest.visualRisk, currentScore: currentSelected.quality.score, probeScore: probeBest.quality.score })), null, 2));
