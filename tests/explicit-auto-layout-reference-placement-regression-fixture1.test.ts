import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildEntityGraph, getStoredCoordinates, loadDataset, type Dataset } from "../src/dataset.ts";
import { DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG, captureExplicitAutoLayoutSnapshot, runExplicitAutoLayoutOperation } from "../src/explicit-auto-layout-operation.ts";

const fixtureDir = path.join(process.cwd(), "experimental", "explicit-auto-layout-reference-placement-regression-fixture1", "fixtures");
const reference = JSON.parse(fs.readFileSync(path.join(fixtureDir, "reference-layout-regression.reference.en.e2r.json"), "utf8")) as Dataset;
const coordinateLess = JSON.parse(fs.readFileSync(path.join(fixtureDir, "reference-layout-regression.no-coordinates.en.e2r.json"), "utf8")) as Dataset;

function graphInput(dataset: Dataset, positions: Record<string, { x: number; y: number }>) {
  const graph = buildEntityGraph(dataset);
  return {
    operationId: "reference-layout-regression1",
    generation: 1,
    datasetIdentity: "diagnostic-reference-layout-regression1",
    datasetRevision: 1,
    graphFingerprint: "reference-layout-regression1-graph",
    graph: {
      nodes: graph.nodes.map((node) => ({ ...node, x: positions[node.id]?.x ?? node.x, y: positions[node.id]?.y ?? node.y })),
      edges: graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" })),
    },
    positions,
    storedCoordinateFingerprint: Object.keys(positions).length > 0 ? "reference-coordinate-set-1" : null,
    adoptedCoordinateFingerprint: null,
    coordinatesDirty: false,
    coordinateOwnership: Object.fromEntries(Object.keys(positions).map((id) => [id, "stored" as const])),
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
      parallelBundleMode: "bundle" as const,
    },
    locale: "en",
    algorithmVersion: "frontier-12-explicit-reference-regression1",
    budgetPolicy: { maxCandidates: 12 },
  };
}

test("reference regression fixture is valid, paired, and deterministic", () => {
  assert.equal(loadDataset(JSON.stringify(reference)).dataset !== null, true);
  assert.equal(loadDataset(JSON.stringify(coordinateLess)).dataset !== null, true);
  const referenceCoordinates = getStoredCoordinates(reference);
  assert.equal(Object.keys(referenceCoordinates).length, reference.entities.length);
  assert.equal(Object.keys(getStoredCoordinates(coordinateLess)).length, 0);
  assert.deepEqual(reference.entities.map(({ id }) => id), coordinateLess.entities.map(({ id }) => id));
  assert.deepEqual(reference.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })), coordinateLess.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })));
});

test("reference fixture reaches the real Explicit Auto Layout Preview calculation without mutating input", () => {
  const positions = getStoredCoordinates(reference);
  const input = graphInput(reference, positions);
  const before = JSON.stringify(input);
  const captured = captureExplicitAutoLayoutSnapshot(input);
  assert.ok(captured.snapshot, captured.failure?.message);
  const result = runExplicitAutoLayoutOperation(captured.snapshot!, DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.preview.structuralValidation.complete, true);
  assert.equal(result.preview.structuralValidation.finite, true);
  assert.equal(Object.keys(result.preview.positions).length, reference.entities.length);
  assert.equal(JSON.stringify(input), before);
});
