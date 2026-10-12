import assert from "node:assert/strict";
import test from "node:test";
import { loadDataset, prepareDatasetForExport, serializeDataset } from "../src/services/DatasetService.ts";
import type { Dataset } from "../src/models.ts";
import { validateDataset } from "@sukoyaka-dopeness/e2r-validator";

const SPECIFICATION = "draft.github.sukoyaka-dopeness.specification";

test("Export completes a known Metadata declaration on a copy and preserves round-trip content", () => {
  const source: Dataset = {
    version: "1.0",
    entities: [{ id: "e1" }],
    events: [],
    relations: [],
    extensions: { metadata: { title: "星の記録", datasetId: "dataset-1", retained: { value: true } } },
  };
  const before = structuredClone(source);
  const exported = prepareDatasetForExport(source);
  assert.notEqual(exported, source);
  assert.deepEqual(exported.extensions?.[SPECIFICATION], {
    specVersion: "0.1.0",
    uses: [{ extension: "metadata", version: "1.0.0" }],
  });
  assert.deepEqual(source, before);
  assert.deepEqual(exported.extensions?.metadata, source.extensions?.metadata);
  assert.deepEqual(exported.extensions?.metadata, { title: "星の記録", datasetId: "dataset-1", retained: { value: true } });
  const roundTrip = loadDataset(serializeDataset(exported));
  assert.deepEqual(roundTrip.dataset, exported);
});

test("Export leaves unknown Extensions and existing Specification declarations untouched", () => {
  const unknown: Dataset = {
    version: "1.0", entities: [], events: [], relations: [],
    extensions: { metadata: { title: "Known" }, "opaque.example/future": { payload: [1] } },
  };
  assert.equal(prepareDatasetForExport(unknown), unknown);
  const knownAndUnknown: Dataset = {
    version: "1.0", entities: [{ id: "e1", extensions: { "opaque.example/entity": { keep: [1] } } }], events: [], relations: [],
    extensions: { metadata: { title: "Known" } },
  };
  assert.equal(prepareDatasetForExport(knownAndUnknown), knownAndUnknown);

  const existing: Dataset = {
    version: "1.0", entities: [], events: [], relations: [],
    extensions: { metadata: { title: "Known" }, [SPECIFICATION]: { specVersion: "0.1.0", uses: [] } },
  };
  assert.equal(prepareDatasetForExport(existing), existing);
});

test("Export declares the supported Coordinate version and preserves its opaque payload fields", () => {
  const coordinate = "experimental.github.sukoyaka-dopeness.coordinate";
  const source: Dataset = {
    version: "1.0",
    entities: [{ id: "e1", extensions: { [coordinate]: { coordinates: [
      { spaceId: "linkscape-graph", values: { x: 1, y: 2 } },
    ] } } }],
    events: [],
    relations: [],
    extensions: { metadata: { title: "Coordinates" }, [coordinate]: { formatVersion: "0.1.0", spaces: [{
      id: "linkscape-graph", kind: "cartesian-2d",
      components: {
        x: { unit: "linkscape-user-unit", positiveDirection: "display-right" },
        y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
      },
    }], future: { keep: true } } },
  };
  const exported = prepareDatasetForExport(source);
  assert.deepEqual(exported.extensions?.[SPECIFICATION], {
    specVersion: "0.1.0",
    uses: [
      { extension: "metadata", version: "1.0.0" },
      { extension: coordinate, version: "0.1.0" },
    ],
  });
  assert.deepEqual((exported.extensions?.[coordinate] as Record<string, unknown>).future, { keep: true });
  assert.deepEqual(loadDataset(serializeDataset(exported)).dataset, exported);
});

test("Export reads the Draft Coordinate version only from its Dataset bootstrap", () => {
  const coordinate = "draft.github.sukoyaka-dopeness.coordinate";
  const source: Dataset = {
    version: "1.0",
    entities: [{ id: "e1", extensions: { [coordinate]: { coordinates: [
      { spaceId: "liaisonscape-graph", values: { x: 2, y: 3 } },
    ] } } }],
    events: [],
    relations: [],
    extensions: {
      metadata: { title: "Draft coordinates" },
      [coordinate]: { specVersion: "0.1.0", spaces: [{
        id: "liaisonscape-graph", kind: "cartesian-2d",
        components: {
          x: { unit: "liaisonscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "liaisonscape-user-unit", positiveDirection: "display-down" },
        },
      }] },
    },
  };
  const exported = prepareDatasetForExport(source);
  assert.deepEqual(exported.extensions?.[SPECIFICATION], {
    specVersion: "0.1.0",
    uses: [
      { extension: "metadata", version: "1.0.0" },
      { extension: coordinate, version: "0.1.0" },
    ],
  });
  assert.deepEqual(loadDataset(serializeDataset(exported)).dataset, exported);
});

test("Export does not declare a future Presentation version as the supported version", () => {
  const presentation = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";
  const source: Dataset = {
    version: "1.0", entities: [], events: [], relations: [],
    extensions: { [presentation]: { specVersion: "9.9.9", relations: {} } },
  };
  const originalValidation = validateDataset(source) as { valid: boolean; diagnostics: Array<{ code: string; severity: string }> };
  assert.equal(originalValidation.valid, true);
  assert.ok(originalValidation.diagnostics.some(({ code, severity }) => code === "presentation_version_unsupported" && severity === "warning"));
  assert.equal(prepareDatasetForExport(source), source);
});

test("Export requires each version-bearing payload's own supported bootstrap version", () => {
  const coordinate = "experimental.github.sukoyaka-dopeness.coordinate";
  const draftCoordinate = "draft.github.sukoyaka-dopeness.coordinate";
  const layout = "draft.github.sukoyaka-dopeness.liaisonscape-layout";
  const presentation = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";
  const cases: Dataset[] = [
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [coordinate]: { formatVersion: "9.9.9", spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [coordinate]: { formatVersion: null, spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [coordinate]: { specVersion: "0.1.0", spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [coordinate]: { spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [draftCoordinate]: { specVersion: "9.9.9", spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [draftCoordinate]: { specVersion: "not-a-version", spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [draftCoordinate]: { spaces: [] } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [layout]: { specVersion: "9.9.9", entities: {} } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [layout]: { entities: {} } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [presentation]: { specVersion: "9.9.9", relations: {} } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [presentation]: { specVersion: 0.1, relations: {} } } },
    { version: "1.0", entities: [], events: [], relations: [], extensions: { [presentation]: { relations: {} } } },
  ];
  for (const source of cases) assert.equal(prepareDatasetForExport(source), source);
});

test("Export does not infer a Dataset-level version from object-level Extension placement", () => {
  const metadata: Dataset = {
    version: "1.0", entities: [{ id: "e1", extensions: { metadata: { title: "misplaced" } } }], events: [], relations: [],
  };
  const layout = "draft.github.sukoyaka-dopeness.liaisonscape-layout";
  const presentation = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";
  const objectLayout: Dataset = {
    version: "1.0", entities: [{ id: "e1", extensions: { [layout]: { specVersion: "0.1.0", entities: {} } } }], events: [], relations: [],
  };
  const objectPresentation: Dataset = {
    version: "1.0", entities: [{ id: "e1", extensions: { [presentation]: { specVersion: "0.1.0", relations: {} } } }], events: [], relations: [],
  };
  const coordinate = "experimental.github.sukoyaka-dopeness.coordinate";
  const objectCoordinate: Dataset = {
    version: "1.0", entities: [{ id: "e1", extensions: { [coordinate]: { coordinates: [] } } }], events: [], relations: [],
  };
  const relationCoordinate: Dataset = {
    version: "1.0", entities: [], events: [], relations: [{ id: "r1", extensions: { [coordinate]: { coordinates: [] } } }],
  };
  for (const source of [metadata, objectLayout, objectPresentation, objectCoordinate, relationCoordinate]) assert.equal(prepareDatasetForExport(source), source);
});

test("Export omits Layout completion when the current Validator reports its specification unavailable", () => {
  const layout = "draft.github.sukoyaka-dopeness.liaisonscape-layout";
  const source: Dataset = {
    version: "1.0", entities: [], events: [], relations: [],
    extensions: { [layout]: { specVersion: "0.1.0", entities: {} } },
  };
  const original = validateDataset(source) as { diagnostics: Array<{ code: string }> };
  assert.equal(original.diagnostics.some(({ code }) => code === "specification_unavailable"), false);
  const candidate = structuredClone(source);
  candidate.extensions = { ...candidate.extensions, [SPECIFICATION]: { specVersion: "0.1.0", uses: [{ extension: layout, version: "0.1.0" }] } };
  const candidateValidation = validateDataset(candidate) as { diagnostics: Array<{ code: string }> };
  assert.ok(candidateValidation.diagnostics.some(({ code }) => code === "specification_unavailable"));
  assert.equal(prepareDatasetForExport(source), source);
});

test("Export completes an exact Presentation declaration and round-trips it", () => {
  const presentation = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";
  const source: Dataset = {
    version: "1.0", entities: [], events: [], relations: [],
    extensions: { metadata: { title: "Known" }, [presentation]: { specVersion: "0.1.0", relations: {} } },
  };
  const exported = prepareDatasetForExport(source);
  assert.deepEqual(exported.extensions?.[SPECIFICATION], {
    specVersion: "0.1.0",
    uses: [
      { extension: "metadata", version: "1.0.0" },
      { extension: presentation, version: "0.1.0" },
    ],
  });
  assert.deepEqual(loadDataset(serializeDataset(exported)).dataset, exported);
});
