import { validateDataset } from "@sukoyaka-dopeness/e2r-validator";
import type { Dataset, Diagnostic, LoadResult } from "../models";
export function loadDataset(raw: string): LoadResult { try { const value: unknown = JSON.parse(raw); const result = validateDataset(value) as { valid: boolean; diagnostics: Diagnostic[] }; return { dataset: result.valid ? value as Dataset : null, raw, diagnostics: result.diagnostics }; } catch (error) { return { dataset: null, raw, diagnostics: [], parseError: error instanceof Error ? error.message : "Invalid JSON" }; } }
export function serializeDataset(dataset: Dataset): string { return JSON.stringify(dataset, null, 2); }
export function validateDatasetForExport(dataset: Dataset): Diagnostic[] { return (validateDataset(dataset) as { diagnostics: Diagnostic[] }).diagnostics; }
const SPECIFICATION_EXTENSION_ID = "draft.github.sukoyaka-dopeness.specification";
const EXPORTABLE_EXTENSION_VERSIONS: Record<string, { version: string; field?: "formatVersion" | "specVersion"; datasetOnly?: boolean }> = {
  // Metadata 1.0.0 has no payload version field; the current Metadata contract is the version authority.
  metadata: { version: "1.0.0", datasetOnly: true },
  "experimental.github.sukoyaka-dopeness.coordinate": { version: "0.1.0", field: "formatVersion" },
  "draft.github.sukoyaka-dopeness.coordinate": { version: "0.1.0", field: "specVersion" },
  "draft.github.sukoyaka-dopeness.liaisonscape-layout": { version: "0.1.0", field: "specVersion", datasetOnly: true },
  "draft.github.sukoyaka-dopeness.liaisonscape-presentation": { version: "0.1.0", field: "specVersion", datasetOnly: true },
};
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function prepareDatasetForExport(dataset: Dataset): Dataset {
  if (dataset.extensions !== undefined && !isRecord(dataset.extensions)) return dataset;
  const extensions = isRecord(dataset.extensions) ? dataset.extensions : {};
  if (Object.hasOwn(extensions, SPECIFICATION_EXTENSION_ID)) return dataset;
  const occurrences = new Map<string, Array<{ owner: "dataset" | "entity" | "event" | "relation"; payload: unknown }>>();
  let hasSpecification = false;
  const visit = (value: unknown, owner: "dataset" | "entity" | "event" | "relation") => {
    if (!isRecord(value) || !isRecord(value.extensions)) return;
    for (const identifier of Object.keys(value.extensions)) {
      if (identifier === SPECIFICATION_EXTENSION_ID) hasSpecification = true;
      else occurrences.set(identifier, [...(occurrences.get(identifier) ?? []), { owner, payload: value.extensions[identifier] }]);
    }
  };
  visit(dataset, "dataset");
  for (const value of dataset.entities) visit(value, "entity");
  for (const value of dataset.events) visit(value, "event");
  for (const value of dataset.relations) visit(value, "relation");
  if (hasSpecification || occurrences.size === 0) return dataset;
  const uses: Array<{ extension: string; version: string }> = [];
  for (const [extension, entries] of occurrences) {
    const support = EXPORTABLE_EXTENSION_VERSIONS[extension];
    if (!support) return dataset;
    if (support.datasetOnly && (entries.length !== 1 || entries[0].owner !== "dataset")) return dataset;
    if (support.field) {
      const datasetEntry = entries.find(({ owner }) => owner === "dataset");
      if (!datasetEntry || !isRecord(datasetEntry.payload) || datasetEntry.payload[support.field] !== support.version) return dataset;
      if (support.field === "formatVersion" && "specVersion" in datasetEntry.payload && datasetEntry.payload.specVersion !== support.version) return dataset;
      if (support.field === "specVersion" && "formatVersion" in datasetEntry.payload) return dataset;
      if (entries.some(({ owner }) => owner === "relation")) return dataset;
      if (entries.some(({ owner, payload }) => owner !== "dataset" && (!isRecord(payload) || "formatVersion" in payload || "specVersion" in payload))) return dataset;
    } else if (!entries.every(({ owner, payload }) => owner === "dataset" && isRecord(payload))) {
      return dataset;
    }
    uses.push({ extension, version: support.version });
  }
  const candidate = structuredClone(dataset);
  candidate.extensions = { ...extensions, [SPECIFICATION_EXTENSION_ID]: { specVersion: "0.1.0", uses } };
  const validation = validateDataset(candidate) as { valid: boolean; diagnostics: Diagnostic[] };
  // The Validator has no registered LiaisonScape Layout profile. Do not add a
  // declaration that would create an unavailable-specification warning which
  // the existing Export diagnostics path cannot surface for this copy.
  if (validation.diagnostics.some(({ code }) => code === "specification_unavailable")) return dataset;
  return validation.valid ? candidate : dataset;
}
export function getDatasetMetadata(dataset: Dataset): { datasetId: string | null; title: string | null } { const extensions = dataset.extensions; if (typeof extensions !== "object" || extensions === null) return { datasetId: null, title: null }; const metadata = (extensions as Record<string, unknown>).metadata; if (typeof metadata !== "object" || metadata === null) return { datasetId: null, title: null }; const value = metadata as Record<string, unknown>; return { datasetId: typeof value.datasetId === "string" && value.datasetId.trim() ? value.datasetId : null, title: typeof value.title === "string" && value.title.trim() ? value.title : null }; }
export function getDatasetExportFilename(dataset: Dataset): string {
  const title = getDatasetMetadata(dataset).title;
  const safeTitle = title?.trim()
    .replace(/[\p{Cc}<>:"/\\|?*]/gu, "-")
    .replace(/[. -]+$/g, "")
    .trim() ?? "";
  const usableTitle = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safeTitle)
    ? ""
    : safeTitle;
  const filename = `${usableTitle || "e2r-dataset"}.e2r.json`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(filename);
  if (bytes.length <= 180) return filename;

  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  const trailer = `…-${hash.toString(16).padStart(8, "0")}.e2r.json`;
  const prefixBudget = 180 - encoder.encode(trailer).length;
  let prefix = "";
  for (const character of usableTitle) {
    if (encoder.encode(prefix + character).length > prefixBudget) break;
    prefix += character;
  }
  return prefix + trailer;
}
export function updateDatasetTitle(dataset: Dataset, title: string): Dataset {
  const trimmedTitle = title.trim();
  const extensions = typeof dataset.extensions === "object" && dataset.extensions !== null
    ? { ...(dataset.extensions as Record<string, unknown>) }
    : {};
  const metadata = typeof extensions.metadata === "object" && extensions.metadata !== null
    ? { ...(extensions.metadata as Record<string, unknown>) }
    : {};

  if (trimmedTitle) metadata.title = trimmedTitle;
  else delete metadata.title;

  if (Object.keys(metadata).length > 0) extensions.metadata = metadata;
  else delete extensions.metadata;

  return Object.keys(extensions).length > 0
    ? { ...dataset, extensions }
    : (() => {
      const nextDataset = { ...dataset };
      delete nextDataset.extensions;
      return nextDataset;
    })();
}
