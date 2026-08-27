import type { Dataset, E2RObject } from "./models";

export type RelatedRelationDisplay = { relationName: string | null; source: string; target: string; relationId: string };
export type RelationBlockerDisplay = RelatedRelationDisplay & { relationIdHint?: string; hiddenFromGraph: boolean };

function trimmedName(object: E2RObject | undefined): string | null {
  if (typeof object?.name !== "string") return null;
  const name = object.name.trim();
  return name || null;
}

function shortId(id: string, duplicateIds: string[]): string {
  for (let length = 8; length <= id.length; length += 1) {
    const candidate = id.slice(0, length);
    if (duplicateIds.every((duplicateId) => duplicateId === id || !duplicateId.startsWith(candidate))) return candidate;
  }
  return id;
}

function endpointDisplay(id: unknown, objects: E2RObject[], names: Map<string, string[]>): string {
  const rawId = typeof id === "string" ? id : String(id ?? "");
  const object = objects.find((candidate) => candidate.id === rawId);
  const name = trimmedName(object);
  if (!name) return rawId;
  const duplicates = names.get(name) ?? [];
  return duplicates.length > 1 ? `${name} (${shortId(rawId, duplicates)})` : name;
}

export function buildRelatedRelationDisplay(dataset: Dataset, relation: E2RObject): RelatedRelationDisplay {
  const objects = [...dataset.entities, ...dataset.events];
  const names = new Map<string, string[]>();
  for (const object of objects) {
    const name = trimmedName(object);
    if (name) names.set(name, [...(names.get(name) ?? []), object.id]);
  }
  return { relationName: trimmedName(relation), source: endpointDisplay(relation.sourceId, objects, names), target: endpointDisplay(relation.targetId, objects, names), relationId: relation.id };
}

function shortRelationId(id: string, ids: string[]): string {
  for (let length = 8; length <= id.length; length += 1) {
    const candidate = id.slice(0, length);
    if (ids.every((other) => other === id || !other.startsWith(candidate))) return candidate;
  }
  return id;
}

export function buildRelationBlockerDisplays(dataset: Dataset, relations: E2RObject[]): Map<string, RelationBlockerDisplay> {
  const displays = relations.map((relation) => buildRelatedRelationDisplay(dataset, relation));
  const keys = displays.map((display) => `${display.relationName ?? ""}\u0000${display.source}\u0000${display.target}`);
  const duplicateIds = new Map<string, string[]>();
  keys.forEach((key, index) => duplicateIds.set(key, [...(duplicateIds.get(key) ?? []), relations[index].id]));
  return new Map(relations.map((relation, index) => {
    const display = displays[index];
    const ids = duplicateIds.get(keys[index]) ?? [];
    return [relation.id, {
      ...display,
      ...(ids.length > 1 ? { relationIdHint: shortRelationId(relation.id, ids) } : {}),
      hiddenFromGraph: !dataset.entities.some(({ id }) => id === relation.sourceId)
        || !dataset.entities.some(({ id }) => id === relation.targetId),
    }];
  }));
}
