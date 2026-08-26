import { validateDataset } from "@sukoyaka-dopeness/e2r-validator";
import type { Dataset, Diagnostic, LoadResult } from "../models";
export function loadDataset(raw: string): LoadResult { try { const value: unknown = JSON.parse(raw); const result = validateDataset(value) as { valid: boolean; diagnostics: Diagnostic[] }; return { dataset: result.valid ? value as Dataset : null, raw, diagnostics: result.diagnostics }; } catch (error) { return { dataset: null, raw, diagnostics: [], parseError: error instanceof Error ? error.message : "Invalid JSON" }; } }
export function serializeDataset(dataset: Dataset): string { return JSON.stringify(dataset, null, 2); }
export function validateDatasetForExport(dataset: Dataset): Diagnostic[] { return (validateDataset(dataset) as { diagnostics: Diagnostic[] }).diagnostics; }
export function getDatasetMetadata(dataset: Dataset): { datasetId: string | null; title: string | null } { const extensions = dataset.extensions; if (typeof extensions !== "object" || extensions === null) return { datasetId: null, title: null }; const metadata = (extensions as Record<string, unknown>).metadata; if (typeof metadata !== "object" || metadata === null) return { datasetId: null, title: null }; const value = metadata as Record<string, unknown>; return { datasetId: typeof value.datasetId === "string" && value.datasetId.trim() ? value.datasetId : null, title: typeof value.title === "string" && value.title.trim() ? value.title : null }; }
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
