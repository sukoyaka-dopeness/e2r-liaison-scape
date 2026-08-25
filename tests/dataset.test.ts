import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { applyStoredCoordinates, assessEntityDeletion, assessRelationDeletion, createCoreObjectId, createEntity, createRelation, deleteEntity, deleteRelation, getDatasetMetadata, loadDataset, serializeDataset, updateEntityDetails, validateDatasetForExport, LIAISONSCAPE_SPACE_ID, type Dataset } from "../src/dataset.ts";

const empty = JSON.stringify({ version: "1.0", entities: [], events: [], relations: [] });

test("creation generates collision-safe IDs across Entity, Event, and Relation", () => {
  const dataset = { version: "1.0", entities: [{ id: "e" }], events: [{ id: "v" }], relations: [{ id: "r", sourceId: "e", targetId: "e" }] } as Dataset;
  const candidates = ["e", "v", "r", "fresh-id"];
  assert.equal(createCoreObjectId(dataset, () => candidates.shift()!), "fresh-id");
});

test("createEntity appends a minimal entity and preserves input", () => {
  const dataset = { version: "1.0", entities: [], events: [{ id: "v", opaque: true }], relations: [], vendor: { keep: true } } as Dataset;
  const result = createEntity(dataset, { name: "  ", description: "  " }, () => "entity-new");
  assert.deepEqual(result.dataset.entities, [{ id: "entity-new" }]);
  assert.deepEqual(dataset.entities, []);
  assert.deepEqual(result.dataset.events, dataset.events);
  assert.deepEqual(result.dataset.vendor, dataset.vendor);
});

test("createEntity preserves authored optional text and round-trips", () => {
  const result = createEntity({ version: "1.0", entities: [], events: [], relations: [] }, { name: "Alice", description: "Person" }, () => "alice");
  const loaded = loadDataset(serializeDataset(result.dataset));
  assert.ok(loaded.dataset);
  assert.deepEqual(loaded.dataset.entities, [{ id: "alice", name: "Alice", description: "Person" }]);
});

test("createRelation supports self and parallel Entity Relations without type", () => {
  const dataset = { version: "1.0", entities: [{ id: "a" }, { id: "b" }], events: [], relations: [] } as Dataset;
  const first = createRelation(dataset, { sourceId: "a", targetId: "b", name: "friend" }, () => "r1");
  assert.ok("relationId" in first);
  const second = createRelation(first.dataset, { sourceId: "a", targetId: "b" }, () => "r2");
  const self = createRelation(second.dataset, { sourceId: "a", targetId: "a" }, () => "r3");
  assert.ok("relationId" in self);
  assert.deepEqual(self.dataset.relations.map(({ id, sourceId, targetId, type }) => ({ id, sourceId, targetId, type })), [
    { id: "r1", sourceId: "a", targetId: "b", type: undefined },
    { id: "r2", sourceId: "a", targetId: "b", type: undefined },
    { id: "r3", sourceId: "a", targetId: "a", type: undefined },
  ]);
});

test("createRelation refuses missing, Event, and Relation endpoints without mutation", () => {
  const dataset = { version: "1.0", entities: [{ id: "a" }], events: [{ id: "v" }], relations: [{ id: "r", sourceId: "a", targetId: "a" }] } as Dataset;
  for (const draft of [{ sourceId: "", targetId: "a" }, { sourceId: "a", targetId: "v" }, { sourceId: "r", targetId: "a" }]) {
    const result = createRelation(dataset, draft);
    assert.ok("refusal" in result);
    assert.equal(result.dataset, dataset);
  }
});

test("relation deletion removes exactly one relation and preserves siblings", () => {
  const dataset = { version: "1.0", entities: [{ id: "a" }, { id: "b" }], events: [], relations: [{ id: "r1", sourceId: "a", targetId: "b" }, { id: "r2", sourceId: "a", targetId: "b" }], extensions: { opaque: { keep: "r1" } } } as Dataset;
  assert.deepEqual(assessRelationDeletion(dataset, "r1"), { ready: true });
  const result = deleteRelation(dataset, "r1");
  assert.ok(result.deleted);
  assert.deepEqual(result.dataset.relations.map(({ id }) => id), ["r2"]);
  assert.deepEqual(result.dataset.entities, dataset.entities);
  assert.deepEqual(result.dataset.extensions, dataset.extensions);
  assert.deepEqual(dataset.relations.map(({ id }) => id), ["r1", "r2"]);
});

test("relation deletion supports self relations and refuses stale IDs", () => {
  const dataset = { version: "1.0", entities: [{ id: "a" }], events: [], relations: [{ id: "self", sourceId: "a", targetId: "a" }] } as Dataset;
  assert.ok(deleteRelation(dataset, "self").deleted);
  const refused = deleteRelation(dataset, "missing");
  assert.equal(refused.deleted, false);
  assert.equal(refused.dataset, dataset);
});

test("entity deletion blocks every incident relation and counts self once", () => {
  const dataset = { version: "1.0", entities: [{ id: "a" }, { id: "b" }], events: [{ id: "v" }], relations: [{ id: "self", sourceId: "a", targetId: "a" }, { id: "event", sourceId: "v", targetId: "a" }, { id: "parallel", sourceId: "a", targetId: "b" }] } as Dataset;
  assert.deepEqual(assessEntityDeletion(dataset, "a"), { ready: false, reason: "entity_has_incident_relations", incidentRelationCount: 3 });
  const refused = deleteEntity(dataset, "a");
  assert.equal(refused.deleted, false);
  assert.equal(refused.dataset, dataset);
});

test("entity deletion removes only an unreferenced entity and preserves Dataset-level data", () => {
  const dataset = { version: "1.0", entities: [{ id: "a", extensions: { opaque: true } }, { id: "b" }], events: [], relations: [], extensions: { coordinate: { spaces: [{ id: "liaisonscape-graph" }] }, opaque: { ref: "a" } } } as Dataset;
  const result = deleteEntity(dataset, "a");
  assert.ok(result.deleted);
  assert.deepEqual(result.dataset.entities, [{ id: "b" }]);
  assert.deepEqual(result.dataset.extensions, dataset.extensions);
  assert.deepEqual(dataset.entities.map(({ id }) => id), ["a", "b"]);
});

test("A1: opens a valid minimal Dataset without inventing objects or coordinates", () => {
  const result = loadDataset(empty);
  assert.ok(result.dataset);
  assert.deepEqual(result.dataset?.entities, []);
  assert.deepEqual(result.dataset?.events, []);
  assert.deepEqual(result.dataset?.relations, []);
  assert.deepEqual(result.diagnostics, []);
});

test("Stage 4: new coordinate adoption creates only the LiaisonScape profile", () => {
  const dataset = { version: "1.0", entities: [{ id: "entity-1" }], events: [], relations: [] } as Dataset;
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } });
  const payload = (saved.extensions as Record<string, unknown>)["experimental.github.sukoyaka-dopeness.coordinate"] as Record<string, unknown>;
  const spaces = payload.spaces as Record<string, unknown>[];
  assert.deepEqual(spaces.map(({ id }) => id), [LIAISONSCAPE_SPACE_ID]);
  assert.equal((spaces[0]?.components as Record<string, Record<string, unknown>>).x.unit, "liaisonscape-user-unit");
});

test("A4: preserves invalid input while reporting validation diagnostics", () => {
  const raw = JSON.stringify({ version: "1.0", entities: [], events: [] });
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.equal(result.raw, raw);
  assert.ok(result.diagnostics.some(({ code }) => code === "relations_missing"));
});

test("A5: accepts and preserves unknown Extensions", () => {
  const dataset = JSON.parse(empty) as Record<string, unknown>;
  dataset.extensions = { "vendor.example": { opaque: [1, true, "value"] } };
  const result = loadDataset(JSON.stringify(dataset));
  assert.ok(result.dataset);
  assert.equal(result.diagnostics[0]?.severity, "warning");
  assert.deepEqual(result.dataset?.extensions, dataset.extensions);
});

test("preserves the target-reference research fixture through a save round trip", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/research/target-reference/roundtrip-opaque-record.json", import.meta.url),
    "utf8",
  );
  const original = JSON.parse(source);
  const result = loadDataset(source);

  assert.ok(result.dataset);
  assert.ok(result.diagnostics.some(({ code }) => code === "unknown_extension"));
  assert.deepEqual(JSON.parse(serializeDataset(result.dataset)), original);
});

test("preserves the unsupported Lineage Draft through LiaisonScape load, edit, and export", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/research/exploratory/fixtures/lineage-extension-candidate.json", import.meta.url),
    "utf8",
  );
  const original = JSON.parse(source) as Record<string, any>;
  const lineageId = "draft.github.sukoyaka-dopeness.lineage";
  original.extensions[lineageId].futureSentinel = { token: "preserve-me" };

  const loaded = loadDataset(JSON.stringify(original));
  assert.ok(loaded.dataset);
  assert.deepEqual(loaded.dataset.extensions?.[lineageId], original.extensions[lineageId]);

  const edited = updateEntityDetails(loaded.dataset, "open-e2r-2", {
    name: "Edited unrelated Entity name",
    description: "",
  });
  const saved = JSON.parse(serializeDataset(edited)) as Record<string, any>;
  assert.equal(saved.entities[0].name, "Edited unrelated Entity name");
  assert.deepEqual(saved.extensions[lineageId], original.extensions[lineageId]);
});

test("Validator 0.2.0 distinguishes undeclared and exactly declared Extension versions", () => {
  const undeclared = {
    version: "1.0",
    entities: [],
    events: [{ id: "event-1", extensions: { history: { time: { year: 2026 } } } }],
    relations: [],
    extensions: { metadata: { title: "Undeclared versions" } },
  };
  const undeclaredResult = loadDataset(JSON.stringify(undeclared));
  assert.ok(undeclaredResult.dataset);
  assert.deepEqual(
    undeclaredResult.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      {
        code: "extension_version_unspecified",
        path: "/extensions/metadata",
      },
      {
        code: "extension_version_unspecified",
        path: "/events/0/extensions/history",
      },
    ],
  );

  const specificationId = "draft.github.sukoyaka-dopeness.specification";
  const declared = structuredClone(undeclared) as typeof undeclared & {
    extensions: Record<string, unknown>;
  };
  declared.extensions[specificationId] = {
    specVersion: "0.1.0",
    uses: [
      { extension: "metadata", version: "1.0.0" },
      { extension: "history", version: "1.0.0" },
    ],
  };

  const declaredResult = loadDataset(JSON.stringify(declared));
  assert.ok(declaredResult.dataset);
  assert.deepEqual(declaredResult.diagnostics, []);
});

test("A16-A17: preserves Core and Extension data through a save round trip", () => {
  const dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Apollo 11", futureField: { keep: true } }],
    events: [],
    relations: [],
    extensions: {
      metadata: { title: "Example", futureField: ["keep"] },
      "vendor.example": { opaque: { keep: true } },
    },
  };
  const loaded = loadDataset(JSON.stringify(dataset));
  assert.ok(loaded.dataset);
  const saved = serializeDataset(loaded.dataset!);
  assert.deepEqual(JSON.parse(saved), dataset);
});

test("invalid JSON remains available for the caller to preserve", () => {
  const raw = "{ not valid JSON";
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.equal(result.raw, raw);
  assert.ok(result.parseError);
});

test("A19: validates the current Dataset before export and keeps warnings separate", () => {
  const dataset = JSON.parse(empty) as Record<string, unknown>;
  dataset.extensions = { "vendor.example": { keep: true } };
  const diagnostics = validateDatasetForExport(dataset as never);
  assert.equal(diagnostics[0]?.severity, "warning");
  assert.equal(validateDatasetForExport({ version: "1.0", entities: [], events: [] } as never)[0]?.severity, "error");
});

test("A10: rejects a Relation-to-Relation endpoint as a Core error", () => {
  const raw = JSON.stringify({ version: "1.0", entities: [{ id: "entity-1" }], events: [], relations: [
    { id: "relation-1", sourceId: "relation-2", targetId: "entity-1" },
    { id: "relation-2", sourceId: "entity-1", targetId: "entity-1" },
  ] });
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.ok(result.diagnostics.some(({ code }) => code === "relation_source_is_relation"));
});

test("A18: view state is not serialized into the interoperable Dataset", () => {
  const dataset = { version: "1.0", entities: [], events: [], relations: [] };
  const viewState = { zoom: 1.5, pan: { x: 20, y: 30 }, selectedId: "entity-1", panel: "detail" };
  const exported = JSON.parse(serializeDataset(dataset));
  assert.deepEqual(exported, dataset);
  assert.equal("viewState" in exported, false);
  assert.equal(viewState.selectedId, "entity-1");
});

test("Metadata title and Dataset ID are read without inventing missing values", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [], events: [], relations: [],
    extensions: { metadata: { datasetId: "dataset-1", title: "Example", unknown: true } },
  };
  assert.deepEqual(getDatasetMetadata(dataset), { datasetId: "dataset-1", title: "Example" });
  assert.deepEqual(
    getDatasetMetadata({ version: "1.0", entities: [], events: [], relations: [] }),
    { datasetId: null, title: null },
  );
  assert.deepEqual((dataset.extensions as Record<string, unknown>).metadata, {
    datasetId: "dataset-1",
    title: "Example",
    unknown: true,
  });
});

test("preserves opaque P1 Names research data through an unrelated Core edit and two saves", () => {
  const namesExtensionId = "research.fixture.p1-names";
  const original = {
    version: "1.0",
    entities: [
      {
        id: "entity-with-names",
        extensions: {
          [namesExtensionId]: {
            expressions: [
              { id: "name-ja", value: "東京", language: "ja", script: "Jpan", future: null },
              { id: "name-en", value: "Tokyo", language: "en", script: "Latn", future: { keep: true } },
              { id: "name-transliteration", value: "Tōkyō", language: "en", script: "Latn" },
            ],
            unknown: ["first", null, { nested: "keep" }],
          },
        },
      },
      { id: "unrelated-entity", name: "Unrelated" },
    ],
    events: [],
    relations: [],
  };
  const originalNames = structuredClone(original.entities[0]!.extensions![namesExtensionId]);

  const loaded = loadDataset(JSON.stringify(original));
  assert.ok(loaded.dataset);
  assert.ok(loaded.diagnostics.some(
    ({ code, path }) => code === "unknown_extension"
      && path === `/entities/0/extensions/${namesExtensionId}`,
  ));

  const edited = updateEntityDetails(loaded.dataset!, "unrelated-entity", {
    name: "Unrelated",
    description: "Unrelated Core edit",
  });
  const firstSave = serializeDataset(edited);
  const firstSavedDataset = JSON.parse(firstSave);
  const expected = structuredClone(original);
  expected.entities[1]!.description = "Unrelated Core edit";

  assert.deepEqual(firstSavedDataset, expected);
  assert.deepEqual(
    firstSavedDataset.entities[0].extensions[namesExtensionId],
    originalNames,
  );
  assert.deepEqual(
    firstSavedDataset.entities[0].extensions[namesExtensionId].expressions.map(
      ({ id, value, language, script, future }: Record<string, unknown>) => ({ id, value, language, script, future }),
    ),
    [
      { id: "name-ja", value: "東京", language: "ja", script: "Jpan", future: null },
      { id: "name-en", value: "Tokyo", language: "en", script: "Latn", future: { keep: true } },
      { id: "name-transliteration", value: "Tōkyō", language: "en", script: "Latn", future: undefined },
    ],
  );

  const reloaded = loadDataset(firstSave);
  assert.ok(reloaded.dataset);
  assert.deepEqual(
    (reloaded.dataset!.entities[0]!.extensions as Record<string, unknown>)[namesExtensionId],
    originalNames,
  );

  const secondSave = serializeDataset(reloaded.dataset!);
  assert.deepEqual(JSON.parse(secondSave), firstSavedDataset);
});
