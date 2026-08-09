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

export type GraphNode = { id: string; label: string; x: number; y: number };
export type GraphEdge = { id: string; sourceId: string; targetId: string };

export function buildEntityGraph(dataset: Dataset): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = dataset.entities.map((entity, index) => ({
    id: entity.id,
    label: typeof entity.name === "string" && entity.name.trim() ? entity.name : entity.id,
    x: 140 + (index % 4) * 180,
    y: 110 + Math.floor(index / 4) * 130,
  }));
  const entityIds = new Set(nodes.map(({ id }) => id));
  const edges = dataset.relations.flatMap((relation) => {
    const sourceId = typeof relation.sourceId === "string" ? relation.sourceId : "";
    const targetId = typeof relation.targetId === "string" ? relation.targetId : "";
    if (!entityIds.has(sourceId) || !entityIds.has(targetId)) return [];
    return [{ id: relation.id, sourceId, targetId }];
  });
  return { nodes, edges };
}
