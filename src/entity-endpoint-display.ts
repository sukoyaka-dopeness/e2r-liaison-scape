import type { E2RObject } from "./models";

function trimmedName(entity: E2RObject): string | null {
  if (typeof entity.name !== "string") return null;
  const name = entity.name.trim();
  return name || null;
}

function minimumUniquePrefix(id: string, duplicateIds: string[]): string {
  for (let length = 1; length <= id.length; length += 1) {
    const prefix = id.slice(0, length);
    if (duplicateIds.every((duplicateId) => duplicateId === id || !duplicateId.startsWith(prefix))) return prefix;
  }
  return id;
}

export function buildEntityEndpointLabels(entities: E2RObject[]): Map<string, string> {
  const idsByName = new Map<string, string[]>();
  for (const entity of entities) {
    const name = trimmedName(entity);
    if (name) idsByName.set(name, [...(idsByName.get(name) ?? []), entity.id]);
  }

  return new Map(entities.map((entity) => {
    const name = trimmedName(entity);
    if (!name) return [entity.id, entity.id];
    const duplicateIds = idsByName.get(name) ?? [];
    return [entity.id, duplicateIds.length > 1 ? `${name} (${minimumUniquePrefix(entity.id, duplicateIds)})` : name];
  }));
}
