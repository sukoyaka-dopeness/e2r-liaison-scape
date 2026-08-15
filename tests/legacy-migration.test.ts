import test from "node:test";
import assert from "node:assert/strict";
import { COORDINATE_EXTENSION_ID, type Dataset } from "../src/dataset.ts";
import { migrateLegacyLinkscapeCoordinatesToLiaisonScape } from "../src/legacy-migration.ts";

test("Stage 5B migrates exact legacy Entity positions into a new Prototype canonical profile", () => {
  const source: Dataset = { version: "1.0", entities: [{ id: "e1", extensions: { coordinate: { positions: [{ spaceId: "linkscape", x: 8, y: 9 }, { spaceId: "other", x: 1, y: 2 }], future: true } } }], events: [], relations: [] };
  const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(source);
  assert.equal(result.migrated, true);
  if (!result.migrated) return;
  const entity = result.dataset.entities[0]!;
  const legacy = (entity.extensions as Record<string, unknown>).coordinate as Record<string, unknown>;
  assert.deepEqual(legacy.positions, [{ spaceId: "other", x: 1, y: 2 }]);
  assert.equal(legacy.future, true);
  const payload = (result.dataset.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
  assert.equal((payload.spaces as Record<string, unknown>[])[0]?.id, "liaisonscape-graph");
  assert.deepEqual(((entity.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>).coordinates, [{ spaceId: "liaisonscape-graph", values: { x: 8, y: 9 } }]);
});

test("Stage 5B refuses modern profile collisions and duplicate legacy positions", () => {
  const source: Dataset = { version: "1.0", entities: [{ id: "e1", extensions: { coordinate: { positions: [{ spaceId: "linkscape", x: 1, y: 2 }, { spaceId: "linkscape", x: 1, y: 2 }] } } }], events: [], relations: [] };
  const duplicate = migrateLegacyLinkscapeCoordinatesToLiaisonScape(source);
  assert.equal(duplicate.migrated, false);
  const collision: Dataset = { ...source, entities: [{ id: "e1", extensions: { coordinate: { positions: [{ spaceId: "linkscape", x: 1, y: 2 }] }, [COORDINATE_EXTENSION_ID]: { formatVersion: "0.1.0", spaces: [{ id: "linkscape-graph" }] } } }] };
  const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(collision);
  assert.equal(result.migrated, false);
});

test("Stage 5B refuses an unwritable Draft instead of creating Prototype beside it", () => {
  const source: Dataset = { version: "1.0", entities: [{ id: "e1", extensions: { coordinate: { positions: [{ spaceId: "linkscape", x: 1, y: 2 }] } } }], events: [], relations: [], extensions: { "draft.github.sukoyaka-dopeness.coordinate": { specVersion: "0.1.0", spaces: "not-an-array" } } };
  const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(source);
  assert.equal(result.migrated, false);
  assert.equal((result as { readiness?: { code: string } }).readiness?.code, "legacy_coordinate_migration_source_invalid");
});

test("Stage 5B refuses malformed Specification declarations", () => {
  const source: Dataset = { version: "1.0", entities: [{ id: "e1", extensions: { coordinate: { positions: [{ spaceId: "linkscape", x: 1, y: 2 }] } } }], events: [], relations: [], extensions: { "draft.github.sukoyaka-dopeness.specification": { specVersion: "0.0.0", uses: [] } } };
  const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(source);
  assert.equal(result.migrated, false);
});
