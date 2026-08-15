import {
  COORDINATE_DRAFT_EXTENSION_ID,
  COORDINATE_EXTENSION_ID,
  COORDINATE_FORMAT_VERSION,
  LIAISONSCAPE_SPACE_ID,
  LEGACY_LINKSCAPE_SPACE_ID,
  type Dataset,
  type Diagnostic,
  validateDatasetForExport,
} from "./dataset.ts";

export type SpaceMigrationCode =
  | "liaisonscape_space_migration_no_source"
  | "liaisonscape_space_migration_layer_unsupported"
  | "liaisonscape_space_migration_source_invalid"
  | "liaisonscape_space_migration_target_exists"
  | "liaisonscape_space_migration_duplicate_coordinate"
  | "liaisonscape_space_migration_legacy_conflict"
  | "liaisonscape_space_migration_target_invalid";

export type SpaceMigrationResult =
  | { migrated: true; dataset: Dataset; diagnostics: Diagnostic[] }
  | { migrated: false; readiness: { ready: false; code: SpaceMigrationCode; path: string }; diagnostics: Diagnostic[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const refuse = (code: SpaceMigrationCode, path: string, diagnostics: Diagnostic[] = []): SpaceMigrationResult => ({ migrated: false, readiness: { ready: false, code, path }, diagnostics });

function layer(dataset: Dataset): { id: string; versionField: "formatVersion" | "specVersion"; version: string; payload: Record<string, unknown> } | null {
  const extensions = isRecord(dataset.extensions) ? dataset.extensions : {};
  const prototype = extensions[COORDINATE_EXTENSION_ID];
  if (isRecord(prototype) && prototype.formatVersion === COORDINATE_FORMAT_VERSION) return { id: COORDINATE_EXTENSION_ID, versionField: "formatVersion", version: "formatVersion", payload: prototype };
  const draft = extensions[COORDINATE_DRAFT_EXTENSION_ID];
  if (isRecord(draft) && draft.specVersion === COORDINATE_FORMAT_VERSION) return { id: COORDINATE_DRAFT_EXTENSION_ID, versionField: "specVersion", version: "specVersion", payload: draft };
  return null;
}

function migrate(dataset: Dataset): SpaceMigrationResult {
  const selected = layer(dataset);
  if (!selected || !Array.isArray(selected.payload.spaces)) return refuse("liaisonscape_space_migration_layer_unsupported", "/extensions");
  const spaces = selected.payload.spaces as unknown[];
  const oldSpaces = spaces.filter((space) => isRecord(space) && space.id === LEGACY_LINKSCAPE_SPACE_ID);
  const newSpaces = spaces.filter((space) => isRecord(space) && space.id === LIAISONSCAPE_SPACE_ID);
  if (oldSpaces.length === 0) return refuse("liaisonscape_space_migration_no_source", `/extensions/${selected.id}/spaces`);
  if (oldSpaces.length !== 1) return refuse("liaisonscape_space_migration_source_invalid", `/extensions/${selected.id}/spaces`);
  if (newSpaces.length > 0) return refuse("liaisonscape_space_migration_target_exists", `/extensions/${selected.id}/spaces`);
  const source = oldSpaces[0];
  if (!isRecord(source) || source.kind !== "cartesian-2d" || !isRecord(source.components)
    || !isRecord(source.components.x) || source.components.x.unit !== "linkscape-user-unit" || source.components.x.positiveDirection !== "display-right"
    || !isRecord(source.components.y) || source.components.y.unit !== "linkscape-user-unit" || source.components.y.positiveDirection !== "display-down") {
    return refuse("liaisonscape_space_migration_source_invalid", `/extensions/${selected.id}/spaces`);
  }
  const collections = ["entities", "events"] as const;
  for (const collection of collections) for (const [index, object] of dataset[collection].entries()) {
    const extensions = isRecord(object.extensions) ? object.extensions : {};
    const payload = extensions[selected.id];
    const legacy = isRecord(extensions.coordinate) && Array.isArray(extensions.coordinate.positions)
      && extensions.coordinate.positions.some((value) => isRecord(value) && value.spaceId === "linkscape");
    if (legacy && isRecord(payload) && Array.isArray(payload.coordinates) && payload.coordinates.some((value) => isRecord(value) && value.spaceId === LEGACY_LINKSCAPE_SPACE_ID)) return refuse("liaisonscape_space_migration_legacy_conflict", `/${collection}/${index}/extensions`);
    if (!isRecord(payload) || !Array.isArray(payload.coordinates)) continue;
    const matches = payload.coordinates.filter((value) => isRecord(value) && value.spaceId === LEGACY_LINKSCAPE_SPACE_ID);
    if (matches.length > 1) return refuse("liaisonscape_space_migration_duplicate_coordinate", `/${collection}/${index}/extensions/${selected.id}/coordinates`);
  }
  const copy = structuredClone(dataset) as Dataset;
  const targetPayload = (copy.extensions as Record<string, unknown>)[selected.id] as Record<string, unknown>;
  const targetSpaces = spaces.filter((space) => !(isRecord(space) && space.id === LEGACY_LINKSCAPE_SPACE_ID));
  targetSpaces.push({ ...source, id: LIAISONSCAPE_SPACE_ID, name: "LiaisonScape graph coordinates", components: { ...(source.components as Record<string, unknown>), x: { ...(source.components as Record<string, Record<string, unknown>>).x, unit: "liaisonscape-user-unit" }, y: { ...(source.components as Record<string, Record<string, unknown>>).y, unit: "liaisonscape-user-unit" } } });
  targetPayload.spaces = targetSpaces;
  for (const collection of collections) copy[collection] = copy[collection].map((object) => {
    const extensions = isRecord(object.extensions) ? object.extensions : {};
    const payload = extensions[selected.id];
    if (!isRecord(payload) || !Array.isArray(payload.coordinates)) return object;
    return { ...object, extensions: { ...extensions, [selected.id]: { ...payload, coordinates: payload.coordinates.map((value) => isRecord(value) && value.spaceId === LEGACY_LINKSCAPE_SPACE_ID ? { ...value, spaceId: LIAISONSCAPE_SPACE_ID } : value) } } };
  });
  const diagnostics = validateDatasetForExport(copy);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return refuse("liaisonscape_space_migration_target_invalid", "/", diagnostics);
  return { migrated: true, dataset: copy, diagnostics };
}

export function assessLiaisonScapeSpaceMigration(dataset: Dataset): { ready: true } | { ready: false; code: SpaceMigrationCode; path: string } {
  const result = migrate(dataset);
  return result.migrated ? { ready: true } : result.readiness;
}

export function migrateLinkscapeSpaceToLiaisonScape(dataset: Dataset): SpaceMigrationResult {
  return migrate(dataset);
}
