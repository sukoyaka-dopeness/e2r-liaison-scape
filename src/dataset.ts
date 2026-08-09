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

export function validateDatasetForExport(dataset: Dataset): Diagnostic[] {
  const result = validateDataset(dataset) as { diagnostics: Diagnostic[] };
  return result.diagnostics;
}

export type GraphNode = { id: string; label: string; x: number; y: number };
export type GraphEdge = { id: string; sourceId: string; targetId: string; parallelIndex: number; parallelCount: number };
export type Coordinate = { x: number; y: number };

function isCoordinate(value: unknown): value is Coordinate {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).x === "number" && typeof (value as Record<string, unknown>).y === "number";
}

export function getStoredCoordinates(dataset: Dataset): Record<string, Coordinate> {
  const result: Record<string, Coordinate> = {};
  for (const entity of dataset.entities) {
    const extension = entity.extensions;
    if (typeof extension !== "object" || extension === null) continue;
    const coordinate = (extension as Record<string, unknown>).coordinate;
    if (typeof coordinate !== "object" || coordinate === null) continue;
    const positions = (coordinate as Record<string, unknown>).positions;
    if (Array.isArray(positions)) {
      const position = positions.find((value) => isCoordinate(value) && (value as Record<string, unknown>).spaceId === "linkscape") ?? positions.find(isCoordinate);
      if (position) result[entity.id] = { x: position.x, y: position.y };
    }
  }
  return result;
}

export function applyStoredCoordinates(dataset: Dataset, positions: Record<string, Coordinate>): Dataset {
  const copy = structuredClone(dataset) as Dataset;
  copy.entities = copy.entities.map((entity) => {
    const position = positions[entity.id];
    if (!position) return entity;
    const extensions = typeof entity.extensions === "object" && entity.extensions !== null ? entity.extensions as Record<string, unknown> : {};
    const coordinate = typeof extensions.coordinate === "object" && extensions.coordinate !== null ? extensions.coordinate as Record<string, unknown> : {};
    const existing = Array.isArray(coordinate.positions) ? coordinate.positions as unknown[] : [];
    const withoutLinkscape = existing.filter((value) => !(isCoordinate(value) && (value as Record<string, unknown>).spaceId === "linkscape"));
    return { ...entity, extensions: { ...extensions, coordinate: { ...coordinate, positions: [...withoutLinkscape, { spaceId: "linkscape", x: position.x, y: position.y }] } } };
  });
  return copy;
}

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
  return { nodes, edges };
}

export function getEntityDetail(dataset: Dataset, entityId: string) {
  const entity = dataset.entities.find((candidate) => candidate.id === entityId);
  if (!entity) return null;
  const relationIds = dataset.relations
    .filter((relation) => relation.sourceId === entityId || relation.targetId === entityId)
    .map((relation) => relation.id);
  return { entity, relationIds };
}
