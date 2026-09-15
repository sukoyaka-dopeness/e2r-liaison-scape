export { horizontalLabelCapacity, verticalLabelCapacity, diagonalLabelCapacity } from "../product-relation-label-display-only-wrap1/fixtures.mjs";

export function highDegreeAngularCapacity() {
  const neighbors = ["a", "b", "c", "d", "e", "f", "g"];
  return {
    version: "1.0",
    entities: ["hub", ...neighbors].map((id) => ({ id, name: id === "hub" ? "Central Hub" : `Neighbor ${id.toUpperCase()}` })),
    events: [],
    relations: neighbors.map((targetId, index) => ({
      id: `hub-${targetId}`,
      sourceId: "hub",
      targetId,
      name: index % 2 === 0 ? "primary association" : "secondary association",
    })),
  };
}

export function denseAngularCapacity() {
  const ids = ["north", "south", "east", "west", "center"];
  return {
    version: "1.0",
    entities: ids.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
    events: [],
    relations: [
      { id: "center-north", sourceId: "center", targetId: "north", name: "supports" },
      { id: "center-east", sourceId: "center", targetId: "east", name: "coordinates" },
      { id: "center-south", sourceId: "center", targetId: "south", name: "depends on" },
      { id: "center-west", sourceId: "center", targetId: "west", name: "references" },
      { id: "north-south", sourceId: "north", targetId: "south", name: "ordinary relation" },
      { id: "east-west", sourceId: "east", targetId: "west", name: "ordinary relation" },
    ],
  };
}
