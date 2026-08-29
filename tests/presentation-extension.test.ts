import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESENTATION_EXTENSION_ID,
  readRelationArrowDisplay,
  readRelationLineStyle,
  removeRelationPresentationRecord,
  writeRelationArrowDisplay,
  writeRelationLineStyle,
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

test("removes only the deleted Relation presentation record and preserves siblings", () => {
  const source = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: {
          r1: { arrowDisplay: "reverse", lineStyle: "dashed", future: { keep: true } },
          r2: { arrowDisplay: "future-arrow", lineStyle: "future-line", sibling: true },
          orphan: { lineStyle: "dotted" },
        },
        futurePayload: { keep: true },
      },
      unknown: { keep: true },
    },
  } as Dataset;
  const result = removeRelationPresentationRecord(source, "r1");
  const saved = writeSuccess(result);
  assert.equal(saved.changed, true);
  const payload = saved.dataset.extensions?.[PRESENTATION_EXTENSION_ID] as Record<string, unknown>;
  assert.equal((payload.relations as Record<string, unknown>).r1, undefined);
  assert.deepEqual((payload.relations as Record<string, unknown>).r2, source.extensions?.[PRESENTATION_EXTENSION_ID] && (source.extensions[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations && ((source.extensions[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, unknown>).r2);
  assert.deepEqual((payload.relations as Record<string, unknown>).orphan, { lineStyle: "dotted" });
  assert.deepEqual(payload.futurePayload, { keep: true });
  assert.deepEqual(saved.dataset.extensions?.unknown, { keep: true });
  assert.ok(source.extensions?.[PRESENTATION_EXTENSION_ID]);
});

test("Presentation cleanup is a no-op without a target record and omits an empty envelope", () => {
  const absent = removeRelationPresentationRecord(datasetWithRelations(), "r1");
  assert.equal(absent.changed, false);
  const last = {
    ...datasetWithRelations(),
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle: "dotted" } } } },
  } as Dataset;
  const removed = writeSuccess(removeRelationPresentationRecord(last, "r1"));
  assert.equal(removed.dataset.extensions, undefined);
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

test("reads line styles with Solid fallback and preserves Arrow independence", () => {
  const absent = datasetWithRelations();
  assert.equal(readRelationLineStyle(absent, "r1"), "solid");

  const noRelations = { ...absent, extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0" } } };
  assert.equal(readRelationLineStyle(noRelations, "r1"), "solid");

  const noRecord = { ...absent, extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: {} } } };
  assert.equal(readRelationLineStyle(noRecord, "r1"), "solid");
  assert.equal(readRelationLineStyle(absent, "missing"), "solid");

  for (const style of ["solid", "dashed", "dotted"] as const) {
    const document = {
      ...absent,
      extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle: style } } } },
    };
    assert.equal(readRelationLineStyle(document, "r1"), style);
  }

  const unknown = {
    ...absent,
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle: "future-pattern" } } } },
  };
  assert.equal(readRelationLineStyle(unknown, "r1"), "solid");
  assert.equal(readRelationArrowDisplay(unknown, "r1"), "normal");
});

test("writes non-default line styles into the existing Presentation envelope", () => {
  const source = datasetWithRelations();
  const dashed = writeSuccess(writeRelationLineStyle(source, "r1", "dashed"));
  assert.equal(dashed.changed, true);
  assert.deepEqual(dashed.dataset.extensions, {
    [PRESENTATION_EXTENSION_ID]: {
      specVersion: "0.1.0",
      relations: { r1: { lineStyle: "dashed" } },
    },
  });
  assert.deepEqual(dashed.dataset.relations, source.relations);

  const dotted = writeSuccess(writeRelationLineStyle(dashed.dataset, "r1", "dotted"));
  assert.equal(dotted.changed, true);
  assert.equal(readRelationLineStyle(dotted.dataset, "r1"), "dotted");
  assert.deepEqual((dotted.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID], {
    specVersion: "0.1.0",
    relations: { r1: { lineStyle: "dotted" } },
  });
});

test("canonically omits lineStyle Solid while retaining other Presentation data", () => {
  const source: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        futureTopLevelField: { opaque: true },
        relations: {
          r1: { lineStyle: "dashed", futureVisualProperty: 123 },
          r2: { arrowDisplay: "reverse", lineStyle: "dashed" },
        },
      },
      futureExtension: { preserved: true },
      "draft.github.sukoyaka-dopeness.coordinate": { specVersion: "0.1.0", spaces: [{ id: "graph" }] },
    },
  };
  const solid = writeSuccess(writeRelationLineStyle(source, "r1", "solid"));
  assert.equal(solid.changed, true);
  const presentation = (solid.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>;
  assert.deepEqual(presentation.relations, {
    r1: { futureVisualProperty: 123 },
    r2: { arrowDisplay: "reverse", lineStyle: "dashed" },
  });
  assert.deepEqual(presentation.futureTopLevelField, { opaque: true });
  assert.deepEqual((solid.dataset.extensions as Record<string, unknown>).futureExtension, { preserved: true });
  assert.deepEqual((solid.dataset.extensions as Record<string, unknown>)["draft.github.sukoyaka-dopeness.coordinate"], { specVersion: "0.1.0", spaces: [{ id: "graph" }] });
  assert.deepEqual(solid.dataset.relations, source.relations);

  const onlyStyle = writeSuccess(writeRelationLineStyle({
    ...datasetWithRelations(),
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle: "dashed" } } } },
  }, "r1", "solid"));
  assert.equal(onlyStyle.changed, true);
  assert.equal(Object.hasOwn(onlyStyle.dataset, "extensions"), false);

  const explicitSolid = writeSuccess(writeRelationLineStyle({
    ...datasetWithRelations(),
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle: "solid" } } } },
  }, "r1", "solid"));
  assert.equal(explicitSolid.changed, true);
  assert.equal(Object.hasOwn(explicitSolid.dataset, "extensions"), false);
});

test("preserves both known and unknown Arrow values during line-style writes", () => {
  const known: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { arrowDisplay: "reverse", lineStyle: "dashed" } },
      },
    },
  };
  const dotted = writeSuccess(writeRelationLineStyle(known, "r1", "dotted"));
  const dottedRecord = (((dotted.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(dottedRecord, { arrowDisplay: "reverse", lineStyle: "dotted" });

  const solid = writeSuccess(writeRelationLineStyle(dotted.dataset, "r1", "solid"));
  const solidRecord = (((solid.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(solidRecord, { arrowDisplay: "reverse" });

  const unknownArrow: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { arrowDisplay: "future-arrow-mode", lineStyle: "dashed" } },
      },
    },
  };
  const unknownArrowResult = writeSuccess(writeRelationLineStyle(unknownArrow, "r1", "dotted"));
  const unknownArrowRecord = (((unknownArrowResult.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(unknownArrowRecord, { arrowDisplay: "future-arrow-mode", lineStyle: "dotted" });
});

test("Arrow writes preserve known and unknown line styles", () => {
  const known: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { arrowDisplay: "reverse", lineStyle: "dashed" } },
      },
    },
  };
  const updated = writeSuccess(writeRelationArrowDisplay(known, "r1", "bidirectional"));
  const updatedRecord = (((updated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(updatedRecord, { arrowDisplay: "bidirectional", lineStyle: "dashed" });

  const normal = writeSuccess(writeRelationArrowDisplay(updated.dataset, "r1", "normal"));
  const normalRecord = (((normal.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(normalRecord, { lineStyle: "dashed" });

  const unknown: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { arrowDisplay: "reverse", lineStyle: "future-pattern" } },
      },
    },
  };
  const unknownUpdated = writeSuccess(writeRelationArrowDisplay(unknown, "r1", "bidirectional"));
  const unknownRecord = (((unknownUpdated.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(unknownRecord, { arrowDisplay: "bidirectional", lineStyle: "future-pattern" });
});

test("explicitly editing an unknown line style replaces it and Solid removes it", () => {
  const source: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: { r1: { lineStyle: "future-pattern", futureField: true } },
      },
    },
  };
  const dashed = writeSuccess(writeRelationLineStyle(source, "r1", "dashed"));
  const dashedRecord = (((dashed.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(dashedRecord, { lineStyle: "dashed", futureField: true });
  const solid = writeSuccess(writeRelationLineStyle(dashed.dataset, "r1", "solid"));
  const solidRecord = (((solid.dataset.extensions as Record<string, unknown>)[PRESENTATION_EXTENSION_ID] as Record<string, unknown>).relations as Record<string, Record<string, unknown>>).r1;
  assert.deepEqual(solidRecord, { futureField: true });
});

test("line-style same-value writes, safety refusals, self Relations, and parallel IDs remain bounded", () => {
  const dashed = writeSuccess(writeRelationLineStyle(datasetWithRelations(), "r1", "dashed"));
  const same = writeSuccess(writeRelationLineStyle(dashed.dataset, "r1", "dashed"));
  assert.equal(same.changed, false);
  assert.equal(same.dataset, dashed.dataset);

  const absent = datasetWithRelations();
  const defaultResult = writeSuccess(writeRelationLineStyle(absent, "r1", "solid"));
  assert.equal(defaultResult.changed, false);
  assert.equal(defaultResult.dataset, absent);

  const source: Dataset = {
    ...datasetWithRelations(),
    extensions: {
      [PRESENTATION_EXTENSION_ID]: {
        specVersion: "0.1.0",
        relations: {
          r1: { lineStyle: "dashed" },
          r2: { lineStyle: "dotted" },
          self: { lineStyle: "dashed" },
        },
      },
    },
  };
  const parallel = writeSuccess(writeRelationLineStyle(source, "r1", "dotted"));
  assert.equal(readRelationLineStyle(parallel.dataset, "r1"), "dotted");
  assert.equal(readRelationLineStyle(parallel.dataset, "r2"), "dotted");
  assert.equal(readRelationLineStyle(parallel.dataset, "self"), "dashed");
  assert.deepEqual(parallel.dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })), [
    { id: "r1", sourceId: "a", targetId: "b" },
    { id: "r2", sourceId: "a", targetId: "b" },
    { id: "self", sourceId: "a", targetId: "a" },
  ]);

  const unsupported: Dataset = {
    ...datasetWithRelations(),
    extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.2.0", relations: { r1: { lineStyle: "dashed" } } } },
  };
  const unsupportedResult = writeRelationLineStyle(unsupported, "r1", "dotted");
  assert.equal(unsupportedResult.changed, false);
  assert.equal(unsupportedResult.dataset, unsupported);
  assert.equal("refusal" in unsupportedResult, true);
  assert.equal((unsupportedResult as Extract<PresentationWriteResult, { refusal: string }>).refusal, "presentation_version_unsupported");

  for (const lineStyle of [null, 123, {}]) {
    const malformed: Dataset = {
      ...datasetWithRelations(),
      extensions: { [PRESENTATION_EXTENSION_ID]: { specVersion: "0.1.0", relations: { r1: { lineStyle } } } },
    };
    const result = writeRelationLineStyle(malformed, "r1", "dashed");
    assert.equal(result.changed, false);
    assert.equal(result.dataset, malformed);
    assert.equal((result as Extract<PresentationWriteResult, { refusal: string }>).refusal, "presentation_payload_invalid");
  }

  const missingSource = datasetWithRelations();
  const missing = writeRelationLineStyle(missingSource, "missing", "dashed");
  assert.equal(missing.changed, false);
  assert.equal(missing.dataset, missingSource);
  assert.equal((missing as Extract<PresentationWriteResult, { refusal: string }>).refusal, "relation_not_found");
});
