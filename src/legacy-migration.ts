import { COORDINATE_DRAFT_EXTENSION_ID, COORDINATE_EXTENSION_ID, COORDINATE_FORMAT_VERSION, LIAISONSCAPE_SPACE_ID, type Dataset, type Diagnostic, validateDatasetForExport } from "./dataset.ts";

export type LegacyMigrationCode = "legacy_coordinate_migration_no_source" | "legacy_coordinate_migration_source_invalid" | "legacy_coordinate_migration_modern_collision" | "legacy_coordinate_migration_layer_collision" | "legacy_coordinate_migration_target_invalid";
export type LegacyMigrationResult = { migrated: true; dataset: Dataset; diagnostics: Diagnostic[] } | { migrated: false; readiness: { ready: false; code: LegacyMigrationCode; path: string }; diagnostics: Diagnostic[] };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const refuse = (code: LegacyMigrationCode, path: string, diagnostics: Diagnostic[] = []): LegacyMigrationResult => ({ migrated: false, readiness: { ready: false, code, path }, diagnostics });
const canonicalSpace = { id: LIAISONSCAPE_SPACE_ID, name: "LiaisonScape graph coordinates", kind: "cartesian-2d", components: { x: { unit: "liaisonscape-user-unit", positiveDirection: "display-right" }, y: { unit: "liaisonscape-user-unit", positiveDirection: "display-down" } } };

function writableDraft(dataset: Dataset, payload: Record<string, unknown>): boolean {
  if (payload.specVersion !== COORDINATE_FORMAT_VERSION || !Array.isArray(payload.spaces)) return false;
  const ids = payload.spaces.filter(isRecord).map((space) => space.id).filter((id): id is string => typeof id === "string");
  if (new Set(ids).size !== ids.length || ids.some((id) => id === "linkscape-graph" || id === LIAISONSCAPE_SPACE_ID)) return false;
  for (const object of [...dataset.entities, ...dataset.events, ...dataset.relations]) {
    const extensions = isRecord(object.extensions) ? object.extensions : {};
    const occurrence = extensions[COORDINATE_DRAFT_EXTENSION_ID];
    if (occurrence === undefined) continue;
    if (object.id && dataset.relations.includes(object)) return false;
    if (!isRecord(occurrence) || !Array.isArray(occurrence.coordinates)) return false;
    if (occurrence.coordinates.some((value) => !isRecord(value) || typeof value.spaceId !== "string")) return false;
  }
  const specification = extensionsOf(dataset)["draft.github.sukoyaka-dopeness.specification"];
  if (specification !== undefined && (!isRecord(specification) || specification.specVersion !== "0.1.0" || !Array.isArray(specification.uses))) return false;
  return true;
}

function extensionsOf(dataset: Dataset): Record<string, unknown> { return isRecord(dataset.extensions) ? dataset.extensions : {}; }

export function assessLegacyLinkscapeCoordinateMigration(dataset: Dataset): { ready: true } | { ready: false; code: LegacyMigrationCode; path: string } {
  const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(dataset);
  return result.migrated ? { ready: true } : result.readiness;
}

export function migrateLegacyLinkscapeCoordinatesToLiaisonScape(dataset: Dataset): LegacyMigrationResult {
  const sources: Array<{ index: number; position: Record<string, unknown> }> = [];
  for (const [index, entity] of dataset.entities.entries()) {
    const extensions = isRecord(entity.extensions) ? entity.extensions : {};
    const legacy = extensions.coordinate;
    if (!isRecord(legacy) || !Array.isArray(legacy.positions)) continue;
    const matches = legacy.positions.filter((value) => isRecord(value) && value.spaceId === "linkscape");
    if (matches.length > 1) return refuse("legacy_coordinate_migration_source_invalid", `/entities/${index}/extensions/coordinate/positions`);
    if (matches.length === 1) {
      const position = matches[0] as Record<string, unknown>;
      if (Object.keys(position).some((key) => !["spaceId", "x", "y"].includes(key)) || typeof position.x !== "number" || !Number.isFinite(position.x) || typeof position.y !== "number" || !Number.isFinite(position.y)) return refuse("legacy_coordinate_migration_source_invalid", `/entities/${index}/extensions/coordinate/positions`);
      sources.push({ index, position });
    }
  }
  for (const [index, object] of [...dataset.events, ...dataset.relations].entries()) {
    const extensions = isRecord(object.extensions) ? object.extensions : {};
    const legacy = extensions.coordinate;
    if (isRecord(legacy) && Array.isArray(legacy.positions) && legacy.positions.some((value) => isRecord(value) && value.spaceId === "linkscape")) return refuse("legacy_coordinate_migration_source_invalid", `/events-or-relations/${index}/extensions/coordinate/positions`);
  }
  if (sources.length === 0) return refuse("legacy_coordinate_migration_no_source", "/entities");
  const extensions: Record<string, unknown> = isRecord(dataset.extensions) ? dataset.extensions : {};
  const specification = extensions["draft.github.sukoyaka-dopeness.specification"];
  if (specification !== undefined && (!isRecord(specification) || specification.specVersion !== "0.1.0" || !Array.isArray(specification.uses))) return refuse("legacy_coordinate_migration_source_invalid", "/extensions/draft.github.sukoyaka-dopeness.specification");
  for (const id of [COORDINATE_EXTENSION_ID, COORDINATE_DRAFT_EXTENSION_ID]) {
    const payload = extensions[id];
    if (!isRecord(payload) || !Array.isArray(payload.spaces)) continue;
    if (payload.spaces.some((space) => isRecord(space) && (space.id === "linkscape-graph" || space.id === LIAISONSCAPE_SPACE_ID))) return refuse("legacy_coordinate_migration_modern_collision", `/extensions/${id}/spaces`);
  }
  for (const object of [...dataset.entities, ...dataset.events, ...dataset.relations]) {
    const objectExtensions = isRecord(object.extensions) ? object.extensions : {};
    for (const id of [COORDINATE_EXTENSION_ID, COORDINATE_DRAFT_EXTENSION_ID]) {
      const payload = objectExtensions[id];
      if (isRecord(payload) && Array.isArray(payload.spaces) && payload.spaces.some((space) => isRecord(space) && (space.id === "linkscape-graph" || space.id === LIAISONSCAPE_SPACE_ID))) return refuse("legacy_coordinate_migration_modern_collision", "/objects/extensions");
      if (isRecord(payload) && Array.isArray(payload.coordinates) && payload.coordinates.some((value) => isRecord(value) && (value.spaceId === "linkscape-graph" || value.spaceId === LIAISONSCAPE_SPACE_ID))) return refuse("legacy_coordinate_migration_modern_collision", "/objects/extensions");
    }
  }
  const copy = structuredClone(dataset) as Dataset;
  copy.extensions = isRecord(copy.extensions) ? copy.extensions : {};
  const draftPayload = extensions[COORDINATE_DRAFT_EXTENSION_ID];
  if (draftPayload !== undefined && (!isRecord(draftPayload) || !writableDraft(dataset, draftPayload))) return refuse("legacy_coordinate_migration_source_invalid", `/extensions/${COORDINATE_DRAFT_EXTENSION_ID}`);
  const targetId = isRecord(draftPayload) ? COORDINATE_DRAFT_EXTENSION_ID : COORDINATE_EXTENSION_ID;
  const copyExtensions = copy.extensions as Record<string, unknown>;
  const target = isRecord(copyExtensions[targetId]) ? copyExtensions[targetId] as Record<string, unknown> : { [targetId === COORDINATE_DRAFT_EXTENSION_ID ? "specVersion" : "formatVersion"]: COORDINATE_FORMAT_VERSION, spaces: [] };
  if (!Array.isArray(target.spaces)) return refuse("legacy_coordinate_migration_source_invalid", `/extensions/${targetId}`);
  target.spaces = [...target.spaces, canonicalSpace];
  (copy.extensions as Record<string, unknown>)[targetId] = target;
  for (const { index } of sources) {
    const entity = copy.entities[index];
    const extensionsForEntity = isRecord(entity.extensions) ? entity.extensions : {};
    const legacy = extensionsForEntity.coordinate as Record<string, unknown>;
    const positions = (legacy.positions as unknown[]).filter((value) => !(isRecord(value) && value.spaceId === "linkscape"));
    const nextLegacy = { ...legacy, positions };
    if (positions.length === 0) delete (nextLegacy as Record<string, unknown>).positions;
    const targetPayload = isRecord(extensionsForEntity[targetId]) ? extensionsForEntity[targetId] as Record<string, unknown> : {};
    const coordinates = Array.isArray(targetPayload.coordinates) ? targetPayload.coordinates : [];
    const source = sources.find((item) => item.index === index)!.position;
    const nextExtensions = { ...extensionsForEntity, [targetId]: { ...targetPayload, coordinates: [...coordinates, { spaceId: LIAISONSCAPE_SPACE_ID, values: { x: source.x, y: source.y } }] } };
    if (Object.keys(nextLegacy).some((key) => key !== "positions" || (nextLegacy.positions as unknown[]).length > 0)) nextExtensions.coordinate = nextLegacy; else delete nextExtensions.coordinate;
    copy.entities[index] = { ...entity, extensions: nextExtensions };
  }
  const diagnostics = validateDatasetForExport(copy);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return refuse("legacy_coordinate_migration_target_invalid", "/", diagnostics);
  return { migrated: true, dataset: copy, diagnostics };
}
