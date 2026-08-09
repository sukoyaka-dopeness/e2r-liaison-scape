import { validateDataset } from "@sukoyaka-dopeness/e2r-validator";

export type E2RObject = Record<string, unknown> & { id: string };

export type Dataset = {
  version: string;
  entities: E2RObject[];
  events: E2RObject[];
  relations: E2RObject[];
  [key: string]: unknown;
};

export type Diagnostic = {
  severity: "error" | "warning";
  code: string;
  path: string;
  relatedIds?: string[];
};

export type LoadResult = {
  dataset: Dataset | null;
  raw: string;
  diagnostics: Diagnostic[];
  parseError?: string;
};

export function loadDataset(raw: string): LoadResult {
  try {
    const value: unknown = JSON.parse(raw);
    const result = validateDataset(value) as { valid: boolean; diagnostics: Diagnostic[] };
    return {
      dataset: result.valid ? (value as Dataset) : null,
      raw,
      diagnostics: result.diagnostics,
    };
  } catch (error) {
    return {
      dataset: null,
      raw,
      diagnostics: [],
      parseError: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

export function serializeDataset(dataset: Dataset): string {
  return JSON.stringify(dataset, null, 2);
}
