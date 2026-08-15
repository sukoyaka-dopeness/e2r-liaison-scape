import type { CoreObjectDraft, Dataset, DeletionAssessment, DeletionResult, Diagnostic, E2RObject, IdCandidateGenerator, LoadResult, RelationCreationResult } from "./models";
export type { CoreObjectDraft, Dataset, DeletionAssessment, DeletionResult, Diagnostic, E2RObject, IdCandidateGenerator, LoadResult, RelationCreationResult } from "./models";


export { isCoreObjectIdTaken, createCoreObjectId } from "./services/IdentifierService.ts";
export { createEntity, assessEntityDeletion, deleteEntity } from "./services/EntityService.ts";
export { createRelation, assessRelationDeletion, deleteRelation } from "./services/RelationService.ts";
export { getEntityDetail, updateEntityDetails } from "./services/EntityService.ts";
export { getRelationDetail, updateRelationDetails } from "./services/RelationService.ts";

export { loadDataset, serializeDataset, validateDatasetForExport, getDatasetMetadata } from "./services/DatasetService.ts";

export type GraphNode = { id: string; label: string; description: string; x: number; y: number };
export type GraphEdge = { id: string; sourceId: string; targetId: string; parallelIndex: number; parallelCount: number };
export type Coordinate = { x: number; y: number };

export const COORDINATE_EXTENSION_ID = "experimental.github.sukoyaka-dopeness.coordinate";
export const COORDINATE_FORMAT_VERSION = "0.1.0";
export const COORDINATE_DRAFT_EXTENSION_ID = "draft.github.sukoyaka-dopeness.coordinate";
export const LIAISONSCAPE_SPACE_ID = "liaisonscape-graph";
export const LIAISONSCAPE_USER_UNIT = "liaisonscape-user-unit";
export const LEGACY_LINKSCAPE_SPACE_ID = "linkscape-graph";
export const LEGACY_LINKSCAPE_USER_UNIT = "linkscape-user-unit";
/** @deprecated Use LEGACY_LINKSCAPE_SPACE_ID when referring to persisted legacy data. */
export const LINKSCAPE_SPACE_ID = LEGACY_LINKSCAPE_SPACE_ID;
const SPECIFICATION_EXTENSION_ID = "draft.github.sukoyaka-dopeness.specification";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is Coordinate {
  return isRecord(value)
    && typeof value.x === "number"
    && Number.isFinite(value.x)
    && typeof value.y === "number"
    && Number.isFinite(value.y);
}

function spaceDefinition(spaceId: string, unit: string, existing?: Record<string, unknown>): Record<string, unknown> {
  const existingComponents = isRecord(existing?.components) ? existing.components : {};
  const existingX = isRecord(existingComponents.x) ? existingComponents.x : {};
  const existingY = isRecord(existingComponents.y) ? existingComponents.y : {};
  return {
    ...existing,
    id: spaceId,
    name: spaceId === LIAISONSCAPE_SPACE_ID ? "LiaisonScape graph coordinates" : "Linkscape graph coordinates",
    kind: "cartesian-2d",
    components: {
      ...existingComponents,
      x: { ...existingX, unit, positiveDirection: "display-right" },
      y: { ...existingY, unit, positiveDirection: "display-down" },
    },
  };
}

function isCompatibleSpace(space: unknown, spaceId: string, unit: string): space is Record<string, unknown> {
  if (!isRecord(space) || space.id !== spaceId || space.kind !== "cartesian-2d" || !isRecord(space.components)) return false;
  const x = space.components.x;
  const y = space.components.y;
  return isRecord(x)
    && x.unit === unit
    && x.positiveDirection === "display-right"
    && isRecord(y)
    && y.unit === unit
    && y.positiveDirection === "display-down";
}

function hasSupportedSpace(
  dataset: Dataset,
  spaceId: string,
  unit: string,
  extensionId = COORDINATE_EXTENSION_ID,
  versionField: "formatVersion" | "specVersion" = "formatVersion",
): boolean {
  if (!isRecord(dataset.extensions)) return false;
  const payload = dataset.extensions[extensionId];
  if (!isRecord(payload) || payload[versionField] !== COORDINATE_FORMAT_VERSION || !Array.isArray(payload.spaces)) return false;
  const space = payload.spaces.find((candidate) => isRecord(candidate) && candidate.id === spaceId);
  return isCompatibleSpace(space, spaceId, unit);
}

function hasSupportedLinkscapeSpace(dataset: Dataset, extensionId = COORDINATE_EXTENSION_ID, versionField: "formatVersion" | "specVersion" = "formatVersion") {
  return hasSupportedSpace(dataset, LEGACY_LINKSCAPE_SPACE_ID, LEGACY_LINKSCAPE_USER_UNIT, extensionId, versionField);
}

function hasSupportedLiaisonScapeSpace(dataset: Dataset, extensionId = COORDINATE_EXTENSION_ID, versionField: "formatVersion" | "specVersion" = "formatVersion") {
  return hasSupportedSpace(dataset, LIAISONSCAPE_SPACE_ID, LIAISONSCAPE_USER_UNIT, extensionId, versionField);
}

function writableSpaceId(dataset: Dataset, extensionId: string): string | null {
  const payload = isRecord(dataset.extensions) ? dataset.extensions[extensionId] : undefined;
  const spaces = isRecord(payload) && Array.isArray(payload.spaces) ? payload.spaces : [];
  const hasNew = spaces.some((space) => isRecord(space) && space.id === LIAISONSCAPE_SPACE_ID);
  const hasOld = spaces.some((space) => isRecord(space) && space.id === LEGACY_LINKSCAPE_SPACE_ID);
  if (hasNew && hasOld) return null;
  return hasNew ? LIAISONSCAPE_SPACE_ID : hasOld ? LEGACY_LINKSCAPE_SPACE_ID : LIAISONSCAPE_SPACE_ID;
}

function spaceUnit(spaceId: string): string {
  return spaceId === LIAISONSCAPE_SPACE_ID ? LIAISONSCAPE_USER_UNIT : LEGACY_LINKSCAPE_USER_UNIT;
}

function isCompatibleLinkscapeSpace(space: unknown): space is Record<string, unknown> {
  return isCompatibleSpace(space, LEGACY_LINKSCAPE_SPACE_ID, LEGACY_LINKSCAPE_USER_UNIT);
}

function linkscapeSpaceDefinition(existing?: Record<string, unknown>): Record<string, unknown> {
  return spaceDefinition(LEGACY_LINKSCAPE_SPACE_ID, LEGACY_LINKSCAPE_USER_UNIT, existing);
}

function getPrototypeCoordinate(entity: E2RObject): Coordinate | null {
  if (!isRecord(entity.extensions)) return null;
  const payload = entity.extensions[COORDINATE_EXTENSION_ID];
  if (!isRecord(payload) || !Array.isArray(payload.coordinates)) return null;
  const coordinate = payload.coordinates.find((candidate) => isRecord(candidate) && candidate.spaceId === LINKSCAPE_SPACE_ID);
  if (!isRecord(coordinate) || !isRecord(coordinate.values) || !isCoordinate(coordinate.values)) return null;
  return { x: coordinate.values.x, y: coordinate.values.y };
}

function getPrototypeCoordinateForSpace(entity: E2RObject, spaceId: string): Coordinate | null {
  if (!isRecord(entity.extensions)) return null;
  const payload = entity.extensions[COORDINATE_EXTENSION_ID];
  if (!isRecord(payload) || !Array.isArray(payload.coordinates)) return null;
  const coordinate = payload.coordinates.find((candidate) => isRecord(candidate) && candidate.spaceId === spaceId);
  if (!isRecord(coordinate) || !isRecord(coordinate.values) || !isCoordinate(coordinate.values)) return null;
  return { x: coordinate.values.x, y: coordinate.values.y };
}

function getDraftCoordinate(entity: E2RObject): Coordinate | null {
  if (!isRecord(entity.extensions)) return null;
  const payload = entity.extensions[COORDINATE_DRAFT_EXTENSION_ID];
  if (!isRecord(payload) || !Array.isArray(payload.coordinates)) return null;
  const coordinate = payload.coordinates.find((candidate) => isRecord(candidate) && candidate.spaceId === LINKSCAPE_SPACE_ID);
  if (!isRecord(coordinate) || !isRecord(coordinate.values) || !isCoordinate(coordinate.values)) return null;
  return { x: coordinate.values.x, y: coordinate.values.y };
}

function getDraftCoordinateForSpace(entity: E2RObject, spaceId: string): Coordinate | null {
  if (!isRecord(entity.extensions)) return null;
  const payload = entity.extensions[COORDINATE_DRAFT_EXTENSION_ID];
  if (!isRecord(payload) || !Array.isArray(payload.coordinates)) return null;
  const coordinate = payload.coordinates.find((candidate) => isRecord(candidate) && candidate.spaceId === spaceId);
  if (!isRecord(coordinate) || !isRecord(coordinate.values) || !isCoordinate(coordinate.values)) return null;
  return { x: coordinate.values.x, y: coordinate.values.y };
}

function getLegacyCoordinate(entity: E2RObject): Coordinate | null {
  if (!isRecord(entity.extensions)) return null;
  const payload = entity.extensions.coordinate;
  if (!isRecord(payload) || !Array.isArray(payload.positions)) return null;
  const position = payload.positions.find((value) => isRecord(value) && value.spaceId === "linkscape" && isCoordinate(value))
    ?? payload.positions.find(isCoordinate);
  return position ? { x: position.x, y: position.y } : null;
}

export function getStoredCoordinates(dataset: Dataset): Record<string, Coordinate> {
  const result: Record<string, Coordinate> = {};
  const canReadCanonicalPrototype = hasSupportedLiaisonScapeSpace(dataset);
  const canReadPrototype = hasSupportedLinkscapeSpace(dataset);
  const canReadCanonicalDraft = hasSupportedLiaisonScapeSpace(dataset, COORDINATE_DRAFT_EXTENSION_ID, "specVersion");
  const canReadDraft = hasSupportedLinkscapeSpace(dataset, COORDINATE_DRAFT_EXTENSION_ID, "specVersion");
  if ((canReadCanonicalPrototype && canReadPrototype) || (canReadCanonicalDraft && canReadDraft)) return result;
  for (const entity of dataset.entities) {
    const position = (canReadCanonicalDraft ? getDraftCoordinateForSpace(entity, LIAISONSCAPE_SPACE_ID) : null)
      ?? (canReadDraft ? getDraftCoordinate(entity) : null)
      ?? (canReadCanonicalPrototype ? getPrototypeCoordinateForSpace(entity, LIAISONSCAPE_SPACE_ID) : null)
      ?? (canReadPrototype ? getPrototypeCoordinate(entity) : null)
      ?? getLegacyCoordinate(entity);
    if (position) result[entity.id] = position;
  }
  return result;
}

function collectExtensionIdentifiers(dataset: Dataset): Set<string> {
  const identifiers = new Set<string>();
  const visit = (value: unknown) => {
    if (!isRecord(value) || !isRecord(value.extensions)) return;
    for (const identifier of Object.keys(value.extensions)) identifiers.add(identifier);
  };
  visit(dataset);
  for (const entity of dataset.entities) visit(entity);
  for (const event of dataset.events) visit(event);
  for (const relation of dataset.relations) visit(relation);
  return identifiers;
}

function canSafelyWriteCoordinatePrototype(dataset: Dataset, positions: Record<string, Coordinate>): boolean {
  const targetSpaceId = writableSpaceId(dataset, COORDINATE_EXTENSION_ID);
  if (!targetSpaceId) return false;
  if (targetSpaceId === LIAISONSCAPE_SPACE_ID && Object.values(dataset.entities).some((entity) => getLegacyCoordinate(entity))) return false;
  if (collectExtensionIdentifiers(dataset).has(COORDINATE_DRAFT_EXTENSION_ID)) return false;

  const datasetExtensions = isRecord(dataset.extensions) ? dataset.extensions : {};
  const hasDatasetPayload = COORDINATE_EXTENSION_ID in datasetExtensions;
  const existingPayload = datasetExtensions[COORDINATE_EXTENSION_ID];

  if (!hasDatasetPayload) {
    return ![...dataset.entities, ...dataset.events, ...dataset.relations].some(
      (object) => isRecord(object.extensions) && COORDINATE_EXTENSION_ID in object.extensions,
    );
  }
  if (!isRecord(existingPayload)
    || existingPayload.formatVersion !== COORDINATE_FORMAT_VERSION
    || !Array.isArray(existingPayload.spaces)) return false;

  const matchingSpaces = existingPayload.spaces.filter(
    (candidate) => isRecord(candidate) && candidate.id === targetSpaceId,
  );
  if (matchingSpaces.length > 1) return false;
  if (matchingSpaces.length === 1 && !isCompatibleSpace(matchingSpaces[0], targetSpaceId, spaceUnit(targetSpaceId))) return false;

  for (const entity of dataset.entities) {
    if (!isCoordinate(positions[entity.id]) || !isRecord(entity.extensions)) continue;
    const objectPayload = entity.extensions[COORDINATE_EXTENSION_ID];
    if (objectPayload === undefined) continue;
    if (!isRecord(objectPayload) || !Array.isArray(objectPayload.coordinates)) return false;
    const matchingCoordinates = objectPayload.coordinates.filter(
      (candidate) => isRecord(candidate) && candidate.spaceId === targetSpaceId,
    );
    if (matchingCoordinates.length > 1) return false;
    if (matchingCoordinates.length === 1 && !isRecord(matchingCoordinates[0]?.values)) return false;
  }
  return true;
}

function canMaintainSpecificationDeclaration(
  dataset: Dataset,
  coordinateId = COORDINATE_EXTENSION_ID,
  coordinateVersion = COORDINATE_FORMAT_VERSION,
): boolean {
  if (!isRecord(dataset.extensions) || !(SPECIFICATION_EXTENSION_ID in dataset.extensions)) return true;
  const specification = dataset.extensions[SPECIFICATION_EXTENSION_ID];
  if (!isRecord(specification) || specification.specVersion !== "0.1.0") return false;
  const uses = specification.uses === undefined ? [] : specification.uses;
  if (!Array.isArray(uses) || !uses.every(isRecord)) return false;

  const coordinateDeclarations = uses.filter(({ extension }) => extension === coordinateId);
  if (coordinateDeclarations.length > 1) return false;
  if (coordinateDeclarations.length === 1 && coordinateDeclarations[0]?.version !== coordinateVersion) return false;

  const otherPayloads = collectExtensionIdentifiers(dataset);
  otherPayloads.delete(SPECIFICATION_EXTENSION_ID);
  otherPayloads.delete(coordinateId);
  const otherDeclarations = uses.filter(({ extension }) => extension !== coordinateId);
  const declared = new Set(otherDeclarations.map(({ extension }) => extension).filter((value): value is string => typeof value === "string"));
  if (declared.size !== otherDeclarations.length || declared.size !== otherPayloads.size) return false;
  return [...otherPayloads].every((identifier) => declared.has(identifier));
}

function canSafelyWriteCoordinateDraft(dataset: Dataset, positions: Record<string, Coordinate>): boolean {
  const targetSpaceId = writableSpaceId(dataset, COORDINATE_DRAFT_EXTENSION_ID);
  if (!targetSpaceId) return false;
  if (targetSpaceId === LIAISONSCAPE_SPACE_ID && Object.values(dataset.entities).some((entity) => getLegacyCoordinate(entity))) return false;
  if (collectExtensionIdentifiers(dataset).has(COORDINATE_EXTENSION_ID)) return false;
  if (!isRecord(dataset.extensions)) return false;
  const payload = dataset.extensions[COORDINATE_DRAFT_EXTENSION_ID];
  if (!isRecord(payload)
    || payload.specVersion !== COORDINATE_FORMAT_VERSION
    || !Array.isArray(payload.spaces)) return false;

  const matchingSpaces = payload.spaces.filter(
    (candidate) => isRecord(candidate) && candidate.id === targetSpaceId,
  );
  if (matchingSpaces.length !== 1 || !isCompatibleSpace(matchingSpaces[0], targetSpaceId, spaceUnit(targetSpaceId))) return false;

  for (const collection of [dataset.entities, dataset.events, dataset.relations]) {
    for (const object of collection) {
      if (!isRecord(object.extensions) || !(COORDINATE_DRAFT_EXTENSION_ID in object.extensions)) continue;
      if (collection === dataset.relations) return false;
      const objectPayload = object.extensions[COORDINATE_DRAFT_EXTENSION_ID];
      if (!isRecord(objectPayload) || !Array.isArray(objectPayload.coordinates)) return false;
      const matchingCoordinates = objectPayload.coordinates.filter(
        (candidate) => isRecord(candidate) && candidate.spaceId === targetSpaceId,
      );
      if (matchingCoordinates.length > 1) return false;
      if (matchingCoordinates.length === 1 && !isRecord(matchingCoordinates[0]?.values)) return false;
    }
  }
  return canMaintainSpecificationDeclaration(
    dataset,
    COORDINATE_DRAFT_EXTENSION_ID,
    COORDINATE_FORMAT_VERSION,
  );
}

function updateExistingCompleteSpecificationDeclaration(dataset: Dataset): void {
  if (!isRecord(dataset.extensions)) return;
  const specification = dataset.extensions[SPECIFICATION_EXTENSION_ID];
  if (!isRecord(specification) || specification.specVersion !== "0.1.0") return;

  const uses = specification.uses === undefined ? [] : specification.uses;
  if (!Array.isArray(uses)) return;
  const declarations = uses.filter(isRecord);
  if (declarations.length !== uses.length) return;
  const presentPayloads = collectExtensionIdentifiers(dataset);
  const withoutRemovedLegacy = declarations.filter(({ extension }) => extension !== "coordinate" || presentPayloads.has("coordinate"));
  const coordinateDeclarations = withoutRemovedLegacy.filter(({ extension }) => extension === COORDINATE_EXTENSION_ID);
  if (coordinateDeclarations.length > 1) return;
  const nextUses = coordinateDeclarations.length === 1
    ? withoutRemovedLegacy
    : [...withoutRemovedLegacy, { extension: COORDINATE_EXTENSION_ID, version: COORDINATE_FORMAT_VERSION }];

  dataset.extensions[SPECIFICATION_EXTENSION_ID] = {
    ...specification,
    uses: nextUses,
  };
}

export function applyStoredCoordinates(dataset: Dataset, positions: Record<string, Coordinate>): Dataset {
  const hasSavablePosition = dataset.entities.some((entity) => isCoordinate(positions[entity.id]));
  if (!hasSavablePosition) return dataset;
  if (canSafelyWriteCoordinateDraft(dataset, positions)) {
    const targetSpaceId = writableSpaceId(dataset, COORDINATE_DRAFT_EXTENSION_ID);
    if (!targetSpaceId) return dataset;
    const copy = structuredClone(dataset) as Dataset;
    const datasetExtensions = isRecord(copy.extensions) ? copy.extensions : {};
    const draftPayload = datasetExtensions[COORDINATE_DRAFT_EXTENSION_ID] as Record<string, unknown>;
    const spaces = Array.isArray(draftPayload.spaces) ? draftPayload.spaces : [];
    const existingSpaceIndex = spaces.findIndex((candidate) => isRecord(candidate) && candidate.id === targetSpaceId);
    const existingSpace = existingSpaceIndex >= 0 && isRecord(spaces[existingSpaceIndex]) ? spaces[existingSpaceIndex] : undefined;
    const nextSpaces = [...spaces];
    const nextSpace = spaceDefinition(targetSpaceId, spaceUnit(targetSpaceId), existingSpace);
    if (existingSpaceIndex >= 0) nextSpaces[existingSpaceIndex] = nextSpace;
    else nextSpaces.push(nextSpace);
    copy.extensions = {
      ...datasetExtensions,
      [COORDINATE_DRAFT_EXTENSION_ID]: {
        ...draftPayload,
        specVersion: COORDINATE_FORMAT_VERSION,
        spaces: nextSpaces,
      },
    };
    copy.entities = copy.entities.map((entity) => {
      const position = positions[entity.id];
      if (!position || !isCoordinate(position)) return entity;
      const extensions = isRecord(entity.extensions) ? entity.extensions : {};
      const draft = isRecord(extensions[COORDINATE_DRAFT_EXTENSION_ID])
        ? extensions[COORDINATE_DRAFT_EXTENSION_ID] as Record<string, unknown>
        : {};
      const coordinates = Array.isArray(draft.coordinates) ? draft.coordinates : [];
      const existingCoordinateIndex = coordinates.findIndex(
        (value) => isRecord(value) && value.spaceId === targetSpaceId,
      );
      const existingCoordinate = existingCoordinateIndex >= 0 ? coordinates[existingCoordinateIndex] : undefined;
      const existingValues = isRecord(existingCoordinate) && isRecord(existingCoordinate.values)
        ? existingCoordinate.values
        : {};
      const nextCoordinate = {
        ...(isRecord(existingCoordinate) ? existingCoordinate : {}),
        spaceId: targetSpaceId,
        values: { ...existingValues, x: position.x, y: position.y },
      };
      const nextCoordinates = [...coordinates];
      if (existingCoordinateIndex >= 0) nextCoordinates[existingCoordinateIndex] = nextCoordinate;
      else nextCoordinates.push(nextCoordinate);
      return {
        ...entity,
        extensions: {
          ...extensions,
          [COORDINATE_DRAFT_EXTENSION_ID]: { ...draft, coordinates: nextCoordinates },
        },
      };
    });
    return copy;
  }
  if (!canMaintainSpecificationDeclaration(dataset) || !canSafelyWriteCoordinatePrototype(dataset, positions)) return dataset;

  const copy = structuredClone(dataset) as Dataset;
  const targetSpaceId = writableSpaceId(dataset, COORDINATE_EXTENSION_ID);
  if (!targetSpaceId) return dataset;
  const datasetExtensions = isRecord(copy.extensions) ? copy.extensions : {};
  const coordinatePayload = isRecord(datasetExtensions[COORDINATE_EXTENSION_ID])
    ? datasetExtensions[COORDINATE_EXTENSION_ID] as Record<string, unknown>
    : {};
  const spaces = Array.isArray(coordinatePayload.spaces) ? coordinatePayload.spaces : [];
  const existingSpaceIndex = spaces.findIndex((candidate) => isRecord(candidate) && candidate.id === targetSpaceId);
  const existingSpace = existingSpaceIndex >= 0 && isRecord(spaces[existingSpaceIndex]) ? spaces[existingSpaceIndex] : undefined;
  const nextSpaces = [...spaces];
  const nextSpace = spaceDefinition(targetSpaceId, spaceUnit(targetSpaceId), existingSpace);
  if (existingSpaceIndex >= 0) nextSpaces[existingSpaceIndex] = nextSpace;
  else nextSpaces.push(nextSpace);
  copy.extensions = {
    ...datasetExtensions,
    [COORDINATE_EXTENSION_ID]: {
      ...coordinatePayload,
      formatVersion: COORDINATE_FORMAT_VERSION,
      spaces: nextSpaces,
    },
  };

  copy.entities = copy.entities.map((entity) => {
    const position = positions[entity.id];
    if (!position || !isCoordinate(position)) return entity;
    const extensions = isRecord(entity.extensions) ? entity.extensions : {};
    const prototype = isRecord(extensions[COORDINATE_EXTENSION_ID])
      ? extensions[COORDINATE_EXTENSION_ID] as Record<string, unknown>
      : {};
    const coordinates = Array.isArray(prototype.coordinates) ? prototype.coordinates : [];
    const existingCoordinateIndex = coordinates.findIndex(
      (value) => isRecord(value) && value.spaceId === targetSpaceId,
    );
    const existingCoordinate = existingCoordinateIndex >= 0
      ? coordinates[existingCoordinateIndex]
      : undefined;
    const existingValues = isRecord(existingCoordinate) && isRecord(existingCoordinate.values)
      ? existingCoordinate.values
      : {};
    const nextCoordinate = {
      ...(isRecord(existingCoordinate) ? existingCoordinate : {}),
      spaceId: targetSpaceId,
      values: { ...existingValues, x: position.x, y: position.y },
    };
    const nextCoordinates = [...coordinates];
    if (existingCoordinateIndex >= 0) nextCoordinates[existingCoordinateIndex] = nextCoordinate;
    else nextCoordinates.push(nextCoordinate);
    const nextExtensions: Record<string, unknown> = {
      ...extensions,
      [COORDINATE_EXTENSION_ID]: {
        ...prototype,
        coordinates: nextCoordinates,
      },
    };

    const legacy = extensions.coordinate;
    if (isRecord(legacy) && Array.isArray(legacy.positions)) {
      const remainingPositions = legacy.positions.filter((value) => !(isRecord(value) && value.spaceId === "linkscape"));
      if (remainingPositions.length !== legacy.positions.length) {
        const nextLegacy = { ...legacy };
        if (remainingPositions.length > 0) nextLegacy.positions = remainingPositions;
        else delete nextLegacy.positions;
        if (Object.keys(nextLegacy).length > 0) nextExtensions.coordinate = nextLegacy;
        else delete nextExtensions.coordinate;
      }
    }
    return { ...entity, extensions: nextExtensions };
  });
  updateExistingCompleteSpecificationDeclaration(copy);
  return copy;
}

export function buildEntityGraph(dataset: Dataset): { nodes: GraphNode[]; edges: GraphEdge[]; unsupportedEdges: number } {
  const nodes = dataset.entities.map((entity, index) => ({
    id: entity.id,
    label: typeof entity.name === "string" && entity.name.trim() ? entity.name : entity.id,
    description: typeof entity.description === "string" ? entity.description : "",
    x: 150 + (index % 4) * 240,
    y: 130 + Math.floor(index / 4) * 180,
  }));
  const entityIds = new Set(nodes.map(({ id }) => id));
  let unsupportedEdges = 0;
  const edges = dataset.relations.flatMap((relation) => {
    const sourceId = typeof relation.sourceId === "string" ? relation.sourceId : "";
    const targetId = typeof relation.targetId === "string" ? relation.targetId : "";
    if (!entityIds.has(sourceId) || !entityIds.has(targetId)) { unsupportedEdges += 1; return []; }
    return [{ id: relation.id, sourceId, targetId, parallelIndex: 0, parallelCount: 1 }];
  });
  const groups = new Map<string, typeof edges>();
  for (const edge of edges) {
    const key = `${edge.sourceId}\u0000${edge.targetId}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.forEach((edge, index) => { edge.parallelIndex = index; edge.parallelCount = group.length; });
  return { nodes, edges, unsupportedEdges };
}
