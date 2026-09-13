import fs from "node:fs";
import { discretePlacementAudit } from "./discrete-placement-feasibility.mjs";

const synthetic = (left, right, omit = null) => {
  const nodes = Array.from({ length: left + right }, (_, i) => ({ id: String(i) }));
  const edges = [];
  for (let a = 0; a < left; a += 1) for (let b = 0; b < right; b += 1) if (`${a}:${b}` !== omit) edges.push({ sourceId: String(a), targetId: String(left + b), label: "" });
  return { nodes, edges };
};
const inputs = [
  ...["lighthouse-restoration-demo", "titanic-final-voyage", "apollo-11-mission"].flatMap((fixture) => ["en", "ja"].map((locale) => {
    const path = `../e2r-spec/examples/${fixture}.${locale}.e2r.json`;
    const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
    const entities = dataset.entities ?? [];
    const entityIds = new Set(entities.map(({ id }) => id));
    return { name: `${fixture}/${locale}`, nodes: entities.map(({ id }) => ({ id })), edges: (dataset.relations ?? []).filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)).map((relation) => ({ sourceId: relation.sourceId, targetId: relation.targetId, label: relation.name ?? "" })) };
  })),
  ...[[7, 7, null], [6, 8, null], [8, 8, null], [5, 9, null], [7, 7, "0:0"]].map(([left, right, omit]) => ({ name: `synthetic:k${left}-${right}${omit ? "-minus-one" : ""}`, ...synthetic(left, right, omit) })),
];
const report = inputs.map(({ name, nodes, edges }) => ({ name, graph: { nodes: nodes.length, edges: edges.length }, plans: discretePlacementAudit(nodes, edges).map(({ family, positions, cheap }) => ({ family, feasible: Boolean(positions), cheap })) }));
fs.mkdirSync("experimental/discrete-placement-feasibility", { recursive: true });
fs.writeFileSync("experimental/discrete-placement-feasibility/audit.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.map(({ name, graph, plans }) => ({ name, graph, families: plans.length, feasible: plans.filter(({ feasible }) => feasible).length, maxStates: Math.max(...plans.map(({ cheap }) => cheap.states)), totalPrunedSector: plans.reduce((sum, { cheap }) => sum + cheap.prunedSector, 0), totalPrunedCorridor: plans.reduce((sum, { cheap }) => sum + cheap.prunedCorridor, 0) })) , null, 2));
