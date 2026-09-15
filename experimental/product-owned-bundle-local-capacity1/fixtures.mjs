export function sharedEndpointBundles() {
  const entity = (id, name) => ({ id, name });
  const relation = (id, sourceId, targetId, name) => ({ id, sourceId, targetId, name });
  return {
    version: "1.0",
    entities: [
      entity("a", "Shared owner"), entity("b", "Reverse peer"),
      entity("c", "Same-direction peer"), entity("d", "North ordinary"),
      entity("e", "East ordinary"), entity("f", "South ordinary"),
    ],
    events: [],
    relations: [
      relation("ab-1", "a", "b", "delegates"), relation("ab-2", "a", "b", "reviews"),
      relation("ba-1", "b", "a", "reports back"), relation("ba-2", "b", "a", "escalates"),
      relation("ac-1", "a", "c", "coordinates"), relation("ac-2", "a", "c", "supports"),
      relation("da", "d", "a", "advises"), relation("be", "b", "e", "supplies"),
      relation("cf", "c", "f", "archives"),
    ],
  };
}
