function entities(ids) {
  return ids.map((id) => ({ id, name: id.toUpperCase() }));
}

export function horizontalLabelCapacity() {
  return {
    version: "1.0",
    entities: entities(["a", "b", "c"]),
    events: [],
    relations: [
      { id: "ab-short", sourceId: "a", targetId: "b", name: "short" },
      { id: "ab-long", sourceId: "a", targetId: "b", name: "Long horizontal relation label" },
      { id: "ab-longer", sourceId: "a", targetId: "b", name: "Another very long horizontal relation label" },
      { id: "bc", sourceId: "b", targetId: "c", name: "ordinary" },
    ],
  };
}

export function verticalLabelCapacity() {
  return {
    version: "1.0",
    entities: entities(["a", "b", "c"]),
    events: [],
    relations: [
      { id: "ab-one", sourceId: "a", targetId: "b", name: "Vertical label one" },
      { id: "ab-two", sourceId: "a", targetId: "b", name: "Vertical label two is longer" },
      { id: "ab-three", sourceId: "a", targetId: "b", name: "Vertical label three" },
      { id: "ac", sourceId: "a", targetId: "c", name: "ordinary" },
    ],
  };
}

export function diagonalLabelCapacity() {
  return {
    version: "1.0",
    entities: entities(["a", "b", "c", "d"]),
    events: [],
    relations: [
      { id: "ab-one", sourceId: "a", targetId: "b", name: "Diagonal one" },
      { id: "ab-two", sourceId: "a", targetId: "b", name: "Diagonal two with a longer label" },
      { id: "ba", sourceId: "b", targetId: "a", name: "Diagonal reverse" },
      { id: "cd", sourceId: "c", targetId: "d", name: "ordinary" },
    ],
  };
}
