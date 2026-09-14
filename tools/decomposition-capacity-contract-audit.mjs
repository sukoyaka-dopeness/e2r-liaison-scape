import fs from "node:fs";
import { decompositionCapacityAudit } from "./decomposition-capacity-contract.mjs";

const bipartite = (left, right, omit = null) => {
  const nodes = Array.from({ length: left + right }, (_, i) => ({ id: String(i) }));
  const edges = [];
  for (let a = 0; a < left; a += 1) for (let b = 0; b < right; b += 1) if (`${a}:${b}` !== omit) edges.push({ id: `e-${a}-${b}`, sourceId: String(a), targetId: String(left + b), label: b % 2 ? "long relation label" : "" });
  return { nodes, edges };
};

const ring = (count) => ({
  nodes: Array.from({ length: count }, (_, i) => ({ id: String(i) })),
  edges: Array.from({ length: count }, (_, i) => ({ id: `e-${i}`, sourceId: String(i), targetId: String((i + 1) % count), label: i % 3 ? "" : "ring label" })),
});

const decomposable = () => {
  const nodes = Array.from({ length: 13 }, (_, i) => ({ id: String(i) }));
  const edges = [];
  for (let block = 0; block < 4; block += 1) {
    const center = String(block * 3);
    for (const leaf of [block * 3 + 1, block * 3 + 2]) edges.push({ id: `e-${center}-${leaf}`, sourceId: center, targetId: String(leaf), label: leaf % 2 ? "cross boundary label" : "" });
    if (block < 3) edges.push({ id: `bridge-${block}`, sourceId: center, targetId: String((block + 1) * 3), label: "bridge" });
  }
  return { nodes, edges };
};

const readFixture = (name, locale) => {
  const dataset = JSON.parse(fs.readFileSync(`../e2r-spec/examples/${name}.${locale}.e2r.json`, "utf8"));
  const ids = new Set((dataset.entities ?? []).map(({ id }) => id));
  return {
    nodes: [...ids].map((id) => ({ id })),
    edges: (dataset.relations ?? []).filter(({ sourceId, targetId }) => ids.has(sourceId) && ids.has(targetId)).map((relation) => ({ id: relation.id, sourceId: relation.sourceId, targetId: relation.targetId, label: relation.name ?? "" })),
  };
};

const inputs = [
  ...["lighthouse-restoration-demo", "titanic-final-voyage", "apollo-11-mission"].flatMap((fixture) => ["en", "ja"].map((locale) => ({ name: `canonical:${fixture}/${locale}`, ...readFixture(fixture, locale) }))),
  { name: "dense:k7-7", ...bipartite(7, 7) },
  { name: "dense:k7-7-minus-one", ...bipartite(7, 7, "0:0") },
  { name: "dense:k8-8", ...bipartite(8, 8) },
  { name: "symmetric:ring-12", ...ring(12) },
  { name: "decomposable:four-block-chain", ...decomposable() },
];

const rows = inputs.map(({ name, nodes, edges }) => ({ name, ...decompositionCapacityAudit(nodes, edges) }));
fs.mkdirSync("experimental/decomposition-capacity-contract", { recursive: true });
fs.writeFileSync("experimental/decomposition-capacity-contract/audit.json", `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ name, graph, decomposition, capacityContract, boundedness }) => ({
  name,
  graph,
  components: decomposition.componentCount,
  topologySignal: decomposition.topologySignal,
  boundaryCount: capacityContract.boundaryCount,
  globalBottleneckCount: capacityContract.globalBottleneckCount,
  maxLocalStates: boundedness.maxLocalStates,
  stateCapHits: boundedness.stateCapHits,
  localSearchProduct: boundedness.localSearchProduct,
  finalistCombinationUpperBound: boundedness.finalistCombinationUpperBound,
})), null, 2));
