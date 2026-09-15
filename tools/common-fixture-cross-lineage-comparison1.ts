import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildEntityGraph } from "../src/dataset.ts";
import { settleInitialPlacement, solveAutoLayout } from "../src/auto-layout.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveAutomaticLayoutVisualRiskMetrics } from "../src/automatic-layout-visual-risk.ts";
import { deriveBoundedAutomaticPresentation, type RoutingGraphEdge } from "../src/graph-presentation.ts";
import { ENTITY_ATTACHMENT_SHAPE, fitGraphView, placeNodeLabel, type LabelRect } from "../src/viewport.ts";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Case = { id: string; source: string; dataset: Dataset; nodes: Array<{ id: string; label: string; description: string; x: number; y: number }>; edges: RoutingGraphEdge[]; input: { entities: Array<{ id: string }>; relations: Array<{ id: string; sourceId: string; targetId: string }> }; count: number };

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "common-fixture-cross-lineage-comparison1");

function syntheticDense(): Dataset {
  const left = Array.from({ length: 7 }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: 7 }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}

function syntheticParallelLoop(): Dataset {
  const ids = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  const pairs = [
    ["r-ab-1", "alpha", "beta", "relates"], ["r-ab-2", "alpha", "beta", "supports"],
    ["r-ba-1", "beta", "alpha", "returns"], ["r-ba-2", "beta", "alpha", "reverses"],
    ["r-cd-1", "gamma", "delta", "links"], ["r-cd-2", "gamma", "delta", "tracks"],
    ["r-loop", "epsilon", "epsilon", "self monitors"], ["r-ef", "epsilon", "zeta", "connects"],
    ["r-fg", "zeta", "eta", "connects"], ["r-gh", "eta", "theta", "connects"], ["r-he", "theta", "epsilon", "connects"],
  ] as const;
  return { version: "1.0", entities: ids.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) })), events: [], relations: pairs.map(([id, sourceId, targetId, name]) => ({ id, sourceId, targetId, name })) };
}

const fixtureDefinitions = [
  ["lighthouse-en", "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json"],
  ["apollo-ja", "../e2r-spec/examples/apollo-11-mission.ja.e2r.json"],
  ["synthetic-dense-k7-7", "synthetic:k7-7"],
  ["parallel-self-loop-control", "synthetic:parallel-self-loop-control"],
] as const;

function loadDataset(id: string, source: string): Dataset {
  if (source === "synthetic:k7-7") return syntheticDense();
  if (source === "synthetic:parallel-self-loop-control") return syntheticParallelLoop();
  return JSON.parse(fs.readFileSync(path.resolve(root, source), "utf8")) as Dataset;
}

function makeCase(id: string, source: string): Case {
  const dataset = loadDataset(id, source);
  const graph = buildEntityGraph(dataset);
  const relationNames = new Map(dataset.relations.map((relation) => [relation.id, relation.name ?? relation.id]));
  const edges = graph.edges.map((edge) => ({ ...edge, label: relationNames.get(edge.id) ?? edge.id }));
  const input = { entities: graph.nodes.map(({ id: entityId }) => ({ id: entityId })), relations: graph.edges.map(({ id: relationId, sourceId, targetId }) => ({ id: relationId, sourceId, targetId })) };
  return { id, source, dataset, nodes: graph.nodes, edges, input, count: graph.nodes.length >= 14 ? 12 : 8 };
}

function components(testCase: Case): string[][] {
  const neighbours = new Map(testCase.nodes.map(({ id }) => [id, new Set<string>()]));
  for (const edge of testCase.edges) if (edge.sourceId !== edge.targetId) { neighbours.get(edge.sourceId)?.add(edge.targetId); neighbours.get(edge.targetId)?.add(edge.sourceId); }
  const remaining = new Set(neighbours.keys()); const result: string[][] = [];
  while (remaining.size) { const seed = [...remaining].sort()[0]!; const queue = [seed]; const ids: string[] = []; remaining.delete(seed); while (queue.length) { const id = queue.shift()!; ids.push(id); for (const next of [...(neighbours.get(id) ?? [])].sort()) if (remaining.delete(next)) queue.push(next); } result.push(ids.sort()); }
  return result.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function presentation(testCase: Case, positions: Record<string, Point>) {
  const provisionalNodeLabels = testCase.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], testCase.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
  return deriveBoundedAutomaticPresentation({ graph: { nodes: testCase.nodes, edges: testCase.edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels, previousNodeLabelPlacements: new Map<string, LabelRect>(), previousRelationLabelPlacements: new Map<string, LabelRect>(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true });
}

function rect(point: Point, width: number, height: number): Rect { return { x: point.x, y: point.y, width, height }; }
function overlaps(left: Rect, right: Rect): boolean { return Math.abs(left.x - right.x) < (left.width + right.width) / 2 && Math.abs(left.y - right.y) < (left.height + right.height) / 2; }
function distance(left: Point, right: Point): number { return Math.hypot(left.x - right.x, left.y - right.y); }
function rectDistance(left: Rect, right: Rect): number { return Math.hypot(Math.max(Math.abs(left.x - right.x) - (left.width + right.width) / 2, 0), Math.max(Math.abs(left.y - right.y) - (left.height + right.height) / 2, 0)); }

function occupied(testCase: Case, positions: Record<string, Point>, current = presentation(testCase, positions)) {
  const bodies = testCase.nodes.map((node) => [node.id, rect(positions[node.id]!, ENTITY_ATTACHMENT_SHAPE.halfWidth * 2, ENTITY_ATTACHMENT_SHAPE.halfHeight * 2)] as const);
  const nodeLabels = [...current.nodeLabels.entries()].map(([id, label]) => [id, label] as const);
  const relationLabels = [...current.relationLabels.entries()].map(([id, label]) => [id, label] as const);
  let nodeBodyNodeBody = 0; let nodeLabelNodeBody = 0; let relationLabelNodeBody = 0; let nodeLabelNodeLabel = 0; let nodeLabelRelationLabel = 0; let relationLabelRelationLabel = 0;
  for (let left = 0; left < bodies.length; left += 1) for (let right = left + 1; right < bodies.length; right += 1) if (overlaps(bodies[left]![1], bodies[right]![1])) nodeBodyNodeBody += 1;
  for (const [nodeId, label] of nodeLabels) for (const [bodyId, body] of bodies) if (nodeId !== bodyId && overlaps(label, body)) nodeLabelNodeBody += 1;
  for (const [, label] of relationLabels) for (const [, body] of bodies) if (overlaps(label, body)) relationLabelNodeBody += 1;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) if (overlaps(nodeLabels[left]![1], nodeLabels[right]![1])) nodeLabelNodeLabel += 1;
  for (const [, nodeLabel] of nodeLabels) for (const [, relationLabel] of relationLabels) if (overlaps(nodeLabel, relationLabel)) nodeLabelRelationLabel += 1;
  for (let left = 0; left < relationLabels.length; left += 1) for (let right = left + 1; right < relationLabels.length; right += 1) if (overlaps(relationLabels[left]![1], relationLabels[right]![1])) relationLabelRelationLabel += 1;
  const totalOccupiedOverlaps = nodeBodyNodeBody + nodeLabelNodeBody + relationLabelNodeBody + nodeLabelNodeLabel + nodeLabelRelationLabel + relationLabelRelationLabel;
  return { nodeBodyNodeBody, nodeLabelNodeBody, relationLabelNodeBody, nodeLabelNodeLabel, nodeLabelRelationLabel, relationLabelRelationLabel, totalOccupiedOverlaps, hardFeasible: totalOccupiedOverlaps === 0 };
}

function metrics(testCase: Case, family: string, positions: Record<string, Point>, source: string) {
  const current = presentation(testCase, positions);
  const quality = deriveAutomaticLayoutQualityMetrics({ nodes: testCase.nodes, edges: testCase.edges, positions, presentation: current });
  const visualRisk = deriveAutomaticLayoutVisualRiskMetrics({ positions, presentation: current });
  const fit = fitGraphView(Object.values(positions), 800, 500);
  const nearest = testCase.nodes.map((node) => Math.min(...testCase.nodes.filter(({ id }) => id !== node.id).map((other) => distance(positions[node.id]!, positions[other.id]!))));
  return { family, source, positions, score: quality.score, structural: { nodeOverlap: quality.overlapPairs, crossings: quality.crossings, minimumSeparation: quality.minimumSeparation, extent: quality.extent, componentCount: components(testCase).length }, presentation: { labelRouteHits: quality.labelRouteHits, labelNear20: quality.labelNear20, labelOverlap: quality.labelOverlap, routeMedian: quality.routeMedian, routeMax: quality.routeMax, fitScale: fit.scale, visualLabelOverlap: visualRisk.totalLabelOverlapPairs, foreignRouteHits: visualRisk.foreignRouteRelationLabelHits, ownershipAmbiguity: visualRisk.ownershipAmbiguityCount }, occupied: occupied(testCase, positions, current), nearestMedian: nearest.slice().sort((a, b) => a - b)[Math.floor(nearest.length / 2)] ?? 0 };
}

function cleanChildEnvironment(extra: Record<string, string> = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (key.startsWith("E2R_")) delete environment[key];
  return { ...environment, E2R_PRESENTATION_GEOMETRY_CACHE: "1", E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1", E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once", ...extra };
}

function structuralCandidate(testCase: Case, arm: "post" | "frontier-12" | "joint") {
  let fixturePath = testCase.source;
  let temporaryPath: string | null = null;
  if (fixturePath.startsWith("synthetic:")) {
    temporaryPath = path.join(outputDirectory, `.tmp-${testCase.id}.json`);
    fs.mkdirSync(outputDirectory, { recursive: true }); fs.writeFileSync(temporaryPath, JSON.stringify(testCase.dataset)); fixturePath = temporaryPath;
  } else fixturePath = path.resolve(root, fixturePath);
  const extra = arm === "post" ? {} : { E2R_GLOBAL_PLACEMENT_ABLATION: arm === "frontier-12" ? "frontier-12" : "structural-native-v3", E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off" };
  const child = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixturePath], { cwd: root, encoding: "utf8", env: cleanChildEnvironment(extra), maxBuffer: 100 * 1024 * 1024 });
  if (temporaryPath) fs.rmSync(temporaryPath, { force: true });
  if (child.status !== 0) throw new Error(`${testCase.id}/${arm}: ${child.stderr}`);
  let raw = child.stdout; if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const result = JSON.parse(raw) as { selected: { family: string; positions: Record<string, Point> }; selectedPositionFingerprint: string; elapsedMs: number; profile: { fullPresentationEvaluations: number } };
  return { family: result.selected.family, positions: result.selected.positions, replay: "current-source-reconstruction", fingerprint: result.selectedPositionFingerprint, elapsedMs: result.elapsedMs, fullPresentationEvaluations: result.profile.fullPresentationEvaluations };
}

function currentPool(testCase: Case) {
  return Array.from({ length: testCase.count }, (_, index) => { const base = solveAutoLayout(testCase.input, { iterations: 3 + (index % 3) }); return { family: `current-pool-${index + 1}`, positions: Object.fromEntries(testCase.nodes.map((node, nodeIndex) => [node.id, { x: base[node.id]!.x + ((index * 7 + nodeIndex * 3) % 9) - 4, y: base[node.id]!.y + ((index + nodeIndex) % 5) - 2 }])) }; });
}

function labelCapacity(testCase: Case, source: Record<string, Point>, intensity: number) {
  const current = presentation(testCase, source); const transformed = new Map<string, Point>(); const componentMetrics: Array<{ ids: string[]; nodeWidth: number; nodeHeight: number; relationWidth: number; degreeDemand: number }> = [];
  for (const ids of components(testCase)) {
    const points = ids.map((id) => source[id]!); const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    const nodeLabels = ids.map((id) => current.nodeLabels.get(id)!).filter(Boolean); const relations = testCase.edges.filter((edge) => ids.includes(edge.sourceId) && ids.includes(edge.targetId)); const relationLabels = relations.map((edge) => current.relationLabels.get(edge.id)!).filter(Boolean);
    const nodeWidth = Math.max(...nodeLabels.map(({ width }) => width), 48); const nodeHeight = Math.max(...nodeLabels.map(({ height }) => height), 24); const relationWidth = relationLabels.reduce((sum, label) => sum + label.width, 0) / Math.max(1, relationLabels.length); const degreeDemand = relations.length / Math.max(1, ids.length); const xDemand = Math.min(1.15, nodeWidth / 180 + relationWidth / 360 + degreeDemand / 12); const yDemand = Math.min(0.75, nodeHeight / 90 + degreeDemand / 18); const scaleX = 1 + intensity * xDemand; const scaleY = 1 + intensity * yDemand;
    for (const id of ids) { const point = source[id]!; transformed.set(id, { x: center.x + (point.x - center.x) * scaleX, y: center.y + (point.y - center.y) * scaleY }); }
    componentMetrics.push({ ids, nodeWidth, nodeHeight, relationWidth, degreeDemand });
  }
  let cursor = 0; const packed: Record<string, Point> = {};
  for (const metric of componentMetrics) { const points = metric.ids.map((id) => transformed.get(id)!); const minX = Math.min(...points.map(({ x }) => x)); const maxX = Math.max(...points.map(({ x }) => x)); const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length; const gap = 48 + metric.nodeWidth * 0.5 + metric.relationWidth * 0.25; for (const id of metric.ids) { const point = transformed.get(id)!; packed[id] = { x: cursor + gap + point.x - minX, y: 250 + point.y - centerY }; } cursor += gap + (maxX - minX); }
  return packed;
}

function infiniteCanvas(testCase: Case, source: Record<string, Point>) {
  const current = presentation(testCase, source); const groups = components(testCase).flatMap((component) => { const count = component.length >= 12 ? 3 : component.length >= 8 ? 2 : 1; if (count === 1) return [component]; const seeds = [component.slice().sort()[0]!]; while (seeds.length < count) seeds.push(component.filter((id) => !seeds.includes(id)).sort((left, right) => Math.min(...seeds.map((seed) => distance(source[right]!, source[seed]!))) - Math.min(...seeds.map((seed) => distance(source[left]!, source[seed]!))) || left.localeCompare(right))[0]!); const output = seeds.map(() => [] as string[]); for (const id of component.slice().sort()) { const target = seeds.reduce((best, seed, index) => distance(source[id]!, source[seed]!) < distance(source[id]!, source[seeds[best]!]!) ? index : best, 0); output[target]!.push(id); } return output.filter((group) => group.length); });
  const groupsWithPoints = groups.map((ids) => { const points = ids.map((id) => source[id]!); const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }; const relations = testCase.edges.filter((edge) => ids.includes(edge.sourceId) && ids.includes(edge.targetId)); const cross = testCase.edges.filter((edge) => ids.includes(edge.sourceId) !== ids.includes(edge.targetId)); const labels = ids.map((id) => current.nodeLabels.get(id)!).filter(Boolean); const relationLabels = relations.map((edge) => current.relationLabels.get(edge.id)!).filter(Boolean); const maxWidth = Math.max(48, ...labels.map(({ width }) => width)); const maxHeight = Math.max(24, ...labels.map(({ height }) => height)); const relationWidth = relationLabels.reduce((sum, label) => sum + label.width, 0) / Math.max(1, relationLabels.length); const demand = relations.length / Math.max(1, ids.length); const corridor = relationWidth / 220 + cross.length / Math.max(1, ids.length); const scaleX = 1 + 0.94 * Math.min(1.15, maxWidth / 150 + demand / 10 + corridor * 0.65); const scaleY = 1 + 0.94 * Math.min(0.9, maxHeight / 90 + demand / 18); const transformed = Object.fromEntries(ids.map((id) => { const point = source[id]!; return [id, { x: center.x + (point.x - center.x) * scaleX, y: center.y + (point.y - center.y) * scaleY }]; })); return { ids, transformed, width: Math.max(...Object.values(transformed).map(({ x }) => x)) - Math.min(...Object.values(transformed).map(({ x }) => x)), height: Math.max(...Object.values(transformed).map(({ y }) => y)) - Math.min(...Object.values(transformed).map(({ y }) => y)) }; });
  const columns = groupsWithPoints.length >= 3 ? 2 : 1; const packed: Record<string, Point> = {}; for (let index = 0; index < groupsWithPoints.length; index += 1) { const group = groupsWithPoints[index]!; const column = index % columns; const row = Math.floor(index / columns); const minX = Math.min(...Object.values(group.transformed).map(({ x }) => x)); const minY = Math.min(...Object.values(group.transformed).map(({ y }) => y)); for (const id of group.ids) { const point = group.transformed[id]!; packed[id] = { x: column * (group.width + 110) + point.x - minX, y: row * (group.height + 92) + point.y - minY }; } }
  return packed;
}

function occupiedFeedback(testCase: Case, source: Record<string, Point>, sweeps: number) {
  const positions = Object.fromEntries(Object.entries(source).map(([id, point]) => [id, { ...point }]));
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const current = presentation(testCase, positions); const bodies = new Map(testCase.nodes.map((node) => [node.id, rect(positions[node.id]!, 64, 64)])); const labels = new Map([...current.nodeLabels.entries()].map(([id, label]) => [id, label])); const relationLabels = new Map([...current.relationLabels.entries()].map(([id, label]) => [id, label])); const forces = new Map<string, Point>();
    const add = (owners: string[], vector: Point) => { for (const id of [...new Set(owners)].sort()) forces.set(id, { x: (forces.get(id)?.x ?? 0) + vector.x / Math.max(1, owners.length), y: (forces.get(id)?.y ?? 0) + vector.y / Math.max(1, owners.length) }); };
    const push = (left: Rect, right: Rect, leftOwners: string[], rightOwners: string[]) => { if (!overlaps(left, right)) return; const dx = right.x - left.x; const dy = right.y - left.y; const length = Math.hypot(dx, dy) || 1; const overlapX = (left.width + right.width) / 2 - Math.abs(dx); const overlapY = (left.height + right.height) / 2 - Math.abs(dy); const depth = Math.max(1, Math.min(overlapX, overlapY) + 1); const vector = { x: dx / length * depth, y: dy / length * depth }; add(leftOwners, { x: -vector.x, y: -vector.y }); add(rightOwners, vector); };
    const bodyEntries = [...bodies.entries()]; for (let left = 0; left < bodyEntries.length; left += 1) for (let right = left + 1; right < bodyEntries.length; right += 1) push(bodyEntries[left]![1], bodyEntries[right]![1], [bodyEntries[left]![0]], [bodyEntries[right]![0]]);
    const nodeEntries = [...labels.entries()]; for (const [nodeId, label] of nodeEntries) for (const [bodyId, body] of bodyEntries) if (nodeId !== bodyId) push(label, body, [nodeId], [bodyId]);
    const owners = new Map(testCase.edges.map((edge) => [edge.id, [edge.sourceId, edge.targetId]])); for (const [relationId, label] of relationLabels) for (const [bodyId, body] of bodyEntries) push(label, body, owners.get(relationId) ?? [], [bodyId]);
    for (let left = 0; left < nodeEntries.length; left += 1) for (let right = left + 1; right < nodeEntries.length; right += 1) push(nodeEntries[left]![1], nodeEntries[right]![1], [nodeEntries[left]![0]], [nodeEntries[right]![0]]);
    for (const [nodeId, nodeLabel] of nodeEntries) for (const [relationId, relationLabel] of relationLabels) push(nodeLabel, relationLabel, [nodeId], owners.get(relationId) ?? []);
    const relationEntries = [...relationLabels.entries()]; for (let left = 0; left < relationEntries.length; left += 1) for (let right = left + 1; right < relationEntries.length; right += 1) push(relationEntries[left]![1], relationEntries[right]![1], owners.get(relationEntries[left]![0]) ?? [], owners.get(relationEntries[right]![0]) ?? []);
    if (!forces.size) break; for (const [id, force] of forces) positions[id] = { x: positions[id]!.x + force.x * 0.8, y: positions[id]!.y + force.y * 0.8 };
  }
  return positions;
}

function digest(testCase: Case) { return createHash("sha256").update(JSON.stringify({ entities: testCase.dataset.entities.map(({ id, name, description }) => ({ id, name, description })), relations: testCase.dataset.relations.map(({ id, sourceId, targetId, name }) => ({ id, sourceId, targetId, name })) })).digest("hex").slice(0, 16); }

const cases = fixtureDefinitions.map(([id, source]) => makeCase(id, source));
const rows = cases.map((testCase) => {
  const pool = currentPool(testCase).map(({ family, positions }) => metrics(testCase, family, positions, "current-source-generation"));
  const currentHQ = pool.slice().sort((left, right) => left.score - right.score || left.nearestMedian - right.nearestMedian)[0]!;
  const labelProbes = [0.55, 0.8, 1].map((intensity) => metrics(testCase, `label-capacity-${intensity}`, labelCapacity(testCase, currentHQ.positions, intensity), "current-source-reconstruction"));
  const label = labelProbes.slice().sort((left, right) => left.presentation.visualLabelOverlap - right.presentation.visualLabelOverlap || left.presentation.ownershipAmbiguity - right.presentation.ownershipAmbiguity || left.presentation.foreignRouteHits - right.presentation.foreignRouteHits)[0]!;
  const infinite = metrics(testCase, "infinite-canvas-local-density-corridor", infiniteCanvas(testCase, currentHQ.positions), "current-source-reconstruction");
  const occupiedCandidates = [2, 4, 8].map((sweeps) => metrics(testCase, `occupied-geometry-${sweeps}-sweeps`, occupiedFeedback(testCase, infinite.positions, sweeps), "current-source-reconstruction"));
  const occupiedSelected = occupiedCandidates.slice().sort((left, right) => left.occupied.totalOccupiedOverlaps - right.occupied.totalOccupiedOverlaps || left.presentation.visualLabelOverlap - right.presentation.visualLabelOverlap || left.presentation.foreignRouteHits - right.presentation.foreignRouteHits)[0]!;
  const structural = ["post", "frontier-12", "joint"].map((arm) => { const result = structuralCandidate(testCase, arm as "post" | "frontier-12" | "joint"); return { ...metrics(testCase, result.family, result.positions, result.replay), replay: result.replay, fingerprint: result.fingerprint, elapsedMs: result.elapsedMs, fullPresentationEvaluations: result.fullPresentationEvaluations }; });
  const fast = metrics(testCase, "fast-initial-placement", settleInitialPlacement(testCase.input), "current-source-generation");
  const auto = metrics(testCase, "current-old-auto-layout-12", solveAutoLayout(testCase.input, { iterations: 12 }), "current-product-control");
  return { fixture: testCase.id, source: testCase.source, topologyDigest: digest(testCase), graph: { nodes: testCase.nodes.length, relations: testCase.edges.length, components: components(testCase).length, selfLoops: testCase.edges.filter((edge) => edge.sourceId === edge.targetId).length, parallelGroups: [...new Set(testCase.edges.filter((edge) => edge.parallelCount > 1).map((edge) => `${edge.sourceId}|${edge.targetId}`))].length }, candidates: { fast, auto, post: structural.find((candidate) => candidate.family.startsWith("post-structural")) ?? structural[0], structural, labelCapacity: label, infiniteCanvas: infinite, occupiedGeometry: occupiedSelected }, probes: { currentPoolCount: pool.length, labelCapacity: labelProbes, occupiedGeometry: occupiedCandidates } };
});

const artifact = { contract: "LIAISONSCAPE-COMMON-FIXTURE-CROSS-LINEAGE-COMPARISON-1", diagnosticOnly: true, fixtureIdentity: "same Dataset topology, Entity/Relation IDs, labels, and current Product presentation evaluator per row", candidateFamilies: ["fast-initial-placement", "current-old-auto-layout-12", "post-structural-constrained-relaxation", "frontier-12", "joint-constrained", "explicit-label-capacity", "infinite-canvas-local-density", "occupied-geometry-feasibility-first"], structuralReplay: "historical lineages are represented by current-source reconstruction on the common fixture; historical artifact replay remains separately identified in the result document", productAuthoritiesChanged: false, productionMetricMutation: false, viewportFitHardConstraint: false, rows, classification: "COMMON-FIXTURE-MATERIALIZED / PENDING-INTERPRETATION", readiness: { humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" } };
fs.mkdirSync(outputDirectory, { recursive: true }); fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, topologyDigest: row.topologyDigest, graph: row.graph, structural: row.candidates.structural.map(({ family, structural: shape, presentation: view }) => ({ family, crossings: shape.crossings, overlap: shape.nodeOverlap, minSep: shape.minimumSeparation, extent: shape.extent, labels: view.labelRouteHits, near: view.labelNear20 })), capacity: [row.candidates.labelCapacity, row.candidates.infiniteCanvas, row.candidates.occupiedGeometry].map(({ family, structural: shape, presentation: view, occupied: space }) => ({ family, crossings: shape.crossings, overlap: shape.nodeOverlap, occupied: space.totalOccupiedOverlaps, labels: view.labelRouteHits, near: view.labelNear20, foreign: view.foreignRouteHits, extent: shape.extent })) })), null, 2));
