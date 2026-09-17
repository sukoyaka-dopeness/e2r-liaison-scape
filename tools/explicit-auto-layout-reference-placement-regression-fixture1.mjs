import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph, getStoredCoordinates, loadDataset, } from "../src/dataset.ts";
import { captureExplicitAutoLayoutSnapshot, DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG, runExplicitAutoLayoutOperation } from "../src/explicit-auto-layout-operation.ts";
import { deriveAutomaticLayoutQualityMetrics } from "../src/automatic-layout-quality.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { settleInitialPlacement } from "../src/auto-layout.ts";
import { placeNodeLabel } from "../src/viewport.ts";

const fixtureRoot = path.resolve(process.cwd(), "experimental", "explicit-auto-layout-reference-placement-regression-fixture1", "fixtures");
const reference = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "reference-layout-regression.reference.en.e2r.json"), "utf8"));
const coordinateLess = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "reference-layout-regression.no-coordinates.en.e2r.json"), "utf8"));

function graphFor(dataset, positions) {
  const base = buildEntityGraph(dataset);
  return {
    nodes: base.nodes.map((node) => ({ ...node, x: positions[node.id]?.x ?? node.x, y: positions[node.id]?.y ?? node.y })),
    edges: base.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" })),
  };
}

function presentationMetrics(dataset, positions) {
  const graph = graphFor(dataset, positions);
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    { x: node.x, y: node.y },
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => ({ x: other.x, y: other.y })),
    [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph,
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    previousAutomaticRoutes: new Map(),
    feedbackEnabled: true,
    parallelBundleMode: "bundle",
  });
  return deriveAutomaticLayoutQualityMetrics({ nodes: graph.nodes, edges: graph.edges, positions, presentation });
}

function explicitInput(dataset, positions) {
  const graph = graphFor(dataset, positions);
  return {
    operationId: "reference-layout-regression1",
    generation: 1,
    datasetIdentity: "diagnostic-reference-layout-regression1",
    datasetRevision: 1,
    graphFingerprint: "reference-layout-regression1-graph",
    graph,
    positions,
    storedCoordinateFingerprint: "reference-coordinate-set-1",
    adoptedCoordinateFingerprint: null,
    coordinatesDirty: false,
    coordinateOwnership: Object.fromEntries(Object.keys(positions).map((id) => [id, "stored"])),
    activePins: {},
    product: {
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      provisionalNodeLabels: [],
      previousNodeLabelPlacements: {},
      previousRelationLabelPlacements: {},
      manualNodeLabelOffsets: {},
      manualRelationLabelAnchors: {},
      previousAutomaticRoutes: {},
      feedbackEnabled: true,
      parallelBundleMode: "bundle",
    },
    locale: "en",
    algorithmVersion: "frontier-12-explicit-reference-regression1",
    budgetPolicy: { maxCandidates: 12 },
  };
}

function positionFingerprint(positions) {
  return Object.keys(positions).sort().map((id) => `${id}:${positions[id].x},${positions[id].y}`).join("|");
}

const referencePositions = getStoredCoordinates(reference);
const initialInput = {
  entities: coordinateLess.entities.map(({ id }) => ({ id })),
  relations: coordinateLess.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
};
const initialPositions = settleInitialPlacement(initialInput);
const captured = captureExplicitAutoLayoutSnapshot(explicitInput(reference, referencePositions));
if (!captured.snapshot) throw new Error(captured.failure.message);
const operation = runExplicitAutoLayoutOperation(captured.snapshot, DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG);
if (operation.status !== "completed") throw new Error(operation.failure.message);

const result = {
  checkpoint: "E2R-LIAISONSCAPE-EXPLICIT-AUTO-LAYOUT-REFERENCE-PLACEMENT-REGRESSION-FIXTURE1",
  source: {
    fixturePair: "experimental/explicit-auto-layout-reference-placement-regression-fixture1/fixtures/reference-layout-regression.{reference,no-coordinates}.en.e2r.json",
    explicitEntryPoint: "src/explicit-auto-layout-operation.ts:runExplicitAutoLayoutOperation",
    initialEntryPoint: "src/auto-layout.ts:settleInitialPlacement",
    productPresentationEntryPoint: "src/graph-presentation.ts:deriveBoundedAutomaticPresentation",
    command: "node --experimental-strip-types tools/explicit-auto-layout-reference-placement-regression-fixture1.mjs",
  },
  topology: { entities: reference.entities.length, relations: reference.relations.length, coordinateLessEntityCount: coordinateLess.entities.length, coordinateLessRelationCount: coordinateLess.relations.length },
  reference: { coordinateCount: Object.keys(referencePositions).length, positions: referencePositions, fingerprint: positionFingerprint(referencePositions), metrics: presentationMetrics(reference, referencePositions) },
  coordinateLessInitial: { positions: initialPositions, fingerprint: positionFingerprint(initialPositions), metrics: presentationMetrics(coordinateLess, initialPositions) },
  explicitPreview: { selectedFamily: operation.preview.selectedFamily, candidateFingerprint: operation.preview.candidateFingerprint, positions: operation.preview.positions, metrics: operation.preview.presentationEvidence.metrics, eligible: operation.preview.presentationEvidence.eligible, warnings: operation.preview.warnings, structuralValidation: operation.preview.structuralValidation },
  deterministicReplay: { snapshotIdentity: captured.snapshot.snapshotIdentity, selectedFamily: operation.preview.selectedFamily, candidateFingerprint: operation.preview.candidateFingerprint },
};
console.log(JSON.stringify(result, null, 2));
