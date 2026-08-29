import type { Dataset } from "./models.ts";

export const PRESENTATION_EXTENSION_ID = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";
export const PRESENTATION_SPEC_VERSION = "0.1.0";

export type RelationArrowDisplay = "normal" | "reverse" | "undirected" | "bidirectional";
export type PresentationWriteRefusal =
  | "relation_not_found"
  | "presentation_payload_invalid"
  | "presentation_version_unsupported";
export type PresentationWriteResult =
  | { dataset: Dataset; changed: boolean }
  | { dataset: Dataset; changed: false; refusal: PresentationWriteRefusal };

const KNOWN_ARROW_DISPLAY = new Set<RelationArrowDisplay>([
  "normal",
  "reverse",
  "undirected",
  "bidirectional",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isKnownArrowDisplay(value: unknown): value is RelationArrowDisplay {
  return typeof value === "string" && KNOWN_ARROW_DISPLAY.has(value as RelationArrowDisplay);
}

function hasNonWhitespace(value: string): boolean {
  return /\S/.test(value);
}

function validateExistingPresentation(dataset: Dataset): PresentationWriteRefusal | null {
  if (!Object.hasOwn(dataset, "extensions")) return null;
  if (!isRecord(dataset.extensions)) return "presentation_payload_invalid";

  const extensions = dataset.extensions;
  if (!Object.hasOwn(extensions, PRESENTATION_EXTENSION_ID)) return null;
  const payload = extensions[PRESENTATION_EXTENSION_ID];
  if (!isRecord(payload)) return "presentation_payload_invalid";
  if (!Object.hasOwn(payload, "specVersion")) return "presentation_payload_invalid";
  if (payload.specVersion !== PRESENTATION_SPEC_VERSION) return "presentation_version_unsupported";
  if (!Object.hasOwn(payload, "relations")) return null;
  if (!isRecord(payload.relations)) return "presentation_payload_invalid";

  for (const [relationId, record] of Object.entries(payload.relations)) {
    if (!hasNonWhitespace(relationId) || !isRecord(record) || Object.keys(record).length === 0) {
      return "presentation_payload_invalid";
    }
    if (
      Object.hasOwn(record, "arrowDisplay")
      && (typeof record.arrowDisplay !== "string" || record.arrowDisplay.length === 0)
    ) {
      return "presentation_payload_invalid";
    }
  }

  return null;
}

function presentationPayload(dataset: Dataset): Record<string, unknown> | null {
  if (!isRecord(dataset.extensions)) return null;
  const payload = dataset.extensions[PRESENTATION_EXTENSION_ID];
  return isRecord(payload) && payload.specVersion === PRESENTATION_SPEC_VERSION ? payload : null;
}

function relationPresentationRecord(dataset: Dataset, relationId: string): Record<string, unknown> | null {
  const payload = presentationPayload(dataset);
  if (!payload || !isRecord(payload.relations)) return null;
  const record = payload.relations[relationId];
  return isRecord(record) ? record : null;
}

export function readRelationArrowDisplay(dataset: Dataset, relationId: string): RelationArrowDisplay {
  const record = relationPresentationRecord(dataset, relationId);
  return record && isKnownArrowDisplay(record.arrowDisplay) ? record.arrowDisplay : "normal";
}

function refusal(dataset: Dataset, reason: PresentationWriteRefusal): PresentationWriteResult {
  return { dataset, changed: false, refusal: reason };
}

export function writeRelationArrowDisplay(
  dataset: Dataset,
  relationId: string,
  mode: RelationArrowDisplay,
): PresentationWriteResult {
  const validationRefusal = validateExistingPresentation(dataset);
  if (validationRefusal) return refusal(dataset, validationRefusal);
  if (!dataset.relations.some((relation) => relation.id === relationId)) {
    return refusal(dataset, "relation_not_found");
  }

  const existingRecord = relationPresentationRecord(dataset, relationId);
  const hasExistingArrow = existingRecord !== null && Object.hasOwn(existingRecord, "arrowDisplay");
  const existingArrow = existingRecord?.arrowDisplay;
  const changed = mode === "normal"
    ? hasExistingArrow
    : existingArrow !== mode;
  if (!changed) return { dataset, changed: false };

  const copy = structuredClone(dataset) as Dataset;
  const extensions = isRecord(copy.extensions) ? copy.extensions : {};
  const existingPayload = isRecord(extensions[PRESENTATION_EXTENSION_ID])
    ? extensions[PRESENTATION_EXTENSION_ID] as Record<string, unknown>
    : null;

  if (mode !== "normal") {
    const relations = existingPayload && isRecord(existingPayload.relations)
      ? existingPayload.relations
      : {};
    const record = isRecord(relations[relationId]) ? relations[relationId] : {};
    copy.extensions = {
      ...extensions,
      [PRESENTATION_EXTENSION_ID]: {
        ...(existingPayload ?? {}),
        specVersion: PRESENTATION_SPEC_VERSION,
        relations: {
          ...relations,
          [relationId]: { ...record, arrowDisplay: mode },
        },
      },
    };
    return { dataset: copy, changed: true };
  }

  if (!existingPayload || !isRecord(existingPayload.relations) || !isRecord(existingPayload.relations[relationId])) {
    return { dataset, changed: false };
  }

  const relations = { ...existingPayload.relations };
  const nextRecord = { ...existingPayload.relations[relationId] as Record<string, unknown> };
  delete nextRecord.arrowDisplay;
  if (Object.keys(nextRecord).length === 0) delete relations[relationId];
  else relations[relationId] = nextRecord;

  const nextPayload = { ...existingPayload };
  if (Object.keys(relations).length === 0) delete nextPayload.relations;
  else nextPayload.relations = relations;

  if (Object.keys(nextPayload).length === 1 && nextPayload.specVersion === PRESENTATION_SPEC_VERSION) {
    const nextExtensions = { ...extensions };
    delete nextExtensions[PRESENTATION_EXTENSION_ID];
    if (Object.keys(nextExtensions).length === 0) delete copy.extensions;
    else copy.extensions = nextExtensions;
  } else {
    copy.extensions = { ...extensions, [PRESENTATION_EXTENSION_ID]: nextPayload };
  }
  return { dataset: copy, changed: true };
}
