import {
  applyStoredCoordinates,
  getStoredCoordinates,
  synchronizeExistingSpecificationDeclaration,
  validateDatasetForExport,
  type Coordinate,
  type Dataset,
} from "./dataset.ts";
import { resolveExplicitAutoLayoutPins } from "./explicit-auto-layout-pin.ts";

export const LIAISONSCAPE_LAYOUT_EXTENSION_ID = "draft.github.sukoyaka-dopeness.liaisonscape-layout";
export const LIAISONSCAPE_LAYOUT_SPEC_VERSION = "0.1.0";

export type PinIntent = Readonly<{ spaceId: string }>;
export type PinChange = PinIntent | null;

export type WorkingPinState = Readonly<{
  loaded: Readonly<Record<string, PinIntent>>;
  staged: Readonly<Record<string, PinChange>>;
  pinCreatedCoordinateEntityIds: readonly string[];
  discardedPinCoordinateEntityIds: readonly string[];
}>;

export const emptyWorkingPinState: WorkingPinState = {
  loaded: {},
  staged: {},
  pinCreatedCoordinateEntityIds: [],
  discardedPinCoordinateEntityIds: [],
};

export type PinStateReadResult = Readonly<{
  state: WorkingPinState;
  diagnostics: readonly PinPersistenceDiagnostic[];
}>;

export type PinPersistenceDiagnostic = Readonly<{
  code: string;
  entityId?: string;
  message: string;
}>;

export type PinMutationResult = Readonly<{
  state: WorkingPinState;
  changed: boolean;
  refusal?: "entity_id_invalid" | "space_id_invalid";
}>;

export type AtomicPinSaveResult =
  | Readonly<{
    status: "completed";
    dataset: Dataset;
    changed: boolean;
    savedPinState: Readonly<Record<string, PinIntent>>;
  }>
  | Readonly<{
    status: "failed";
    dataset: Dataset;
    code:
      | "PIN_PAYLOAD_INVALID"
      | "PIN_VERSION_UNSUPPORTED"
      | "PIN_RECORD_INVALID"
      | "PIN_SAVE_COORDINATE_INVALID"
      | "PIN_COORDINATE_WRITE_REFUSED"
      | "PIN_ANCHOR_INVALID"
      | "PIN_DATASET_INVALID";
    diagnostics: readonly PinPersistenceDiagnostic[];
  }>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSpaceId(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value);
}

function finiteCoordinate(value: unknown): value is Coordinate {
  return isRecord(value)
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}

function sameIntent(left: PinChange | undefined, right: PinChange | undefined): boolean {
  if ((left === null || left === undefined) && (right === null || right === undefined)) return true;
  if (left === right) return true;
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && left.spaceId === right.spaceId;
}

function copyIntentMap(source: Readonly<Record<string, PinIntent>>): Record<string, PinIntent> {
  return Object.fromEntries(Object.entries(source).map(([entityId, intent]) => [entityId, { spaceId: intent.spaceId }]));
}

function payload(dataset: Dataset): { status: "absent" | "supported" | "invalid" | "unsupported"; value?: RecordValue; diagnostic?: PinPersistenceDiagnostic } {
  const extensions = isRecord(dataset.extensions) ? dataset.extensions : undefined;
  const value = extensions?.[LIAISONSCAPE_LAYOUT_EXTENSION_ID];
  if (value === undefined) return { status: "absent" };
  if (!isRecord(value)) return { status: "invalid", diagnostic: { code: "PIN_PAYLOAD_INVALID", message: "LiaisonScape Layout Extension must be an object" } };
  if (value.specVersion !== LIAISONSCAPE_LAYOUT_SPEC_VERSION) {
    return { status: "unsupported", diagnostic: { code: "PIN_VERSION_UNSUPPORTED", message: "LiaisonScape Layout Extension version is unsupported" } };
  }
  if (value.entities !== undefined && !isRecord(value.entities)) {
    return { status: "invalid", value, diagnostic: { code: "PIN_PAYLOAD_INVALID", message: "LiaisonScape Layout Extension entities must be an object" } };
  }
  return { status: "supported", value };
}

function readLoadedPinState(dataset: Dataset): PinStateReadResult {
  const loaded: Record<string, PinIntent> = {};
  const diagnostics: PinPersistenceDiagnostic[] = [];
  const parsed = payload(dataset);
  if (parsed.diagnostic) return { state: { loaded, staged: {}, pinCreatedCoordinateEntityIds: [], discardedPinCoordinateEntityIds: [] }, diagnostics: [parsed.diagnostic] };
  const entities = parsed.value?.entities;
  if (!isRecord(entities)) return { state: { loaded, staged: {}, pinCreatedCoordinateEntityIds: [], discardedPinCoordinateEntityIds: [] }, diagnostics };
  const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  for (const [entityId, value] of Object.entries(entities)) {
    if (!isRecord(value) || value.pinned !== true || !validSpaceId(value.spaceId)) {
      if (isRecord(value) && (Object.hasOwn(value, "pinned") || Object.hasOwn(value, "spaceId"))) {
        diagnostics.push({ code: "PIN_RECORD_INVALID", entityId, message: "Pin record is malformed or inactive" });
      }
      continue;
    }
    if (!entityIds.has(entityId)) diagnostics.push({ code: "PIN_ORPHAN_ENTITY", entityId, message: "Pin Entity ID does not resolve to the current Dataset" });
    loaded[entityId] = { spaceId: value.spaceId };
  }
  return { state: { loaded, staged: {}, pinCreatedCoordinateEntityIds: [], discardedPinCoordinateEntityIds: [] }, diagnostics };
}

/** Reads supported persisted Pin intent without mutating or normalizing the Dataset. */
export function createWorkingPinState(dataset: Dataset): PinStateReadResult {
  return readLoadedPinState(dataset);
}

/** Drops operation-local Pin state that cannot belong to a replacement Dataset. */
export function reconcileWorkingPinState(state: WorkingPinState, dataset: Dataset): WorkingPinState {
  const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  const loaded = Object.fromEntries(Object.entries(state.loaded).filter(([entityId]) => entityIds.has(entityId)));
  const staged = Object.fromEntries(Object.entries(state.staged).filter(([entityId]) => entityIds.has(entityId)));
  return {
    loaded,
    staged,
    pinCreatedCoordinateEntityIds: state.pinCreatedCoordinateEntityIds.filter((entityId) => entityIds.has(entityId)),
    discardedPinCoordinateEntityIds: state.discardedPinCoordinateEntityIds.filter((entityId) => entityIds.has(entityId)),
  };
}

/** Returns the effective working Pin map and whether it differs from loaded state. */
export function deriveWorkingPinState(state: WorkingPinState): {
  pins: Readonly<Record<string, PinIntent>>;
  unsavedPins: boolean;
  coordinatesToDiscard: readonly string[];
} {
  const pins = copyIntentMap(state.loaded);
  for (const [entityId, change] of Object.entries(state.staged)) {
    if (change === null) delete pins[entityId];
    else pins[entityId] = { spaceId: change.spaceId };
  }
  const loadedIds = new Set(Object.keys(state.loaded));
  const effectiveIds = new Set(Object.keys(pins));
  const ids = new Set([...loadedIds, ...effectiveIds, ...Object.keys(state.staged)]);
  const unsavedPins = [...ids].some((entityId) => !sameIntent(state.loaded[entityId], pins[entityId]));
  return { pins, unsavedPins, coordinatesToDiscard: [...state.discardedPinCoordinateEntityIds] };
}

function stage(state: WorkingPinState, entityId: string, change: PinChange, retainCoordinate = false): PinMutationResult {
  if (!/\S/.test(entityId)) return { state, changed: false, refusal: "entity_id_invalid" };
  const current = deriveWorkingPinState(state).pins[entityId];
  if (sameIntent(current, change)) {
    const nextStaged = { ...state.staged };
    delete nextStaged[entityId];
    const nextState = { ...state, staged: nextStaged };
    return { state: nextState, changed: !sameIntent(state.staged[entityId], undefined) };
  }
  const created = new Set(state.pinCreatedCoordinateEntityIds);
  const discarded = new Set(state.discardedPinCoordinateEntityIds);
  if (change === null) {
    if (!retainCoordinate && created.has(entityId)) discarded.add(entityId);
    created.delete(entityId);
  } else {
    discarded.delete(entityId);
  }
  return {
    state: {
      loaded: state.loaded,
      staged: { ...state.staged, [entityId]: change },
      pinCreatedCoordinateEntityIds: [...created],
      discardedPinCoordinateEntityIds: [...discarded],
    },
    changed: true,
  };
}

/** Stages Pin intent only; it does not write coordinates or mutate a Dataset. */
export function stagePin(
  state: WorkingPinState,
  entityId: string,
  spaceId: string,
  { hasCompatibleSavedAnchor = false, currentPosition }: { hasCompatibleSavedAnchor?: boolean; currentPosition?: Coordinate } = {},
): PinMutationResult {
  if (!validSpaceId(spaceId)) return { state, changed: false, refusal: "space_id_invalid" };
  const result = stage(state, entityId, { spaceId });
  if (result.refusal || hasCompatibleSavedAnchor || !finiteCoordinate(currentPosition)) return result;
  const created = new Set(result.state.pinCreatedCoordinateEntityIds);
  created.add(entityId);
  return { ...result, state: { ...result.state, pinCreatedCoordinateEntityIds: [...created] } };
}

/** Stages canonical Unpin omission only; existing coordinates remain untouched. */
export function stageUnpin(state: WorkingPinState, entityId: string, { retainCoordinate = false }: { retainCoordinate?: boolean } = {}): PinMutationResult {
  return stage(state, entityId, null, retainCoordinate);
}

function existingRecord(payloadValue: RecordValue | undefined, entityId: string): RecordValue | undefined {
  return isRecord(payloadValue?.entities) && isRecord(payloadValue.entities[entityId])
    ? payloadValue.entities[entityId] as RecordValue
    : undefined;
}

function explicitUnpinIds(state: WorkingPinState): Set<string> {
  return new Set(Object.entries(state.staged).filter(([, change]) => change === null).map(([entityId]) => entityId));
}

function validateExistingPinPayload(dataset: Dataset, state: WorkingPinState): PinPersistenceDiagnostic[] {
  const parsed = payload(dataset);
  if (parsed.status === "absent") return [];
  if (parsed.diagnostic) return [parsed.diagnostic];
  const entities = isRecord(parsed.value?.entities) ? parsed.value.entities : {};
  const unpinned = explicitUnpinIds(state);
  const diagnostics: PinPersistenceDiagnostic[] = [];
  for (const [entityId, value] of Object.entries(entities)) {
    if (!isRecord(value)) {
      diagnostics.push({ code: "PIN_RECORD_INVALID", entityId, message: "Pin Entity record must be an object" });
      continue;
    }
    const recognized = Object.hasOwn(value, "pinned") || Object.hasOwn(value, "spaceId");
    const valid = value.pinned === true && validSpaceId(value.spaceId);
    if (recognized && !valid && !unpinned.has(entityId)) {
      diagnostics.push({ code: "PIN_RECORD_INVALID", entityId, message: "Malformed Pin record cannot be repaired by an unrelated save" });
    }
  }
  return diagnostics;
}

function writePinState(dataset: Dataset, state: WorkingPinState): Dataset {
  const parsed = payload(dataset);
  const existingPayload = parsed.value ?? {};
  const existingEntities = isRecord(existingPayload.entities) ? existingPayload.entities : {};
  const nextEntities: Record<string, unknown> = { ...existingEntities };
  for (const [entityId, change] of Object.entries(state.staged)) {
    const currentRecord = existingRecord(existingPayload, entityId);
    if (change === null) {
      if (!currentRecord) continue;
      const nextRecord = { ...currentRecord };
      delete nextRecord.pinned;
      delete nextRecord.spaceId;
      if (Object.keys(nextRecord).length > 0) nextEntities[entityId] = nextRecord;
      else delete nextEntities[entityId];
      continue;
    }
    nextEntities[entityId] = { ...(currentRecord ?? {}), pinned: true, spaceId: change.spaceId };
  }

  const nextPayload: Record<string, unknown> = {
    ...existingPayload,
    specVersion: LIAISONSCAPE_LAYOUT_SPEC_VERSION,
  };
  if (Object.keys(nextEntities).length > 0) nextPayload.entities = nextEntities;
  else delete nextPayload.entities;
  const extensions = isRecord(dataset.extensions) ? { ...dataset.extensions } : {};
  if (Object.keys(nextPayload).length > 1) {
    extensions[LIAISONSCAPE_LAYOUT_EXTENSION_ID] = nextPayload;
  } else {
    delete extensions[LIAISONSCAPE_LAYOUT_EXTENSION_ID];
  }
  const copy = structuredClone(dataset) as Dataset;
  if (Object.keys(extensions).length > 0) copy.extensions = extensions;
  else delete copy.extensions;
  synchronizeExistingSpecificationDeclaration(copy, LIAISONSCAPE_LAYOUT_EXTENSION_ID, LIAISONSCAPE_LAYOUT_SPEC_VERSION);
  return copy;
}

function failure(dataset: Dataset, code: AtomicPinSaveResult extends infer _ ? Extract<AtomicPinSaveResult, { status: "failed" }>['code'] : never, diagnostics: PinPersistenceDiagnostic[]): AtomicPinSaveResult {
  return { status: "failed", dataset, code, diagnostics };
}

/**
 * Builds a complete cloned Dataset and publishes neither Coordinate nor Pin
 * half on failure. The caller owns working-state and dirty-state adoption.
 */
export function buildAtomicPinSaveCandidate({
  dataset,
  coordinatePositions,
  workingPins,
}: {
  dataset: Dataset;
  coordinatePositions: Readonly<Record<string, Coordinate>>;
  workingPins: WorkingPinState;
}): AtomicPinSaveResult {
  const payloadDiagnostics = validateExistingPinPayload(dataset, workingPins);
  if (payloadDiagnostics.length > 0) {
    const unsupported = payloadDiagnostics.some(({ code }) => code === "PIN_VERSION_UNSUPPORTED");
    return failure(dataset, unsupported ? "PIN_VERSION_UNSUPPORTED" : "PIN_PAYLOAD_INVALID", payloadDiagnostics);
  }

  const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  for (const [entityId, coordinate] of Object.entries(coordinatePositions)) {
    if (!entityIds.has(entityId) || !finiteCoordinate(coordinate)) {
      return failure(dataset, "PIN_SAVE_COORDINATE_INVALID", [{ code: "PIN_SAVE_COORDINATE_INVALID", entityId, message: "Save candidate coordinates must be finite values for current Entities" }]);
    }
  }

  const effective = deriveWorkingPinState(workingPins);
  const storedCoordinates = getStoredCoordinates(dataset);
  const coordinatesForSave = { ...coordinatePositions };
  for (const entityId of effective.coordinatesToDiscard) {
    if (storedCoordinates[entityId] === undefined) delete coordinatesForSave[entityId];
  }
  const coordinateInput = Object.keys(coordinatesForSave).length > 0;
  const withCoordinates = applyStoredCoordinates(dataset, coordinatesForSave);
  if (coordinateInput && withCoordinates === dataset) {
    return failure(dataset, "PIN_COORDINATE_WRITE_REFUSED", [{ code: "PIN_COORDINATE_WRITE_REFUSED", message: "Existing Coordinate writer refused the complete save candidate" }]);
  }
  const withPins = effective.unsavedPins ? writePinState(withCoordinates, workingPins) : withCoordinates;
  const datasetDiagnostics = validateDatasetForExport(withPins)
    .filter(({ severity }) => severity === "error")
    .map(({ code, path }) => ({ code: "PIN_DATASET_INVALID", message: `${path}: ${code}` }));
  if (datasetDiagnostics.length > 0) return failure(dataset, "PIN_DATASET_INVALID", datasetDiagnostics);

  const resolution = resolveExplicitAutoLayoutPins({
    dataset: withPins,
    currentPositions: coordinatePositions,
  });
  if (resolution.status === "failed") {
    return failure(dataset, "PIN_ANCHOR_INVALID", resolution.diagnostics.map(({ code, entityId, spaceId, message }) => ({ code, entityId, spaceId, message })));
  }

  return {
    status: "completed",
    dataset: withPins,
    changed: withPins !== dataset,
    savedPinState: effective.pins,
  };
}
