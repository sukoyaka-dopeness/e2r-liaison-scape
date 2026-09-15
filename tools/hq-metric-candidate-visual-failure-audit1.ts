import fs from "node:fs";
import path from "node:path";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { solveAutoLayout } from "../src/auto-layout.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect } from "../src/viewport.ts";

type Point = { x: number; y: number };
type Relation = { id: string; sourceId: string; targetId: string; name: string };
type TestCase = { id: string; family: string; graph: { nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>; edges: RoutingGraphEdge[] }; input: { entities: Array<{ id: string }>; relations: Relation[] }; basePositions: Record<string, Point>; candidateCount: number };

function fingerprint(positions: Record<string, Point>): string { return Object.keys(positions).sort().map((id) => `${id}:${positions[id]!.x.toFixed(3)},${positions[id]!.y.toFixed(3)}`).join("|"); }
function makeCase(id: string, family: string, nodeCount: number, edgeCount: number, long = false, selfLoop = false): TestCase {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index): Relation => ({
    id: `${id}-r${index}`,
    sourceId: ids[index % nodeCount]!,
    targetId: selfLoop && index === 0 ? ids[0]! : ids[(index * 3 + 1) % nodeCount]!,
    name: long ? `関係 ${index} — 長い日本語 Relation-label の可読性確認` : `Relation ${index}`,
  }));
  const input = { entities: ids.map((entityId) => ({ id: entityId })), relations };
  const basePositions = solveAutoLayout(input, { iterations: 3 });
  const directed = new Map<string, Relation[]>();
  for (const relation of relations) { const key = `${relation.sourceId}|${relation.targetId}`; directed.set(key, [...(directed.get(key) ?? []), relation]); }
  const edges = relations.map((relation) => { const group = directed.get(`${relation.sourceId}|${relation.targetId}`)!; return { id: relation.id, sourceId: relation.sourceId, targetId: relation.targetId, parallelIndex: group.findIndex(({ id: relationId }) => relationId === relation.id), parallelCount: group.length, label: relation.name }; });
  const nodes = ids.map((nodeId, index) => ({ id: nodeId, label: long ? `ノード ${index} — 長い日本語ラベル` : `Node ${index}`, description: long ? "説明文を含むラベル表示" : "", x: basePositions[nodeId]!.x, y: basePositions[nodeId]!.y }));
  return { id, family, graph: { nodes, edges }, input, basePositions, candidateCount: family === "dense" ? 12 : 8 };
}

function candidates(testCase: TestCase) {
  return Array.from({ length: testCase.candidateCount }, (_, index) => {
    const solved = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) });
    const positions = Object.fromEntries(testCase.graph.nodes.map((node, nodeIndex) => [node.id, {
      x: solved[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4,
      y: solved[node.id]!.y + ((index + nodeIndex) % 5) - 2,
    }]));
    const provisionalNodeLabels = testCase.graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
    const presentation = deriveBoundedAutomaticPresentation({ graph: testCase.graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
    return { index: index + 1, family: `browser-existing-frontier-adapter-${index + 1}`, fingerprint: fingerprint(positions), positions, quality: deriveAutomaticLayoutQualityMetrics({ nodes: testCase.graph.nodes, edges: testCase.graph.edges, positions, presentation }), visualRisk: deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation }) };
  });
}

const cases = [
  makeCase("canonical", "canonical", 8, 10),
  makeCase("dense", "dense", 14, 49),
  makeCase("label", "label-heavy-ja", 10, 20, true),
  makeCase("self-loop", "self-loop-control", 8, 11, false, true),
];
const rows = cases.map((testCase) => {
  const pool = candidates(testCase);
  const qualityRanked = pool.slice().sort((left, right) => left.quality.score - right.quality.score || left.index - right.index);
  const riskRanked = pool.slice().sort((left, right) => left.visualRisk.totalLabelOverlapPairs - right.visualRisk.totalLabelOverlapPairs
    || left.visualRisk.ownershipAmbiguityCount - right.visualRisk.ownershipAmbiguityCount
    || left.visualRisk.foreignRouteRelationLabelHits - right.visualRisk.foreignRouteRelationLabelHits
    || right.visualRisk.fitScale - left.visualRisk.fitScale
    || left.quality.score - right.quality.score
    || left.index - right.index);
  const selected = qualityRanked[0]!;
  const riskBest = riskRanked[0]!;
  return {
    fixture: testCase.id,
    family: testCase.family,
    graph: { nodes: testCase.graph.nodes.length, edges: testCase.graph.edges.length },
    candidateCount: pool.length,
    currentSelectedIndex: selected.index,
    currentSelectedFingerprint: selected.fingerprint,
    currentSelectedVisualRiskRank: riskRanked.indexOf(selected) + 1,
    visualRiskBestIndex: riskBest.index,
    visualRiskBestFingerprint: riskBest.fingerprint,
    visualRiskDelta: {
      totalLabelOverlapPairs: riskBest.visualRisk.totalLabelOverlapPairs - selected.visualRisk.totalLabelOverlapPairs,
      ownershipAmbiguityCount: riskBest.visualRisk.ownershipAmbiguityCount - selected.visualRisk.ownershipAmbiguityCount,
      foreignRouteRelationLabelHits: riskBest.visualRisk.foreignRouteRelationLabelHits - selected.visualRisk.foreignRouteRelationLabelHits,
      fitScale: riskBest.visualRisk.fitScale - selected.visualRisk.fitScale,
    },
    candidateVisualDiversity: new Set(pool.map(({ visualRisk }) => `${visualRisk.totalLabelOverlapPairs}|${visualRisk.foreignRouteRelationLabelHits}|${visualRisk.ownershipAmbiguityCount}|${visualRisk.fitScale.toFixed(3)}`)).size,
    candidates: pool,
  };
});
const artifact = {
  contract: "LIAISONSCAPE-HQ-METRIC-CANDIDATE-VISUAL-FAILURE-AUDIT-v1",
  diagnosticOnly: true,
  metricMutation: false,
  candidateGenerationMutation: false,
  sourceBoundary: "Existing deterministic browser frontier adapter and current Product presentation are replayed. Visual-risk metrics diagnose output only and do not replace Product label/routing authority or production selection.",
  metricAudit: {
    currentScoreIncludes: ["crossings", "crossingRelationLabelNear", "Node-label route hits/near", "Node-label pair overlap", "usable relation span", "short hops", "route length", "extent"],
    recordedButNotScored: ["fitScale", "labelCorridorDeficit", "labelCorridorConflictPairs", "labelCorridorMinimumClearance", "labelCorridorMaximumIntrusion", "minimumSeparation"],
    missingFromCurrentMetric: ["Relation-label/Relation-label overlap", "Node-label/Relation-label overlap", "foreign-route/Relation-label collision", "Relation-label ownership ambiguity", "post-fit effective text scale", "screen label occupancy"],
  },
  rows,
  diagnosticOrdering: "lexicographic: total label overlap, ownership ambiguity, foreign-route hits, descending fitScale, existing quality score; no tuned scalar weights",
  classification: "C. METRIC AND CANDIDATE FORMULATION BOTH INSUFFICIENT",
  readiness: { qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" },
};
const target = path.join(process.cwd(), "experimental", "hq-metric-candidate-visual-failure-audit1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, candidateCount, currentSelectedIndex, currentSelectedVisualRiskRank, visualRiskBestIndex, visualRiskDelta, candidateVisualDiversity }) => ({ fixture, candidateCount, currentSelectedIndex, currentSelectedVisualRiskRank, visualRiskBestIndex, visualRiskDelta, candidateVisualDiversity })), null, 2));
