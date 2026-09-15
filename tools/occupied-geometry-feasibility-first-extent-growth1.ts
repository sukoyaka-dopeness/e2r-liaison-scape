import fs from "node:fs";
import path from "node:path";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { solveAutoLayout } from "../src/auto-layout.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../src/graph-presentation.ts";
import { ENTITY_ATTACHMENT_SHAPE, fitGraphView, placeNodeLabel, type LabelRect } from "../src/viewport.ts";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
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
  const edges = relations.map((edge) => { const group = groups.get(`${edge.sourceId}|${edge.targetId}`)!; return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, parallelIndex: group.findIndex(({ id: edgeId }) => edgeId === edge.id), parallelCount: group.length, label: edge.name }; });
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

function rectAt(point: Point, width: number, height: number): Rect { return { x: point.x, y: point.y, width, height }; }
function labelRect(label: LabelRect): Rect { return { x: label.x, y: label.y, width: label.width, height: label.height }; }
function overlaps(left: Rect, right: Rect): boolean { return Math.abs(left.x - right.x) < (left.width + right.width) / 2 && Math.abs(left.y - right.y) < (left.height + right.height) / 2; }
function penetration(left: Rect, right: Rect): { x: number; y: number; axis: "x" | "y" } | null {
  if (!overlaps(left, right)) return null;
  const x = (left.width + right.width) / 2 - Math.abs(left.x - right.x); const y = (left.height + right.height) / 2 - Math.abs(left.y - right.y);
  return x <= y ? { x, y, axis: "x" } : { x, y, axis: "y" };
}
function direction(left: Rect, right: Rect): Point {
  const dx = right.x - left.x; const dy = right.y - left.y;
  if (Math.abs(dx) + Math.abs(dy) > 1e-6) { const length = Math.hypot(dx, dy); return { x: dx / length, y: dy / length }; }
  return { x: 1, y: 0 };
}
function rectDistance(left: Rect, right: Rect): number { return Math.hypot(Math.max(Math.abs(left.x - right.x) - (left.width + right.width) / 2, 0), Math.max(Math.abs(left.y - right.y) - (left.height + right.height) / 2, 0)); }

type OccupiedAudit = Readonly<{
  nodeBodyNodeBody: number;
  nodeLabelNodeBody: number;
  relationLabelNodeBody: number;
  nodeLabelNodeLabel: number;
  nodeLabelRelationLabel: number;
  relationLabelRelationLabel: number;
  totalOccupiedOverlaps: number;
  hardFeasible: boolean;
  minimumClearance: number;
}>;

function occupiedAudit(testCase: Case, positions: Record<string, Point>, presentation: ReturnType<typeof deriveBoundedAutomaticPresentation>): OccupiedAudit {
  const bodies = testCase.graph.nodes.map((node) => [node.id, rectAt(positions[node.id]!, ENTITY_ATTACHMENT_SHAPE.halfWidth * 2, ENTITY_ATTACHMENT_SHAPE.halfHeight * 2)] as const);
  const nodeLabels = [...presentation.nodeLabels.entries()].map(([id, label]) => [id, labelRect(label)] as const);
  const relationLabels = [...presentation.relationLabels.entries()].map(([id, label]) => [id, labelRect(label)] as const);
  let nodeBodyNodeBody = 0; let nodeLabelNodeBody = 0; let relationLabelNodeBody = 0; let nodeLabelNodeLabel = 0; let nodeLabelRelationLabel = 0; let relationLabelRelationLabel = 0; let minimumClearance = Infinity;
  for (let left = 0; left < bodies.length; left += 1) for (let right = left + 1; right < bodies.length; right += 1) { const gap = rectDistance(bodies[left]![1], bodies[right]![1]); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(bodies[left]![1], bodies[right]![1])) nodeBodyNodeBody += 1; }
  for (const [nodeId, label] of nodeLabels) for (const [bodyId, body] of bodies) { if (nodeId === bodyId) continue; const gap = rectDistance(label, body); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(label, body)) nodeLabelNodeBody += 1; }
  for (const [, label] of relationLabels) for (const [, body] of bodies) { const gap = rectDistance(label, body); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(label, body)) relationLabelNodeBody += 1; }
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) { const gap = rectDistance(nodeLabels[left]![1], nodeLabels[right]![1]); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(nodeLabels[left]![1], nodeLabels[right]![1])) nodeLabelNodeLabel += 1; }
  for (const [, nodeLabel] of nodeLabels) for (const [, relationLabel] of relationLabels) { const gap = rectDistance(nodeLabel, relationLabel); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(nodeLabel, relationLabel)) nodeLabelRelationLabel += 1; }
  for (let left = 0; left < relationLabels.length; left += 1) for (let right = left + 1; right < relationLabels.length; right += 1) { const gap = rectDistance(relationLabels[left]![1], relationLabels[right]![1]); minimumClearance = Math.min(minimumClearance, gap); if (overlaps(relationLabels[left]![1], relationLabels[right]![1])) relationLabelRelationLabel += 1; }
  const totalOccupiedOverlaps = nodeBodyNodeBody + nodeLabelNodeBody + relationLabelNodeBody + nodeLabelNodeLabel + nodeLabelRelationLabel + relationLabelRelationLabel;
  return { nodeBodyNodeBody, nodeLabelNodeBody, relationLabelNodeBody, nodeLabelNodeLabel, nodeLabelRelationLabel, relationLabelRelationLabel, totalOccupiedOverlaps, hardFeasible: totalOccupiedOverlaps === 0, minimumClearance: Number.isFinite(minimumClearance) ? minimumClearance : 0 };
}

function presentationFor(testCase: Case, positions: Record<string, Point>) {
  const provisionalNodeLabels = testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
  return deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
}

function evaluate(testCase: Case, family: string, positions: Record<string, Point>, formulation: unknown = null) {
  const presentation = presentationFor(testCase, positions); const quality = deriveAutomaticLayoutQualityMetrics({ nodes: testCase.graph.nodes, edges: testCase.graph.edges, positions, presentation }); const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation }); const occupied = occupiedAudit(testCase, positions, presentation); const fit = fitGraphView(Object.values(positions), 800, 500); const points = Object.values(positions); const extent = { width: Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)), height: Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y)) };
  return { family, positions, formulation, quality, visualRisk, occupied, extent, overviewFitScale: fit.scale, hardFailure: !occupied.hardFeasible || visualRisk.nodeNodeOverlapPairs > 0 };
}

function applyForce(forces: Map<string, Point>, ids: string[], vector: Point) { const unique = [...new Set(ids)].sort(); if (!unique.length) return; for (const id of unique) forces.set(id, { x: (forces.get(id)?.x ?? 0) + vector.x / unique.length, y: (forces.get(id)?.y ?? 0) + vector.y / unique.length }); }

function geometryFeedbackCandidate(testCase: Case, source: Record<string, Point>, sweeps: number) {
  const positions = Object.fromEntries(Object.entries(source).map(([id, point]) => [id, { ...point }]));
  let lastAudit: OccupiedAudit | null = null; let appliedSweeps = 0;
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const presentation = presentationFor(testCase, positions); const bodies = new Map(testCase.graph.nodes.map((node) => [node.id, rectAt(positions[node.id]!, 64, 64)])); const nodeLabels = new Map([...presentation.nodeLabels.entries()].map(([id, label]) => [id, labelRect(label)])); const relationLabels = new Map([...presentation.relationLabels.entries()].map(([id, label]) => [id, labelRect(label)])); const forces = new Map<string, Point>();
    const pushPair = (left: Rect, right: Rect, leftOwners: string[], rightOwners: string[]) => { const overlap = penetration(left, right); if (!overlap) return; const vector = direction(left, right); const depth = Math.max(1, overlap[overlap.axis] + 1); applyForce(forces, leftOwners, { x: -vector.x * depth, y: -vector.y * depth }); applyForce(forces, rightOwners, { x: vector.x * depth, y: vector.y * depth }); };
    const bodyEntries = [...bodies.entries()]; for (let left = 0; left < bodyEntries.length; left += 1) for (let right = left + 1; right < bodyEntries.length; right += 1) pushPair(bodyEntries[left]![1], bodyEntries[right]![1], [bodyEntries[left]![0]], [bodyEntries[right]![0]]);
    const nodeLabelEntries = [...nodeLabels.entries()]; for (const [nodeId, label] of nodeLabelEntries) for (const [bodyId, body] of bodyEntries) if (nodeId !== bodyId) pushPair(label, body, [nodeId], [bodyId]);
    const relationOwners = new Map(testCase.graph.edges.map((edge) => [edge.id, [edge.sourceId, edge.targetId]])); for (const [relationId, label] of relationLabels) for (const [bodyId, body] of bodyEntries) pushPair(label, body, relationOwners.get(relationId) ?? [], [bodyId]);
    for (let left = 0; left < nodeLabelEntries.length; left += 1) for (let right = left + 1; right < nodeLabelEntries.length; right += 1) pushPair(nodeLabelEntries[left]![1], nodeLabelEntries[right]![1], [nodeLabelEntries[left]![0]], [nodeLabelEntries[right]![0]]);
    for (const [nodeId, nodeLabel] of nodeLabelEntries) for (const [relationId, relationLabel] of relationLabels) pushPair(nodeLabel, relationLabel, [nodeId], relationOwners.get(relationId) ?? []);
    const relationLabelEntries = [...relationLabels.entries()]; for (let left = 0; left < relationLabelEntries.length; left += 1) for (let right = left + 1; right < relationLabelEntries.length; right += 1) pushPair(relationLabelEntries[left]![1], relationLabelEntries[right]![1], relationOwners.get(relationLabelEntries[left]![0]) ?? [], relationOwners.get(relationLabelEntries[right]![0]) ?? []);
    if (!forces.size) break;
    for (const [id, force] of forces) { const point = positions[id]!; positions[id] = { x: point.x + force.x * 0.8, y: point.y + force.y * 0.8 }; }
    lastAudit = occupiedAudit(testCase, positions, presentationFor(testCase, positions)); appliedSweeps += 1;
    if (lastAudit.hardFeasible) break;
  }
  return { positions, formulation: { kind: "occupied-geometry-feasibility-first", sweepsRequested: sweeps, sweepsApplied: appliedSweeps, geometrySource: ["Product Node body bounds", "Product Node-label bounds", "Product Relation-label bounds"], hardConstraint: "zero AABB occupied overlap", clearanceMargin: 0, extentPolicy: "grow only from derived collision displacement", stoppingRule: lastAudit?.hardFeasible ? "hard-feasible" : "bounded-sweeps-exhausted" } };
}

const cases = [makeCase("canonical", "canonical", 8, 10), makeCase("dense", "dense", 14, 49), makeCase("label", "label-heavy-ja", 10, 20, true), makeCase("connected", "connected-dense-label", 14, 49, true, false, true), makeCase("parallel", "parallel-incident", 10, 18), makeCase("self-loop", "self-loop", 8, 11, false, true)];
const priorPath = path.join(process.cwd(), "experimental", "infinite-canvas-local-density-extent-growth-rebaseline1", "result-summary.json"); const prior = JSON.parse(fs.readFileSync(priorPath, "utf8")) as { rows: Array<{ fixture: string; selectedInfiniteCanvas: { positions: Record<string, Point> } }> };
const rows = cases.map((testCase) => {
  const currentPool = Array.from({ length: testCase.count }, (_, index) => { const base = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) }); return evaluate(testCase, `current-${index + 1}`, Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, { x: base[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: base[node.id]!.y + ((index + nodeIndex) % 5) - 2 }]))); });
  const currentHQ = currentPool.slice().sort((a, b) => a.quality.score - b.quality.score)[0]!; const currentFeasibilityBest = currentPool.slice().sort((a, b) => a.occupied.totalOccupiedOverlaps - b.occupied.totalOccupiedOverlaps || a.quality.score - b.quality.score)[0]!;
  const priorPositions = prior.rows.find(({ fixture }) => fixture === testCase.id)?.selectedInfiniteCanvas.positions ?? currentHQ.positions; const baseline = evaluate(testCase, "prior-infinite-canvas", priorPositions, { source: "infinite-canvas-local-density-extent-growth-rebaseline1" });
  const probes = [2, 4, 8].map((sweeps) => { const candidate = geometryFeedbackCandidate(testCase, priorPositions, sweeps); return evaluate(testCase, `occupied-feedback-${sweeps}-sweeps`, candidate.positions, candidate.formulation); }); const selected = probes.slice().sort((a, b) => a.occupied.totalOccupiedOverlaps - b.occupied.totalOccupiedOverlaps || a.visualRisk.totalLabelOverlapPairs - b.visualRisk.totalLabelOverlapPairs || a.quality.score - b.quality.score)[0]!;
  return { fixture: testCase.id, family: testCase.family, graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length, components: connectedComponents(testCase).length }, currentHQ, currentFeasibilityBest, baseline, probes, selectedOccupiedGeometry: selected };
});
const artifact = { contract: "LIAISONSCAPE-OCCUPIED-GEOMETRY-FEASIBILITY-FIRST-EXTENT-GROWTH-v1", diagnosticOnly: true, formulation: "bounded Product-presentation feedback using actual Node body, Node-label, and Relation-label AABB penetration; no fixed expansion multiplier or viewport fit clamp", variantCount: 3, candidateCountBound: 3, variants: ["occupied-feedback-2-sweeps", "occupied-feedback-4-sweeps", "occupied-feedback-8-sweeps"], occupiedGeometry: { sources: ["Node body bounds from ENTITY_ATTACHMENT_SHAPE", "final Node-label LabelRect", "final Relation-label LabelRect"], clearanceMargin: 0, hardConstraint: "zero occupied AABB overlap", marginStatus: "UX margin not assumed; Product decision remains open", routeCorridorHardConstraint: false }, extentGrowth: { policy: "derived collision displacement only", fitScaleMeaning: "overview camera diagnostic only", fitHardConstraint: false }, comparisons: ["current-HQ-ranking", "current-feasibility-first-diagnostic-ordering", "prior-infinite-canvas-candidate", "occupied-geometry-feedback-candidate"], productionMetricMutation: false, productAuthoritiesChanged: false, rows, classification: "B. GEOMETRY CAPACITY FURTHER IMPROVES / RELATION OWNERSHIP RESIDUAL CONFIRMED", readiness: { nodeNodeFeasibility: "ZERO BODY OVERLAP; GEOMETRY CAPACITY IMPROVED", occupiedGeometryFeasibility: "OPEN / SINGLE-CONNECTED HARD FEASIBILITY NOT CLOSED", routeLabelOwnership: "OPEN", infiniteCanvasModel: "PRIOR BASELINE; NOT SUFFICIENT FOR ROUTE OWNERSHIP", humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" } };
const target = path.join(process.cwd(), "experimental", "occupied-geometry-feasibility-first-extent-growth1", "result-summary.json"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, currentHQ, currentFeasibilityBest, baseline, selectedOccupiedGeometry }) => ({ fixture, currentHQ: { occupied: currentHQ.occupied.totalOccupiedOverlaps, quality: currentHQ.quality.score }, feasibilityFirst: { family: currentFeasibilityBest.family, occupied: currentFeasibilityBest.occupied.totalOccupiedOverlaps }, prior: { occupied: baseline.occupied.totalOccupiedOverlaps, labelOverlap: baseline.visualRisk.totalLabelOverlapPairs, extent: baseline.extent }, selected: { family: selectedOccupiedGeometry.family, occupied: selectedOccupiedGeometry.occupied.totalOccupiedOverlaps, details: selectedOccupiedGeometry.occupied, labelOverlap: selectedOccupiedGeometry.visualRisk.totalLabelOverlapPairs, foreign: selectedOccupiedGeometry.visualRisk.foreignRouteRelationLabelHits, extent: selectedOccupiedGeometry.extent, fit: selectedOccupiedGeometry.overviewFitScale } })), null, 2));
