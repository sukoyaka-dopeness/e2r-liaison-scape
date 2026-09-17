import assert from "node:assert/strict";
import test from "node:test";
import {
  captureExplicitAutoLayoutSnapshot,
  captureExplicitAutoLayoutSnapshotFromDataset,
  DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG,
  ExplicitAutoLayoutOperationAdapter,
  explicitAutoLayoutProvenance,
  runExplicitAutoLayoutOperation,
} from "../src/explicit-auto-layout-operation.ts";
import { ExplicitAutoLayoutBrowserAdapter, type ExplicitAutoLayoutWorker } from "../src/explicit-auto-layout-browser-adapter.ts";
import type { ExplicitAutoLayoutWorkerJob, ExplicitAutoLayoutWorkerMessage } from "../src/explicit-auto-layout-worker.ts";
import fs from "node:fs";
import path from "node:path";

function input(overrides: Record<string, unknown> = {}) {
  return {
    operationId: "explicit-1",
    generation: 1,
    datasetIdentity: "dataset-1",
    datasetRevision: 3,
    graphFingerprint: "graph-1",
    graph: {
      nodes: [
        { id: "a", label: "Alpha", description: "", x: 0, y: 0 },
        { id: "b", label: "Beta", description: "", x: 180, y: 0 },
        { id: "c", label: "Gamma", description: "", x: 90, y: 150 },
      ],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "AB" },
        { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "BC" },
      ],
    },
    positions: { a: { x: 0, y: 0 }, b: { x: 180, y: 0 }, c: { x: 90, y: 150 } },
    storedCoordinateFingerprint: "stored-1",
    adoptedCoordinateFingerprint: null,
    coordinatesDirty: false,
    coordinateOwnership: { a: "stored", b: "stored", c: "stored" },
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
    algorithmVersion: "frontier-12-explicit-operation1",
    budgetPolicy: { maxCandidates: 2 },
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const result = captureExplicitAutoLayoutSnapshot(input(overrides));
  assert.ok(result.snapshot, result.failure?.message);
  return result.snapshot;
}

const config = { ...DEFAULT_EXPLICIT_AUTO_LAYOUT_CONFIG, frontier: { limit: 2, featureMode: "global" as const, circularMaximum: 4, gridSeeds: 1, gridRounds: 3 } };

class FakeExplicitWorker implements ExplicitAutoLayoutWorker {
  onmessage: ((event: MessageEvent<ExplicitAutoLayoutWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  private readonly pending: boolean;
  constructor(pending = false) { this.pending = pending; }
  postMessage(job: ExplicitAutoLayoutWorkerJob): void {
    if (this.pending) return;
    this.onmessage?.({ data: {
      kind: "explicit-auto-layout-result",
      operationId: job.snapshot.operationId,
      generation: job.snapshot.generation,
      snapshotIdentity: job.snapshot.snapshotIdentity,
      result: runExplicitAutoLayoutOperation(job.snapshot, config),
    } } as MessageEvent<ExplicitAutoLayoutWorkerMessage>);
  }
  terminate(): void { this.terminated = true; }
}

test("captures an immutable serializable Explicit Auto Layout snapshot", () => {
  const captured = snapshot();
  assert.equal(JSON.parse(JSON.stringify(captured)).snapshotIdentity, captured.snapshotIdentity);
  assert.throws(() => { (captured.positions.a as { x: number }).x = 99; }, TypeError);
  assert.throws(() => { (captured.product.edgeCurveOffsets as Record<string, number>).x = 1; }, TypeError);
  assert.equal(captured.activePins.a, undefined);
});

test("browser adapter returns only a complete current preview and terminates its Worker", async () => {
  const worker = new FakeExplicitWorker();
  const result = await new ExplicitAutoLayoutBrowserAdapter(() => worker).start(snapshot());
  assert.equal(result.status, "completed");
  assert.equal(worker.terminated, true);
});

test("browser adapter Cancel terminates work and preserves the no-adoption boundary", async () => {
  const worker = new FakeExplicitWorker(true);
  const adapter = new ExplicitAutoLayoutBrowserAdapter(() => worker);
  const pending = adapter.start(snapshot());
  adapter.cancel("user-cancelled");
  assert.equal((await pending).status, "cancelled");
  assert.equal(worker.terminated, true);
});

test("normal App Auto Layout uses snapshot, Worker, Preview, Accept and Reject instead of direct solve", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  assert.doesNotMatch(app, /import \{ solveAutoLayout \}/);
  assert.match(app, /captureExplicitAutoLayoutSnapshotFromDataset/);
  assert.match(app, /ExplicitAutoLayoutBrowserAdapter/);
  assert.match(app, /acceptExplicitAutoLayoutPreview/);
  assert.match(app, /rejectExplicitAutoLayoutPreview/);
  assert.match(app, /manuallyMovedEntityIdsRef/);
  assert.match(app, /className="explicit-auto-layout-surface"/);
  assert.match(app, /explicitAutoLayoutReview/);
  assert.match(app, /useAutoLayout/);
  assert.match(app, /returnToPreviousLayout/);
  assert.doesNotMatch(app, /explicit-auto-layout-preview/);
});

test("runs Product-faithful selection from the captured manual and previous presentation inputs", () => {
  const captured = snapshot({
    product: {
      ...input().product,
      provisionalNodeLabels: [],
      manualNodeLabelOffsets: { a: { x: 30, y: -20 } },
      previousNodeLabelPlacements: { a: { x: 30, y: -20, width: 56, height: 24, directionX: 1, directionY: -1 } },
      previousRelationLabelPlacements: {},
      previousAutomaticRoutes: {},
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      manualRelationLabelAnchors: {},
      feedbackEnabled: true,
      parallelBundleMode: "bundle",
    },
  });
  const result = runExplicitAutoLayoutOperation(captured, config);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.preview.structuralValidation.complete, true);
  assert.equal(result.preview.structuralValidation.finite, true);
  assert.equal(result.preview.structuralValidation.productEvaluationComplete, true);
  assert.equal(result.preview.catastrophicPolicy, "structurally-valid-preview-admissible");
  assert.equal(result.preview.operationId, "explicit-1");
  assert.equal(result.preview.snapshotIdentity, captured.snapshotIdentity);
  assert.equal(result.proposals.length, result.candidateSet.representatives.length);
  const provenance = explicitAutoLayoutProvenance(captured, result);
  assert.equal(provenance.inputFingerprint, captured.snapshotIdentity);
  assert.equal(provenance.candidateFingerprint, result.preview.candidateFingerprint);
});

test("generates fixed-anchor candidates and preserves saved Pins exactly", () => {
  const captured = snapshot({ activePins: { a: { x: 0, y: 0, source: "saved" } } });
  const result = runExplicitAutoLayoutOperation(captured, config);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.preview.structuralValidation.pinsPreserved, true);
  assert.deepEqual(result.preview.positions.a, { x: 0, y: 0 });
  assert.equal(result.preview.selectedFamily.startsWith("anchor-aware-relaxation-"), true);
});

test("final canonicalization preserves a manually moved Pin at its exact working anchor", () => {
  const movedAnchor = { x: 77.375, y: 88.625, source: "staged" as const };
  const captured = snapshot({
    positions: { ...input().positions, a: { x: movedAnchor.x, y: movedAnchor.y } },
    activePins: { a: movedAnchor },
  });
  const result = runExplicitAutoLayoutOperation(captured, config);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.deepEqual(result.preview.positions.a, { x: movedAnchor.x, y: movedAnchor.y });
  assert.equal(result.preview.structuralValidation.pinsPreserved, true);
});

test("move-then-Pin and Pin-then-move both use the exact current working position", () => {
  const moved = { ...input().positions, a: { x: 77.375, y: 88.625 } };
  const baseDataset = {
    version: "1.0",
    entities: [{ id: "a" }, { id: "b" }, { id: "c" }],
    events: [],
    relations: [],
  };
  const moveThenPin = captureExplicitAutoLayoutSnapshotFromDataset({
    ...input(),
    positions: moved,
    dataset: baseDataset,
    currentPositions: moved,
    stagedPins: { a: { spaceId: "liaisonscape-graph" } },
  });
  assert.ok(moveThenPin.snapshot, moveThenPin.failure?.message);
  const first = runExplicitAutoLayoutOperation(moveThenPin.snapshot, config);
  assert.equal(first.status, "completed");
  if (first.status !== "completed") return;
  assert.deepEqual(first.preview.positions.a, moved.a);

  const pinThenMoveDataset = {
    ...baseDataset,
    entities: baseDataset.entities.map((entity) => entity.id === "a" ? {
      ...entity,
      extensions: {
        "experimental.github.sukoyaka-dopeness.coordinate": {
          coordinates: [{ spaceId: "liaisonscape-graph", values: { x: 0, y: 0 } }],
        },
      },
    } : entity),
    extensions: {
      "experimental.github.sukoyaka-dopeness.coordinate": {
        formatVersion: "0.1.0",
        spaces: [{ id: "liaisonscape-graph", kind: "cartesian-2d", components: {
          x: { unit: "liaisonscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "liaisonscape-user-unit", positiveDirection: "display-down" },
        } }],
      },
      "draft.github.sukoyaka-dopeness.liaisonscape-layout": {
        specVersion: "0.1.0",
        entities: { a: { pinned: true, spaceId: "liaisonscape-graph" } },
      },
    },
  };
  const pinThenMove = captureExplicitAutoLayoutSnapshotFromDataset({
    ...input(),
    positions: moved,
    dataset: pinThenMoveDataset,
    currentPositions: moved,
    manuallyMovedEntityIds: ["a"],
  });
  assert.ok(pinThenMove.snapshot, pinThenMove.failure?.message);
  assert.deepEqual(pinThenMove.snapshot.activePins.a, { x: moved.a.x, y: moved.a.y, source: "staged" });
  const second = runExplicitAutoLayoutOperation(pinThenMove.snapshot, config);
  assert.equal(second.status, "completed");
  if (second.status !== "completed") return;
  assert.deepEqual(second.preview.positions.a, moved.a);
});

test("all-pinned operations return the unchanged finite anchor map", () => {
  const captured = snapshot({ activePins: {
    a: { x: 0, y: 0, source: "saved" },
    b: { x: 180, y: 0, source: "staged" },
    c: { x: 90, y: 150, source: "saved" },
  } });
  const result = runExplicitAutoLayoutOperation(captured, config);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.deepEqual(result.preview.positions, captured.positions);
  assert.equal(result.preview.selectedFamily.startsWith("pinned-fixed-"), true);
});

test("resolves saved and staged Pins from Dataset/working state without writing the Dataset", () => {
  const dataset = {
    version: "0.1.0",
    entities: [
      { id: "a", extensions: { "experimental.github.sukoyaka-dopeness.coordinate": { coordinates: [{ spaceId: "liaisonscape-graph", values: { x: 12, y: 24 } }] } } },
      { id: "b" },
      { id: "c" },
    ],
    events: [],
    relations: [],
    extensions: {
      "experimental.github.sukoyaka-dopeness.coordinate": {
        formatVersion: "0.1.0",
        spaces: [{ id: "liaisonscape-graph", kind: "cartesian-2d", components: {
          x: { unit: "liaisonscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "liaisonscape-user-unit", positiveDirection: "display-down" },
        } }],
      },
      "draft.github.sukoyaka-dopeness.liaisonscape-layout": {
        specVersion: "0.1.0",
        entities: { a: { pinned: true, spaceId: "liaisonscape-graph" } },
      },
    },
  };
  const before = JSON.stringify(dataset);
  const captured = captureExplicitAutoLayoutSnapshotFromDataset({
    ...input(),
    dataset,
    currentPositions: { a: { x: 99, y: 88 }, b: { x: 180, y: 0 }, c: { x: 90, y: 150 } },
    stagedPins: { b: { spaceId: "liaisonscape-graph" } },
    manuallyMovedEntityIds: ["a"],
  });
  assert.ok(captured.snapshot, captured.failure?.message);
  assert.deepEqual(captured.snapshot?.activePins, {
    a: { x: 99, y: 88, source: "staged" },
    b: { x: 180, y: 0, source: "staged" },
  });
  assert.equal(JSON.stringify(dataset), before);
});

test("staged Unpin removes a saved Pin from the operation snapshot", () => {
  const base = {
    version: "0.1.0", entities: [{ id: "a" }, { id: "b" }, { id: "c" }], events: [], relations: [],
    extensions: { "draft.github.sukoyaka-dopeness.liaisonscape-layout": {
      specVersion: "0.1.0", entities: { a: { pinned: true, spaceId: "liaisonscape-graph" } },
    } },
  };
  const result = captureExplicitAutoLayoutSnapshotFromDataset({
    ...input(),
    dataset: base,
    currentPositions: input().positions,
    stagedPins: { a: null },
  });
  assert.ok(result.snapshot, result.failure?.message);
  assert.equal(result.snapshot.activePins.a, undefined);
});

test("invalid or orphan active Pins fail closed with diagnostics", () => {
  const dataset = { version: "0.1.0", entities: [{ id: "a" }], events: [], relations: [], extensions: {
    "draft.github.sukoyaka-dopeness.liaisonscape-layout": { specVersion: "0.1.0", entities: { missing: { pinned: true, spaceId: "liaisonscape-graph" }, a: { pinned: true, spaceId: "liaisonscape-graph" } } },
  } };
  const captured = captureExplicitAutoLayoutSnapshotFromDataset({ ...input(), dataset, currentPositions: input().positions });
  assert.equal(captured.snapshot, null);
  assert.equal(captured.failure.code, "PIN_RESOLUTION_FAILED");
  assert.equal(captured.pinDiagnostics.some(({ code }) => code === "PIN_ORPHAN_ENTITY"), true);
});

test("adapter keeps calculation transport-neutral and protects Cancel/stale results", async () => {
  let release: ((result: ReturnType<typeof runExplicitAutoLayoutOperation>) => void) | undefined;
  const adapter = new ExplicitAutoLayoutOperationAdapter({
    execute: () => new Promise((resolve) => { release = resolve; }),
  });
  const first = adapter.start(snapshot());
  adapter.cancel();
  assert.equal((await first).status, "cancelled");
  release?.(runExplicitAutoLayoutOperation(snapshot({ operationId: "late", generation: 2 }), config));
  const second = adapter.start(snapshot({ operationId: "second", generation: 2 }));
  const third = adapter.start(snapshot({ operationId: "third", generation: 3 }));
  assert.equal((await second).status, "stale");
  release?.(runExplicitAutoLayoutOperation(snapshot({ operationId: "third", generation: 3 }), config));
  assert.equal((await third).status, "completed");
  adapter.dispose();
});

test("invalid or incomplete snapshots are rejected before calculation", () => {
  const result = captureExplicitAutoLayoutSnapshot(input({ positions: { a: { x: 0, y: 0 } } }));
  assert.equal(result.snapshot, null);
  assert.equal(result.failure.code, "INVALID_SNAPSHOT");
});
