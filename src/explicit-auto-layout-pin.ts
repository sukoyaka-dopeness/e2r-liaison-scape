import {
  COORDINATE_DRAFT_EXTENSION_ID,
  COORDINATE_EXTENSION_ID,
  COORDINATE_FORMAT_VERSION,
  LEGACY_LINKSCAPE_SPACE_ID,
  LEGACY_LINKSCAPE_USER_UNIT,
  LIAISONSCAPE_SPACE_ID,
  LIAISONSCAPE_USER_UNIT,
  type Coordinate,
  type Dataset,
} from "./dataset.ts";

export type ExplicitAutoLayoutPinSource = "saved" | "staged";
export type ExplicitAutoLayoutFixedAnchor = Readonly<{ x: number; y: number; source: ExplicitAutoLayoutPinSource }>;
export type ExplicitAutoLayoutStagedPin = Readonly<{ spaceId: string }>;
export type ExplicitAutoLayoutPinDiagnostic = Readonly<{ code: string; entityId?: string; spaceId?: string; message: string }>;

export type ExplicitAutoLayoutPinResolution = Readonly<{
  status: "completed" | "failed";
  anchors: Readonly<Record<string, ExplicitAutoLayoutFixedAnchor>>;
  diagnostics: readonly ExplicitAutoLayoutPinDiagnostic[];
  failure?: Readonly<{ code: string; message: string }>;
}>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteCoordinate(value: unknown): value is Coordinate {
  return isRecord(value)
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}

function compatibleSpace(value: unknown, spaceId: string): boolean {
  if (!isRecord(value) || value.id !== spaceId || value.kind !== "cartesian-2d" || !isRecord(value.components)) return false;
  const x = value.components.x;
  const y = value.components.y;
  const unit = spaceId === LIAISONSCAPE_SPACE_ID ? LIAISONSCAPE_USER_UNIT : spaceId === LEGACY_LINKSCAPE_SPACE_ID ? LEGACY_LINKSCAPE_USER_UNIT : null;
  return unit !== null
    && isRecord(x) && x.unit === unit && x.positiveDirection === "display-right"
    && isRecord(y) && y.unit === unit && y.positiveDirection === "display-down";
}

function supportedCoordinateOccurrences(entity: RecordValue, extensionId: string, versionField: "formatVersion" | "specVersion"): { coordinates: readonly RecordValue[]; supported: boolean } {
  const extensions = isRecord(entity.extensions) ? entity.extensions : null;
  const payload = extensions ? extensions[extensionId] : undefined;
  if (!isRecord(payload)) return { coordinates: [], supported: false };
  if ((payload[versionField] !== undefined && payload[versionField] !== COORDINATE_FORMAT_VERSION) || !Array.isArray(payload.coordinates)) return { coordinates: [], supported: false };
  return { coordinates: payload.coordinates.filter(isRecord), supported: true };
}

function resolveSavedCoordinate(dataset: Dataset, entity: RecordValue, spaceId: string): { coordinate?: Coordinate; diagnostic?: ExplicitAutoLayoutPinDiagnostic } {
  const datasetExtensions = isRecord(dataset.extensions) ? dataset.extensions : null;
  const prototype = datasetExtensions?.[COORDINATE_EXTENSION_ID];
  const draft = datasetExtensions?.[COORDINATE_DRAFT_EXTENSION_ID];
  const compatibleDatasetSpaces: unknown[] = [];
  if (isRecord(prototype) && prototype.formatVersion === COORDINATE_FORMAT_VERSION && Array.isArray(prototype.spaces)) compatibleDatasetSpaces.push(...prototype.spaces);
  if (isRecord(draft) && draft.specVersion === COORDINATE_FORMAT_VERSION && Array.isArray(draft.spaces)) compatibleDatasetSpaces.push(...draft.spaces);
  if (compatibleDatasetSpaces.filter((space) => isRecord(space) && space.id === spaceId).length !== 1
    || !compatibleDatasetSpaces.some((space) => compatibleSpace(space, spaceId))) {
    return { diagnostic: { code: "PIN_SPACE_UNSUPPORTED", spaceId, message: `No exactly one compatible Coordinate Space exists for ${spaceId}` } };
  }
  const occurrences = [
    supportedCoordinateOccurrences(entity, COORDINATE_EXTENSION_ID, "formatVersion"),
    supportedCoordinateOccurrences(entity, COORDINATE_DRAFT_EXTENSION_ID, "specVersion"),
  ];
  const matching = occurrences.flatMap(({ coordinates, supported }) => supported ? coordinates.filter((value) => value.spaceId === spaceId) : []);
  if (matching.length !== 1) return { diagnostic: { code: matching.length === 0 ? "PIN_ANCHOR_MISSING" : "PIN_ANCHOR_DUPLICATE", spaceId, message: `Expected exactly one compatible finite Coordinate for ${spaceId}` } };
  const values = matching[0]!.values;
  if (!finiteCoordinate(values)) return { diagnostic: { code: "PIN_ANCHOR_INVALID", spaceId, message: `Coordinate anchor for ${spaceId} is incomplete or non-finite` } };
  return { coordinate: { x: values.x, y: values.y } };
}

function pinPayload(dataset: Dataset): { status: "absent" | "supported" | "unsupported"; entities: RecordValue; diagnostic?: ExplicitAutoLayoutPinDiagnostic } {
  const extensions = isRecord(dataset.extensions) ? dataset.extensions : null;
  const payload = extensions?.["draft.github.sukoyaka-dopeness.liaisonscape-layout"];
  if (payload === undefined) return { status: "absent", entities: {} };
  if (!isRecord(payload) || payload.specVersion !== "0.1.0") return { status: "unsupported", entities: {}, diagnostic: { code: "PIN_EXTENSION_UNSUPPORTED", message: "Pin Extension is malformed or has an unsupported specVersion" } };
  if (payload.entities === undefined) return { status: "supported", entities: {} };
  if (!isRecord(payload.entities)) return { status: "unsupported", entities: {}, diagnostic: { code: "PIN_ENTITY_MAP_INVALID", message: "Pin Extension entities must be an object" } };
  return { status: "supported", entities: payload.entities };
}

/** Resolves saved and staged Pin intent without writing or normalizing the Dataset. */
export function resolveExplicitAutoLayoutPins({
  dataset,
  currentPositions,
  stagedPins = {},
  manuallyMovedEntityIds = [],
}: {
  dataset: Dataset;
  currentPositions: Readonly<Record<string, Coordinate>>;
  stagedPins?: Readonly<Record<string, ExplicitAutoLayoutStagedPin | null>>;
  manuallyMovedEntityIds?: readonly string[];
}): ExplicitAutoLayoutPinResolution {
  const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  const currentMoved = new Set(manuallyMovedEntityIds);
  const diagnostics: ExplicitAutoLayoutPinDiagnostic[] = [];
  const anchors: Record<string, ExplicitAutoLayoutFixedAnchor> = {};
  const payload = pinPayload(dataset);
  if (payload.diagnostic) diagnostics.push(payload.diagnostic);
  if (payload.status === "unsupported") return { status: "failed", anchors: {}, diagnostics, failure: { code: payload.diagnostic?.code ?? "PIN_EXTENSION_UNSUPPORTED", message: payload.diagnostic?.message ?? "Pin Extension is unsupported" } };

  const intents = new Map<string, { spaceId: string; source: ExplicitAutoLayoutPinSource }>();
  for (const [entityId, value] of Object.entries(payload.entities)) {
    if (!entityIds.has(entityId)) {
      diagnostics.push({ code: "PIN_ORPHAN_ENTITY", entityId, message: "Pin Entity ID does not resolve to the current Dataset" });
      continue;
    }
    if (!isRecord(value) || value.pinned !== true || typeof value.spaceId !== "string" || value.spaceId.trim() === "") {
      diagnostics.push({ code: "PIN_RECORD_INVALID", entityId, message: "Pin record is malformed or is not an active Pin" });
      continue;
    }
    intents.set(entityId, { spaceId: value.spaceId, source: "saved" });
  }
  for (const [entityId, value] of Object.entries(stagedPins)) {
    if (value === null) {
      intents.delete(entityId);
      continue;
    }
    if (!entityIds.has(entityId) || !isRecord(value) || typeof value.spaceId !== "string" || value.spaceId.trim() === "") {
      diagnostics.push({ code: "STAGED_PIN_INVALID", entityId, message: "Staged Pin is malformed or does not resolve to an Entity" });
      continue;
    }
    intents.set(entityId, { spaceId: value.spaceId, source: "staged" });
  }

  for (const [entityId, intent] of intents) {
    const entity = dataset.entities.find((candidate) => candidate.id === entityId)!;
    if (intent.source === "staged") {
      const current = currentPositions[entityId];
      if (!finiteCoordinate(current)) {
        diagnostics.push({ code: "STAGED_PIN_ANCHOR_MISSING", entityId, spaceId: intent.spaceId, message: "Staged Pin has no finite current working position" });
        continue;
      }
      anchors[entityId] = { x: current.x, y: current.y, source: "staged" };
      continue;
    }
    if (currentMoved.has(entityId)) {
      const current = currentPositions[entityId];
      if (!finiteCoordinate(current)) {
        diagnostics.push({ code: "PIN_WORKING_ANCHOR_INVALID", entityId, spaceId: intent.spaceId, message: "Pinned Node manual working position is incomplete or non-finite" });
        continue;
      }
      anchors[entityId] = { x: current.x, y: current.y, source: "staged" };
      continue;
    }
    const resolved = resolveSavedCoordinate(dataset, entity, intent.spaceId);
    if (resolved.coordinate) anchors[entityId] = { ...resolved.coordinate, source: "saved" };
    else diagnostics.push({ ...resolved.diagnostic!, entityId });
  }
  const activeCount = intents.size;
  if (Object.keys(anchors).length !== activeCount) return { status: "failed", anchors: {}, diagnostics, failure: { code: "PIN_RESOLUTION_FAILED", message: "One or more active Pins has no compatible finite anchor" } };
  return { status: "completed", anchors, diagnostics };
}
