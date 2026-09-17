import test from "node:test";
import assert from "node:assert/strict";
import {
  COORDINATE_EXTENSION_ID,
  COORDINATE_FORMAT_VERSION,
  LIAISONSCAPE_SPACE_ID,
  LIAISONSCAPE_USER_UNIT,
  type Dataset,
} from "../src/dataset.ts";
import {
  LIAISONSCAPE_LAYOUT_EXTENSION_ID,
  buildAtomicPinSaveCandidate,
  createWorkingPinState,
  deriveWorkingPinState,
  stagePin,
  stageUnpin,
} from "../src/pin-persistence.ts";
import { resolveExplicitAutoLayoutPins } from "../src/explicit-auto-layout-pin.ts";

const space = {
  id: LIAISONSCAPE_SPACE_ID,
  kind: "cartesian-2d",
  components: {
    x: { unit: LIAISONSCAPE_USER_UNIT, positiveDirection: "display-right" },
    y: { unit: LIAISONSCAPE_USER_UNIT, positiveDirection: "display-down" },
  },
};

function datasetWithCoordinates(
  coordinates: Record<string, { x: number; y: number }>,
  layout?: Record<string, unknown>,
): Dataset {
  return {
    version: "1.0",
    entities: ["a", "b"].map((id) => ({
      id,
      ...(coordinates[id] ? {
        extensions: {
          [COORDINATE_EXTENSION_ID]: {
            formatVersion: COORDINATE_FORMAT_VERSION,
            coordinates: [{ spaceId: LIAISONSCAPE_SPACE_ID, values: coordinates[id] }],
          },
        },
      } : {}),
    })),
    events: [],
    relations: [],
    ...(Object.keys(coordinates).length > 0 ? {
      extensions: {
        [COORDINATE_EXTENSION_ID]: { formatVersion: COORDINATE_FORMAT_VERSION, spaces: [space] },
        ...(layout ? { [LIAISONSCAPE_LAYOUT_EXTENSION_ID]: layout } : {}),
      },
    } : layout ? { extensions: { [LIAISONSCAPE_LAYOUT_EXTENSION_ID]: layout } } : {}),
  };
}

test("stages a new Pin and atomically writes its working coordinate and intent", () => {
  const dataset = datasetWithCoordinates({});
  const initial = createWorkingPinState(dataset);
  assert.deepEqual(initial.diagnostics, []);
  const staged = stagePin(initial.state, "a", LIAISONSCAPE_SPACE_ID, { currentPosition: { x: 40, y: 50 } });
  assert.equal(staged.changed, true);
  assert.deepEqual(deriveWorkingPinState(staged.state), {
    pins: { a: { spaceId: LIAISONSCAPE_SPACE_ID } },
    unsavedPins: true,
    coordinatesToDiscard: [],
  });

  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: { a: { x: 40, y: 50 } }, workingPins: staged.state });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.deepEqual((result.dataset.extensions as Record<string, unknown>)[LIAISONSCAPE_LAYOUT_EXTENSION_ID], {
    specVersion: "0.1.0",
    entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } },
  });
  assert.deepEqual(resolveExplicitAutoLayoutPins({ dataset: result.dataset, currentPositions: { a: { x: 40, y: 50 } } }).anchors.a, { x: 40, y: 50, source: "saved" });
  assert.equal(dataset.extensions, undefined);
});

test("Pin save adds the Layout declaration to an existing Specification uses list", () => {
  const dataset = datasetWithCoordinates({});
  dataset.extensions = {
    metadata: { datasetId: "pin-save-declaration", title: "Pin save declaration" },
    "draft.github.sukoyaka-dopeness.specification": {
      specVersion: "0.1.0",
      uses: [{ extension: "metadata", version: "1.0.0" }],
    },
  };
  const staged = stagePin(createWorkingPinState(dataset).state, "a", LIAISONSCAPE_SPACE_ID, {
    currentPosition: { x: 40.25, y: 50.75 },
  });
  const result = buildAtomicPinSaveCandidate({
    dataset,
    coordinatePositions: { a: { x: 40.25, y: 50.75 } },
    workingPins: staged.state,
  });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  const specification = (result.dataset.extensions as Record<string, Record<string, unknown>>)["draft.github.sukoyaka-dopeness.specification"];
  assert.deepEqual(specification.uses, [
    { extension: "metadata", version: "1.0.0" },
    { extension: COORDINATE_EXTENSION_ID, version: COORDINATE_FORMAT_VERSION },
    { extension: LIAISONSCAPE_LAYOUT_EXTENSION_ID, version: "0.1.0" },
  ]);
  assert.deepEqual(resolveExplicitAutoLayoutPins({ dataset: result.dataset, currentPositions: { a: { x: 40.25, y: 50.75 } } }).anchors.a, {
    x: 40.25,
    y: 50.75,
    source: "saved",
  });
});

test("Unpin uses omission, preserves unknown fields, and never removes coordinates", () => {
  const dataset = datasetWithCoordinates({ a: { x: 10, y: 20 } }, {
    specVersion: "0.1.0",
    futureLayoutField: "keep",
    entities: {
      a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID, futureEntityField: 7 },
      orphan: { futureOnly: true },
    },
  });
  const initial = createWorkingPinState(dataset);
  const unpinned = stageUnpin(initial.state, "a");
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: {}, workingPins: unpinned.state });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  const layout = (result.dataset.extensions as Record<string, unknown>)[LIAISONSCAPE_LAYOUT_EXTENSION_ID] as Record<string, unknown>;
  assert.deepEqual(layout, {
    specVersion: "0.1.0",
    futureLayoutField: "keep",
    entities: { orphan: { futureOnly: true }, a: { futureEntityField: 7 } },
  });
  assert.deepEqual(resolveExplicitAutoLayoutPins({ dataset: result.dataset, currentPositions: { a: { x: 10, y: 20 } } }).anchors, {});
  assert.deepEqual((result.dataset.entities[0]!.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID], (dataset.entities[0]!.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID]);
});

test("Unpin removes an obsolete Layout declaration when the payload is omitted", () => {
  const dataset = datasetWithCoordinates({ a: { x: 10, y: 20 } }, {
    specVersion: "0.1.0",
    entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } },
  });
  (dataset.extensions as Record<string, unknown>)["draft.github.sukoyaka-dopeness.specification"] = {
    specVersion: "0.1.0",
    uses: [
      { extension: COORDINATE_EXTENSION_ID, version: COORDINATE_FORMAT_VERSION },
      { extension: LIAISONSCAPE_LAYOUT_EXTENSION_ID, version: "0.1.0" },
    ],
  };
  const unpinned = stageUnpin(createWorkingPinState(dataset).state, "a");
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: {}, workingPins: unpinned.state });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal((result.dataset.extensions as Record<string, unknown>)[LIAISONSCAPE_LAYOUT_EXTENSION_ID], undefined);
  const specification = (result.dataset.extensions as Record<string, Record<string, unknown>>)["draft.github.sukoyaka-dopeness.specification"];
  assert.deepEqual(specification.uses, [{ extension: COORDINATE_EXTENSION_ID, version: COORDINATE_FORMAT_VERSION }]);
});

test("Pin then Unpin before Save discards a Pin-created coordinate without touching the Dataset", () => {
  const dataset = datasetWithCoordinates({});
  const initial = createWorkingPinState(dataset).state;
  const pinned = stagePin(initial, "a", LIAISONSCAPE_SPACE_ID, { currentPosition: { x: 40, y: 50 } });
  const unpinned = stageUnpin(pinned.state, "a");
  const derived = deriveWorkingPinState(unpinned.state);
  assert.equal(derived.unsavedPins, false);
  assert.deepEqual(derived.coordinatesToDiscard, ["a"]);
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: { a: { x: 40, y: 50 } }, workingPins: unpinned.state });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.changed, false);
  assert.equal(result.dataset.extensions, undefined);
});

test("a manual move of a saved Pin saves the Coordinate and retains the Pin atomically", () => {
  const dataset = datasetWithCoordinates({ a: { x: 10, y: 20 } }, {
    specVersion: "0.1.0",
    entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } },
  });
  const workingPins = createWorkingPinState(dataset).state;
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: { a: { x: 80, y: 90 } }, workingPins });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.deepEqual(resolveExplicitAutoLayoutPins({ dataset: result.dataset, currentPositions: { a: { x: 80, y: 90 } } }).anchors.a, { x: 80, y: 90, source: "saved" });
});

test("active Pin without a complete anchor fails atomically", () => {
  const dataset = datasetWithCoordinates({}, {
    specVersion: "0.1.0",
    entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } },
  });
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: {}, workingPins: createWorkingPinState(dataset).state });
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.code, "PIN_ANCHOR_INVALID");
  assert.equal(result.dataset, dataset);
  assert.deepEqual((dataset.extensions as Record<string, unknown>)[LIAISONSCAPE_LAYOUT_EXTENSION_ID], {
    specVersion: "0.1.0",
    entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } },
  });
});

test("unsupported Pin versions are preserved and refused by the writer", () => {
  const dataset = datasetWithCoordinates({}, { specVersion: "9.0.0", entities: { a: { pinned: true, spaceId: LIAISONSCAPE_SPACE_ID } } });
  const result = buildAtomicPinSaveCandidate({ dataset, coordinatePositions: {}, workingPins: createWorkingPinState(dataset).state });
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.code, "PIN_VERSION_UNSUPPORTED");
  assert.equal(result.dataset, dataset);
});
