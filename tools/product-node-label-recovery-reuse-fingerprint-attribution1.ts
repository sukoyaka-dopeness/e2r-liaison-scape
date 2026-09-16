import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { createAutomaticPresentationProfiler, deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { placeNodeLabel, type LabelRect, type Point } from "../src/viewport.ts";
import { denseBrowserFixtures, type DenseFixture } from "../experimental/product-node-label-recovery-dense-browser-feasibility1/fixtures.ts";

type Snapshots = { node: Map<string, LabelRect>; relation: Map<string, LabelRect>; routes: Map<string, any> };
type StageTrace = { routes: string; relationLabels: string; nodeLabels: string; output: string; recovery: string };

function graphFor(fixture: DenseFixture) {
  const graph = buildEntityGraph(fixture.dataset as never);
  const labels = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name]));
  return { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? "" })) };
}
function provisionalLabels(graph: ReturnType<typeof graphFor>, positions: Record<string, Point>) {
  return graph.nodes.map((node) => placeNodeLabel(positions[node.id]!, node.label, node.description, [], graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), []));
}
function stable(value: unknown) { return JSON.stringify(value); }
function hash(value: string) { let h = 2166136261; for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
function outputSignature(p: BoundedAutomaticPresentation) { return hash(stable({ routes: p.routedEdges.map(({ id, samples, controlPoint }) => [id, samples, controlPoint]), relationLabels: [...p.relationLabels.entries()], nodeLabels: [...p.nodeLabels.entries()] })); }
function derive(fixture: DenseFixture, previous: Snapshots, shifted = false) {
  const graph = graphFor(fixture);
  const positions = shifted ? { ...fixture.positions, [fixture.dataset.entities[0]!.id]: { x: fixture.positions[fixture.dataset.entities[0]!.id]!.x + 68, y: fixture.positions[fixture.dataset.entities[0]!.id]!.y + 24 } } : fixture.positions;
  const routeTraces: string[] = [], relationTraces: string[] = [], nodeTraces: string[] = [], recoveryTraces: string[] = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisionalLabels(graph, positions),
    previousNodeLabelPlacements: previous.node, previousRelationLabelPlacements: previous.relation,
    previousAutomaticRoutes: previous.routes, manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(), feedbackEnabled: true,
    nodeLabelRecoveryMode: "product-candidate",
    routeTraceSink: (trace) => routeTraces.push(hash(stable([trace.pass, trace.edgeId, trace.routeLabelInputFingerprint, trace.selectedRouteFingerprint, trace.occupiedPathPrefixFingerprint]))), relationLabelTraceSink: (trace) => relationTraces.push(hash(stable([trace.pass, trace.relationId, trace.inputFingerprint, trace.selectedPlacementFingerprint, trace.occupiedRelationLabelPrefixFingerprint]))),
    nodeLabelTraceSink: (trace) => nodeTraces.push(hash(stable([trace.pass, trace.nodeId, trace.inputFingerprint, trace.selectedPlacementFingerprint, trace.routeSetFingerprint]))), nodeLabelRecoveryTraceSink: (trace) => recoveryTraces.push(hash(stable(trace))),
    presentationDependencySink: undefined, profiler: createAutomaticPresentationProfiler(),
  });
  const stage: StageTrace = {
    routes: hash(stable(routeTraces)), relationLabels: hash(stable(relationTraces)), nodeLabels: hash(stable(nodeTraces)),
    output: outputSignature(presentation), recovery: hash(stable(recoveryTraces)),
  };
  return { presentation, stage, snapshots: { node: new Map(presentation.nodeLabels), relation: new Map(presentation.relationLabels), routes: new Map(presentation.routedEdges.map((route) => [route.id, route])) } };
}
function empty(): Snapshots { return { node: new Map(), relation: new Map(), routes: new Map() }; }
function run(fixture: DenseFixture, mode: "node-only" | "product-snapshots") {
  const clean = derive(fixture, empty());
  let previous = mode === "node-only" ? { ...empty(), node: clean.snapshots.node } : clean.snapshots;
  const sequence: StageTrace[] = [];
  for (let i = 0; i < 6; i += 1) {
    const next = derive(fixture, previous, true);
    sequence.push(next.stage);
    previous = mode === "node-only" ? { ...previous, node: next.snapshots.node } : next.snapshots;
  }
  return { mode, cleanStage: clean.stage, sequence, distinct: Object.fromEntries((Object.keys(sequence[0]!) as Array<keyof StageTrace>).map((key) => [key, new Set(sequence.map((step) => step[key])).size])), finalOutput: sequence.at(-1)?.output };
}
const rows = denseBrowserFixtures().map((fixture) => ({ fixture: fixture.id, family: fixture.family, nodeOnly: run(fixture, "node-only"), productSnapshots: run(fixture, "product-snapshots") }));
const artifact = { contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-RECOVERY-REUSE-FINGERPRINT-ATTRIBUTION-v1", diagnosticOnly: true, generatedAt: new Date().toISOString(), sourceParity: { appStoresAndReuses: ["previousNodeLabelPlacements", "previousEdgeLabelPlacements", "previousAutomaticRoutes"], harnessPriorArm: ["previousNodeLabelPlacements"], currentArm: "all-three-snapshots" }, rows, disposition: { recoverySemantics: "unchanged", movementCoefficient: "distance * 4", productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", adaptiveCascade: "NOT ENTERED" } };
const outputPath = path.join(process.cwd(), "experimental", "product-node-label-recovery-reuse-fingerprint-attribution1.json");
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
