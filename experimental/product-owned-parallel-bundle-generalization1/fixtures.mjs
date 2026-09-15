export function higherMultiplicityParallel() {
  const entities = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
  return {
    version: "1.0",
    entities,
    events: [],
    relations: [
      ...Array.from({ length: 5 }, (_, index) => ({ id: `p-${index + 1}`, sourceId: "a", targetId: "b", name: `parallel ${index + 1}` })),
      { id: "ordinary-ca", sourceId: "c", targetId: "a", name: "incoming" },
      { id: "ordinary-bd", sourceId: "b", targetId: "d", name: "outgoing" },
    ],
  };
}

export function mixedIncidentParallel() {
  const entities = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, name: id.toUpperCase() }));
  return {
    version: "1.0",
    entities,
    events: [],
    relations: [
      { id: "ab-1", sourceId: "a", targetId: "b", name: "forward one" },
      { id: "ab-2", sourceId: "a", targetId: "b", name: "forward two" },
      { id: "ba-1", sourceId: "b", targetId: "a", name: "reverse one" },
      { id: "ba-2", sourceId: "b", targetId: "a", name: "reverse two" },
      { id: "ac", sourceId: "a", targetId: "c", name: "ordinary from A" },
      { id: "bd", sourceId: "b", targetId: "d", name: "ordinary from B" },
      { id: "ce", sourceId: "c", targetId: "e", name: "ordinary chain" },
      { id: "df", sourceId: "d", targetId: "f", name: "ordinary chain" },
      { id: "ea", sourceId: "e", targetId: "a", name: "incident return" },
      { id: "fb", sourceId: "f", targetId: "b", name: "incident return" },
    ],
  };
}
