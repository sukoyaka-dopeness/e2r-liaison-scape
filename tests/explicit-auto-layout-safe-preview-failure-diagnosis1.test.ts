import assert from "node:assert/strict";
import test from "node:test";
import {
  captureExplicitAutoLayoutSnapshot,
  captureExplicitAutoLayoutSnapshotFromDataset,
  DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG,
  runExplicitAutoLayoutOperation,
} from "../src/explicit-auto-layout-operation.ts";

const graph = {
  nodes: [
    { id: "a", label: "Alpha", description: "", x: 0, y: 0 },
    { id: "b", label: "Beta", description: "", x: 180, y: 0 },
    { id: "c", label: "Gamma", description: "", x: 90, y: 150 },
  ],
  edges: [
    { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" },
    { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "BC" },
  ],
};

const positions = { a: { x: 0, y: 0 }, b: { x: 180, y: 0 }, c: { x: 90, y: 150 } };
const product = {
  edgeCurveOffsets: {},
  selfLoopOverrides: {},
  provisionalNodeLabels: [],
  previousNodeLabelPlacements: {},
  previousRelationLabelPlacements: {},
  manualNodeLabelOffsets: {},
  manualRelationLabelAnchors: {},
  previousAutomaticRoutes: {},
  feedbackEnabled: true,
};
const config = {
  ...DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG,
  frontier: { limit: 2, featureMode: "global" as const, circularMaximum: 4, gridSeeds: 1, gridRounds: 3 },
};

function snapshotInput(overrides: Record<string, unknown> = {}) {
  return {
    operationId: "safe-preview-diagnosis",
    generation: 1,
    datasetIdentity: "diagnosis-dataset",
    datasetRevision: 1,
    graphFingerprint: "diagnosis-graph",
    graph,
    positions,
    storedCoordinateFingerprint: null,
    adoptedCoordinateFingerprint: null,
    coordinatesDirty: false,
    coordinateOwnership: { a: "derived", b: "derived", c: "derived" },
    activePins: {},
    product,
    locale: "en",
    algorithmVersion: "safe-preview-diagnosis1",
    budgetPolicy: { mode: "diagnostic" },
    ...overrides,
  };
}

function runCaptured(overrides: Record<string, unknown> = {}) {
  const captured = captureExplicitAutoLayoutSnapshot(snapshotInput(overrides));
  assert.ok(captured.snapshot, captured.failure?.message);
  return runExplicitAutoLayoutOperation(captured.snapshot, config);
}

test("fresh and manually moved ordinary unpinned inputs reach Preview", () => {
  const fresh = runCaptured();
  const manual = runCaptured({
    positions: { a: { x: 77, y: 88 }, b: { x: 180, y: 0 }, c: { x: 90, y: 150 } },
    coordinatesDirty: true,
    coordinateOwnership: { a: "adopted", b: "derived", c: "derived" },
  });
  assert.equal(fresh.status, "completed");
  assert.equal(manual.status, "completed");
});

test("valid working Pin reaches Preview while an invalid saved Pin fails at capture", () => {
  const valid = runCaptured({ activePins: { a: { x: 77, y: 88, source: "staged" } } });
  assert.equal(valid.status, "completed");

  const invalidDataset = {
    version: "0.1.0",
    entities: [{ id: "a" }, { id: "b" }, { id: "c" }],
    events: [],
    relations: [],
    extensions: {
      "draft.github.sukoyaka-dopeness.liaisonscape-layout": {
        specVersion: "0.1.0",
        entities: { a: { pinned: true, spaceId: "liaisonscape-graph" } },
      },
    },
  };
  const captured = captureExplicitAutoLayoutSnapshotFromDataset({
    ...snapshotInput(),
    dataset: invalidDataset,
    currentPositions: positions,
  });
  assert.equal(captured.snapshot, null);
  assert.equal(captured.failure.code, "PIN_RESOLUTION_FAILED");
  assert.equal(captured.pinDiagnostics[0]?.code, "PIN_SPACE_UNSUPPORTED");
});
