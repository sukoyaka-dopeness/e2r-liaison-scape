import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESENTATION_EXTENSION_ID,
  readRelationArrowDisplay,
  writeRelationArrowDisplay,
  type PresentationWriteResult,
} from "../src/presentation-extension.ts";
import type { Dataset } from "../src/models.ts";

function datasetWithRelations(): Dataset {
  return {
    version: "1.0",
    entities: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    events: [],
    relations: [
      { id: "r1", sourceId: "a", targetId: "b", name: "First", description: "First relation", futureRelationField: { opaque: true } },
      { id: "r2", sourceId: "a", targetId: "b", name: "Second", description: "Second relation" },
      { id: "self", sourceId: "a", targetId: "a", name: "Self" },
    ],
  };
}

function writeSuccess(result: PresentationWriteResult): Extract<PresentationWriteResult, { dataset: Dataset; changed: boolean }> {
  assert.equal("refusal" in result, false);
  return result;
}

test("reads absent, omitted, explicit Normal, and known presentation modes safely", () => {
  const absent = datasetWithRelations();
  assert.equal(readRelationArrowDisplay(absent, "r1"), "normal");

  const noRelations = { ...absent, extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0" } } };
  assert.equal(readRelationArrowDisplay(noRelations, "r1"), "normal");

  const noRecord = { ...absent, extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: {} } } };
  assert.equal(readRelationArrowDisplay(noRecord, "r1"), "normal");

  const omittedArrow = {
    ...absent,
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { futureField: true } } } },
  };
  assert.equal(readRelationArrowDisplay(omittedArrow, "r1"), "normal");

  const explicitNormal = {
    ...absent,
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { arrowDisplay: "normal" } } } },
  };
  assert.equal(readRelationArrowDisplay(explicitNormal, "r1"), "normal");

  for (const mode of ["reverse", "undirected", "bidirectional"] as const) {
    const document = {
      ...absent,
      extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { arrowDisplay: mode } } } },
    };
    assert.equal(readRelationArrowDisplay(document, "r1"), mode);
  }
});

test("unknown arrow token falls back to Normal without exposing a fifth mode", () => {
  const dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { arrowDisplay: "future-mode", futureField: 123 } },
      },
    },
  };
  assert.equal(readRelationArrowDisplay(dataset, "r1"), "normal");
});

test("creates, updates, and preserves the Dataset-contained Presentation Extension", () => {
  const source = datasetWithRelations();
  const original = structuredClone(source);
  const created = writeSuccess(writeRelationArrowDisplay(source, "r1", "reverse"));

  assert.equal(created.changed, true);
  assert.deepEqual(created.dataset.relations, source.relations);
  assert.deepEqual(source, original);
  assert.deepEqual(created.dataset.extensions, {
    [PRESENTATION_EXTENSION_ID]: {
      specVersion: "0.1.0",
      relations: { r1: { arrowDisplay: "reverse" } },
    },
  });

  const withUnrelatedData: Dataset = {
    ...created.dataset,
    extensions: {
      ...created.dataset.extensions,
      futureExtension: { preserved: true },
      "draft.github.sukoyaka-dopeness.coordinate": { specVersion: "0.1.0", spaces: [{ id: "graph" }] },
      [PRESENTATION_EXTENSION_ID]: {
        ...(created.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>,
        futureTopLevelField: { opaque: true },
        relations: {
          r1: { arrowDisplay: "reverse", futureRelationField: { opaque: true } },
        },
      },
    },
  };
  const updated = writeSuccess(writeRelationArrowDisplay(withUnrelatedData, "r1", "undirected"));
  assert.equal(updated.changed, true);
  assert.equal(readRelationArrowDisplay(updated.dataset, "r1"), "undirected");
  assert.deepEqual((updated.dataset.relations[0] as Record<string, unknown>).futureRelationField, { opaque: true });
  assert.deepEqual((updated.dataset.extensions as Record<string, unknown>).futureExtension, { preserved: true });
  assert.deepEqual((updated.dataset.extensions as Record<string, unknown>)["draft.github.sukoyaka-dopeness.coordinate"], { specVersion: "0.1.0", spaces: [{ id: "graph" }] });
  assert.deepEqual((updated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID], {
    specVersion: "0.1.0",
    futureTopLevelField: { opaque: true },
    relations: { r1: { arrowDisplay: "undirected", futureRelationField: { opaque: true } } },
  });
});

test("writes Bidirectional independently for a parallel Relation and supports self Relations", () => {
  const source = datasetWithRelations();
  const reverse = writeSuccess(writeRelationArrowDisplay(source, "r1", "reverse"));
  const bidirectional = writeSuccess(writeRelationArrowDisplay(reverse.dataset, "r2", "bidirectional"));
  const self = writeSuccess(writeRelationArrowDisplay(bidirectional.dataset, "self", "undirected"));

  assert.equal(readRelationArrowDisplay(self.dataset, "r1"), "reverse");
  assert.equal(readRelationArrowDisplay(self.dataset, "r2"), "bidirectional");
  assert.equal(readRelationArrowDisplay(self.dataset, "self"), "undirected");
  assert.deepEqual(self.dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })), [
    { id: "r1", sourceId: "a", targetId: "b" },
    { id: "r2", sourceId: "a", targetId: "b" },
    { id: "self", sourceId: "a", targetId: "a" },
  ]);
});

test("Normal canonically removes the known arrow, record, and empty Extension", () => {
  const reverse = writeSuccess(writeRelationArrowDisplay(datasetWithRelations(), "r1", "reverse"));
  const normal = writeSuccess(writeRelationArrowDisplay(reverse.dataset, "r1", "normal"));
  assert.equal(normal.changed, true);
  assert.equal(Object.hasOwn(normal.dataset, "extensions"), false);
  assert.equal(readRelationArrowDisplay(normal.dataset, "r1"), "normal");

  const explicitNormal = {
    ...datasetWithRelations(),
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { arrowDisplay: "normal" } } } },
  };
  const canonical = writeSuccess(writeRelationArrowDisplay(explicitNormal, "r1", "normal"));
  assert.equal(Object.hasOwn(canonical.dataset, "extensions"), false);
});

test("Normal preserves unknown fields and unknown arrow tokens until the same property is explicitly changed", () => {
  const source: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        futureTopLevelField: "keep",
        relations: {
          r1: { arrowDisplay: "future-mode", futureRelationField: 123 },
          r2: { arrowDisplay: "reverse" },
        },
      },
    },
  };
  const unrelated = writeSuccess(writeRelationArrowDisplay(source, "r2", "bidirectional"));
  assert.equal((unrelated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] && ((unrelated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations && (((unrelated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, unknown>).r1 && (((unrelated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1.arrowDisplay, "future-mode");

  const override = writeSuccess(writeRelationArrowDisplay(unrelated.dataset, "r1", "reverse"));
  const overrideRecord = (((override.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(overrideRecord, { arrowDisplay: "reverse", futureRelationField: 123 });

  const removeUnknown = writeSuccess(writeRelationArrowDisplay(override.dataset, "r1", "normal"));
  const removedRecord = (((removeUnknown.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(removedRecord, { futureRelationField: 123 });
});

test("same-value writes return changed false and the original Dataset reference", () => {
  const source = writeSuccess(writeRelationArrowDisplay(datasetWithRelations(), "r1", "reverse")).dataset;
  const result = writeSuccess(writeRelationArrowDisplay(source, "r1", "reverse"));
  assert.equal(result.changed, false);
  assert.equal(result.dataset, source);

  const absent = datasetWithRelations();
  const defaultResult = writeSuccess(writeRelationArrowDisplay(absent, "r1", "normal"));
  assert.equal(defaultResult.changed, false);
  assert.equal(defaultResult.dataset, absent);
});

test("unsupported versions and malformed supported payloads refuse without mutation", () => {
  for (const extensions of [
    { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.2.0", relations: { r1: { arrowDisplay: "reverse" } } } },
    { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: [] } },
    { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: {} } } },
    { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { arrowDisplay: 1 } } } },
  ]) {
    const source = { ...datasetWithRelations(), extensions };
    const result = writeRelationArrowDisplay(source, "r1", "reverse");
    assert.equal(result.changed, false);
    assert.equal(result.dataset, source);
    assert.equal("refusal" in result, true);
  }
});

test("missing Relations refuse and cannot create orphan Presentation records", () => {
  const source = datasetWithRelations();
  const result = writeRelationArrowDisplay(source, "missing", "reverse");
  assert.equal(result.changed, false);
  assert.equal(result.dataset, source);
  assert.equal("refusal" in result, true);
  assert.equal((result as Extract<PresentationWriteResult, { refusal: string }>).refusal, "relation_not_found");
});
