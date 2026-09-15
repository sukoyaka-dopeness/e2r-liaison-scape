export { horizontalLabelCapacity, verticalLabelCapacity, diagonalLabelCapacity } from "../product-owned-orientation-aware-label-capacity1/fixtures.mjs";

function entities(ids) {
  return ids.map((id) => ({ id, name: id.toUpperCase() }));
}

export function japaneseLabelCapacity() {
  return {
    version: "1.0",
    entities: entities(["a", "b", "c"]),
    events: [],
    relations: [
      { id: "ab-short", sourceId: "a", targetId: "b", name: "復旧支援" },
      { id: "ab-long", sourceId: "a", targetId: "b", name: "地域復旧調整を支援する関係ラベル" },
      { id: "ab-longer", sourceId: "a", targetId: "b", name: "長い日本語の復旧調整関係ラベル" },
      { id: "bc", sourceId: "b", targetId: "c", name: "通常" },
    ],
  };
}

export function englishTokenCapacity() {
  return {
    version: "1.0",
    entities: entities(["a", "b", "c"]),
    events: [],
    relations: [
      { id: "ab-token", sourceId: "a", targetId: "b", name: "Supercalifragilisticexpialidocious" },
      { id: "ab-punctuation", sourceId: "a", targetId: "b", name: "supports:regional/restoration coordination" },
      { id: "ab-short", sourceId: "a", targetId: "b", name: "short" },
      { id: "bc", sourceId: "b", targetId: "c", name: "ordinary" },
    ],
  };
}
