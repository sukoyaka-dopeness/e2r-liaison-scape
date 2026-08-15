import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assessCoordinateDraftMigration,
  migrateCoordinatePrototypeToDraft,
  type CoordinateDraftMigrationRefusalCode,
} from "../src/coordinate-migration.ts";
import {
  COORDINATE_DRAFT_EXTENSION_ID,
  COORDINATE_EXTENSION_ID,
  applyStoredCoordinates,
  getStoredCoordinates,
  type Dataset,
} from "../src/dataset.ts";

const specificationId = "draft.github.sukoyaka-dopeness.specification";

function linkscapeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: "linkscape-graph",
    name: "Linkscape graph coordinates",
    kind: "cartesian-2d",
    components: {
      x: { unit: "linkscape-user-unit", positiveDirection: "display-right" },
      y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
    },
    ...overrides,
  };
}

function readyDataset(): Dataset {
  return {
    version: "1.0",
    entities: [{
      id: "entity-1",
      extensions: {
        [COORDINATE_EXTENSION_ID]: {
          coordinates: [{ spaceId: "linkscape-graph", values: { x: 10, y: 20 } }],
        },
      },
    }],
    events: [{
      id: "event-1",
      extensions: {
        [COORDINATE_EXTENSION_ID]: {
          coordinates: [{ spaceId: "linkscape-graph", values: { y: 30 } }],
        },
      },
    }],
    relations: [],
    extensions: {
      metadata: { title: "Migration profile" },
      [COORDINATE_EXTENSION_ID]: {
        formatVersion: "0.1.0",
        spaces: [linkscapeSpace()],
      },
      [specificationId]: {
        specVersion: "0.1.0",
        uses: [
          { extension: "metadata", version: "1.0.0" },
          { extension: COORDINATE_EXTENSION_ID, version: "0.1.0" },
        ],
      },
    },
  };
}

function assertRefusal(dataset: Dataset, code: CoordinateDraftMigrationRefusalCode) {
  const result = assessCoordinateDraftMigration(dataset);
  assert.equal(result.ready, false);
  if (!result.ready) assert.equal(result.code, code);
}

test("reports ready only for the exact Linkscape Prototype capability profile without mutation", () => {
  const dataset = readyDataset();
  const before = structuredClone(dataset);

  assert.deepEqual(assessCoordinateDraftMigration(dataset), { ready: true });
  assert.deepEqual(dataset, before);
});

test("browser verification fixture is migration-ready", async () => {
  const source = await readFile(
    new URL("../examples/coordinate-prototype-migration-ready.e2r.json", import.meta.url),
    "utf8",
  );
  const dataset = JSON.parse(source) as Dataset;
  assert.deepEqual(assessCoordinateDraftMigration(dataset), { ready: true });
  const result = migrateCoordinatePrototypeToDraft(dataset);
  assert.equal(result.migrated, true);
});

test("explicitly projects the complete supported layer to Draft and removes Prototype data", () => {
  const dataset = readyDataset();
  const before = structuredClone(dataset);
  const result = migrateCoordinatePrototypeToDraft(dataset);

  assert.equal(result.migrated, true);
  if (!result.migrated) return;
  assert.deepEqual(dataset, before);
  assert.equal((result.dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID], undefined);
  assert.deepEqual(
    (result.dataset.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
    {
      specVersion: "0.1.0",
      spaces: [linkscapeSpace()],
    },
  );
  assert.deepEqual(
    (result.dataset.entities[0]?.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
    { coordinates: [{ spaceId: "linkscape-graph", values: { x: 10, y: 20 } }] },
  );
  assert.equal(
    ((result.dataset.extensions as Record<string, unknown>)[specificationId] as Record<string, unknown>)
      .uses[1].extension,
    COORDINATE_DRAFT_EXTENSION_ID,
  );
  assert.deepEqual(getStoredCoordinates(result.dataset), { "entity-1": { x: 10, y: 20 } });
  assert.deepEqual(result.diagnostics, []);
});

test("migration refuses atomically when target validation fails", () => {
  const dataset = readyDataset();
  dataset.relations.push({ id: "invalid-relation", targetId: "entity-1" });
  const before = structuredClone(dataset);
  const result = migrateCoordinatePrototypeToDraft(dataset);

  assert.equal(result.migrated, false);
  if (result.migrated) return;
  assert.equal(result.readiness.code, "linkscape_coordinate_draft_migration_target_invalid");
  assert.deepEqual(dataset, before);
  assert.ok(result.diagnostics.some(({ severity }) => severity === "error"));
});

test("Linkscape Draft coordinates can be saved after explicit migration", () => {
  const result = migrateCoordinatePrototypeToDraft(readyDataset());
  assert.equal(result.migrated, true);
  if (!result.migrated) return;

  const saved = applyStoredCoordinates(result.dataset, { "entity-1": { x: 80, y: 90 } });
  const entityPayload = (saved.entities[0]?.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID] as Record<string, unknown>;
  assert.deepEqual(entityPayload.coordinates, [{
    spaceId: "linkscape-graph",
    values: { x: 80, y: 90 },
  }]);
  assert.equal((saved.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID], undefined);
  assert.deepEqual(getStoredCoordinates(saved), { "entity-1": { x: 80, y: 90 } });
});

test("refuses when no Dataset-level Prototype source exists", () => {
  const dataset = readyDataset();
  delete (dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID];
  assertRefusal(dataset, "linkscape_coordinate_draft_migration_no_source");
});

test("refuses an existing Draft occurrence before considering a merge", async () => {
  const source = await readFile(
    new URL(
      "../../e2r-spec/examples/coordinate/migration-refusal/existing-draft-payload.json",
      import.meta.url,
    ),
    "utf8",
  );
  assertRefusal(
    JSON.parse(source),
    "linkscape_coordinate_draft_migration_target_exists",
  );
});

test("refuses unknown Prototype fields without dropping or reinterpreting them", async () => {
  const source = await readFile(
    new URL(
      "../../e2r-spec/examples/coordinate/migration-refusal/unknown-prototype-field.json",
      import.meta.url,
    ),
    "utf8",
  );
  assertRefusal(
    JSON.parse(source),
    "linkscape_coordinate_draft_migration_unknown_source_field",
  );
});

test("refuses the cross-application demo atomically because it contains another Space", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/cross-application-demo.json", import.meta.url),
    "utf8",
  );
  const legacyDemo = JSON.parse(source);
  const coordinate = legacyDemo.extensions[COORDINATE_EXTENSION_ID];
  coordinate.spaces[0].id = "linkscape-graph";
  coordinate.spaces[0].name = "Linkscape graph coordinates";
  coordinate.spaces[0].components.x.unit = "linkscape-user-unit";
  coordinate.spaces[0].components.y.unit = "linkscape-user-unit";
  for (const object of [...legacyDemo.entities, ...legacyDemo.events]) {
    for (const entry of object.extensions?.[COORDINATE_EXTENSION_ID]?.coordinates ?? []) {
      if (entry.spaceId === "liaisonscape-graph") entry.spaceId = "linkscape-graph";
    }
  }
  const result = assessCoordinateDraftMigration(legacyDemo);
  assert.deepEqual(result, {
    ready: false,
    code: "linkscape_coordinate_draft_migration_space_unsupported",
    path: `/extensions/${COORDINATE_EXTENSION_ID}/spaces/1`,
  });
});

test("refuses external references because Linkscape has no exact external capability profile", () => {
  const dataset = readyDataset();
  const payload = (dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
  (payload.spaces as Record<string, unknown>[])[0] = linkscapeSpace({
    externalReference: { authority: "example", identifier: "graph-crs-1" },
  });
  assertRefusal(dataset, "linkscape_coordinate_draft_migration_external_reference_unsupported");
});

test("refuses bounds and periods that Linkscape does not implement exactly", () => {
  for (const unsupported of [{ minimum: 0 }, { maximum: 100 }, { period: 360 }]) {
    const dataset = readyDataset();
    const payload = (dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
    (payload.spaces as Record<string, unknown>[])[0] = linkscapeSpace({
      components: {
        x: {
          unit: "linkscape-user-unit",
          positiveDirection: "display-right",
          ...unsupported,
        },
        y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
      },
    });
    assertRefusal(dataset, "linkscape_coordinate_draft_migration_component_unsupported");
  }
});

test("refuses an incomplete or conflicting Specification declaration", () => {
  for (const uses of [
    [{ extension: "metadata", version: "1.0.0" }],
    [
      { extension: "metadata", version: "1.0.0" },
      { extension: COORDINATE_EXTENSION_ID, version: "9.0.0" },
    ],
  ]) {
    const dataset = readyDataset();
    ((dataset.extensions as Record<string, unknown>)[specificationId] as Record<string, unknown>).uses = uses;
    assertRefusal(dataset, "linkscape_coordinate_draft_migration_specification_unsupported");
  }
});
