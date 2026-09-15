export function bipartite(leftSize, rightSize) {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return {
    version: "1.0",
    entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })),
    events: [],
    relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))),
  };
}

export function labelHeavyJa() {
  const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`);
  return {
    version: "1.0",
    entities: ids.map((id, index) => ({
      id,
      name: `日本語の長いノードラベル ${index} 災害対応確認`,
      description: "長い説明文を含む日本語の表示確認用ノード",
    })),
    events: [],
    relations: Array.from({ length: 20 }, (_, index) => ({
      id: `label-r${index}`,
      sourceId: ids[index % ids.length],
      targetId: ids[(index * 3 + 1) % ids.length],
      name: `長い日本語Relationラベル ${index} の表示と所有関係を確認する`,
    })),
  };
}

export function parallelSelfLoop() {
  const ids = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  const relations = [
    ["r-ab-1", "alpha", "beta", "relates"],
    ["r-ab-2", "alpha", "beta", "supports"],
    ["r-ba-1", "beta", "alpha", "returns"],
    ["r-ba-2", "beta", "alpha", "reverses"],
    ["r-cd-1", "gamma", "delta", "links"],
    ["r-cd-2", "gamma", "delta", "tracks"],
    ["r-loop", "epsilon", "epsilon", "self monitors"],
    ["r-ef", "epsilon", "zeta", "connects"],
    ["r-fg", "zeta", "eta", "connects"],
    ["r-gh", "eta", "theta", "connects"],
    ["r-he", "theta", "epsilon", "connects"],
  ];
  return {
    version: "1.0",
    entities: ids.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
    events: [],
    relations: relations.map(([id, sourceId, targetId, name]) => ({ id, sourceId, targetId, name })),
  };
}
