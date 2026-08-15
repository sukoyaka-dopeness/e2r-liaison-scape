import test from "node:test";
import assert from "node:assert/strict";
import { COORDINATE_EXTENSION_ID, type Dataset } from "../src/dataset.ts";
import { assessLiaisonScapeSpaceMigration, migrateLinkscapeSpaceToLiaisonScape } from "../src/space-migration.ts";
import { migrateCoordinatePrototypeToDraft } from "../src/coordinate-migration.ts";

function dataset(): Dataset {
  return {
    version: "1.0",
    entities: [{ id: "e1", extensions: { [COORDINATE_EXTENSION_ID]: { coordinates: [{ spaceId: "linkscape-graph", values: { x: 1, y: 2 } }] } } }],
    events: [{ id: "v1", extensions: { [COORDINATE_EXTENSION_ID]: { coordinates: [{ spaceId: "linkscape-graph", values: { x: 3, y: 4 } }] } } }],
    relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: { formatVersion: "0.1.0", spaces: [{ id: "linkscape-graph", kind: "cartesian-2d", components: { x: { unit: "linkscape-user-unit", positiveDirection: "display-right" }, y: { unit: "linkscape-user-unit", positiveDirection: "display-down" } } }] } },
  };
}

test("Stage 5A migrates Prototype Space identity without changing Extension identity", () => {
  const source = dataset();
  assert.deepEqual(assessLiaisonScapeSpaceMigration(source), { ready: true });
  const result = migrateLinkscapeSpaceToLiaisonScape(source);
  assert.equal(result.migrated, true);
  if (!result.migrated) return;
  const payload = (result.dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
  assert.equal(payload.formatVersion, "0.1.0");
  assert.equal((payload.spaces as Record<string, unknown>[])[0]?.id, "liaisonscape-graph");
  assert.equal(((result.dataset.entities[0]?.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>).coordinates instanceof Array, true);
  assert.equal(((result.dataset.entities[0]?.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>).coordinates?.[0]?.spaceId, "liaisonscape-graph");
  assert.equal((source.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] !== payload, true);
});

test("Stage 5A refuses target coexistence atomically", () => {
  const source = dataset();
  const payload = (source.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
  payload.spaces = [...payload.spaces as unknown[], { id: "liaisonscape-graph", kind: "cartesian-2d", components: {} }];
  const result = migrateLinkscapeSpaceToLiaisonScape(source);
  assert.equal(result.migrated, false);
  if (result.migrated) return;
  assert.equal(result.readiness.code, "liaisonscape_space_migration_target_exists");
  assert.equal((payload.spaces as unknown[]).length, 2);
});

test("Stage 5A refuses same-object modern and oldest legacy representations", () => {
  const source = dataset();
  const extensions = source.entities[0]!.extensions as Record<string, unknown>;
  extensions.coordinate = { positions: [{ spaceId: "linkscape", x: 1, y: 2 }] };
  const result = migrateLinkscapeSpaceToLiaisonScape(source);
  assert.equal(result.migrated, false);
  if (!result.migrated) assert.equal(result.readiness.code, "liaisonscape_space_migration_legacy_conflict");
});

test("Stage 5A migration orders converge on Draft plus the canonical Space", () => {
  const pathA = migrateLinkscapeSpaceToLiaisonScape(dataset());
  assert.equal(pathA.migrated, true);
  if (!pathA.migrated) return;
  const draftA = migrateCoordinatePrototypeToDraft(pathA.dataset);
  assert.equal(draftA.migrated, true);

  const draftB = migrateCoordinatePrototypeToDraft(dataset());
  assert.equal(draftB.migrated, true);
  if (!draftB.migrated) return;
  const pathB = migrateLinkscapeSpaceToLiaisonScape(draftB.dataset);
  assert.equal(pathB.migrated, true);
  if (!pathB.migrated || !draftA.migrated) return;
  const payloadA = (draftA.dataset.extensions as Record<string, unknown>)["draft.github.sukoyaka-dopeness.coordinate"] as Record<string, unknown>;
  const payloadB = (pathB.dataset.extensions as Record<string, unknown>)["draft.github.sukoyaka-dopeness.coordinate"] as Record<string, unknown>;
  assert.equal(payloadA.specVersion, "0.1.0");
  assert.equal(payloadB.specVersion, "0.1.0");
  assert.equal((payloadA.spaces as Record<string, unknown>[])[0]?.id, "liaisonscape-graph");
  assert.equal((payloadB.spaces as Record<string, unknown>[])[0]?.id, "liaisonscape-graph");
});
