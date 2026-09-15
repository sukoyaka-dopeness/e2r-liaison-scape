import type { Dataset, GraphNode } from "../../src/dataset.ts";
import { buildEntityGraph } from "../../src/dataset.ts";
import { solveAutoLayout, settleInitialPlacement, type LayoutPoint } from "../../src/auto-layout.ts";
import type { RoutingGraphEdge } from "../../src/graph-presentation.ts";

export type PracticalityCaseId = "sparse" | "dense" | "long-label" | "connected" | "parallel-self-loop";

export type PracticalityCase = {
  id: PracticalityCaseId;
  description: string;
  dataset: Dataset;
  graph: { nodes: GraphNode[]; edges: RoutingGraphEdge[] };
};

function makeCase(id: PracticalityCaseId, nodeCount: number, edgeCount: number, options: { longLabels?: boolean; connected?: boolean; parallel?: boolean; selfLoop?: boolean } = {}): PracticalityCase {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-node-${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index) => {
    const sourceIndex = options.parallel && index < 4 ? 0 : index % nodeCount;
    const targetIndex = options.selfLoop && index === 0
      ? sourceIndex
      : options.connected && index < nodeCount - 1
        ? (sourceIndex + 1) % nodeCount
        : options.parallel && index < 4
          ? 1
          : (index * 3 + 1) % nodeCount;
    return {
      id: `${id}-relation-${index}`,
      sourceId: ids[sourceIndex]!,
      targetId: ids[targetIndex]!,
      name: options.longLabels
        ? `Relation ${index} with a long English and Japanese presentation label`
        : `Relation ${index}`,
    };
  });
  const dataset: Dataset = {
    version: "1.0",
    entities: ids.map((entityId, index) => ({
      id: entityId,
      name: options.longLabels ? `Node ${index} with a long presentation label` : `Node ${index}`,
      description: options.longLabels ? "A bounded general Dataset description" : "",
    })),
    events: [],
    relations,
  };
  const graph = buildEntityGraph(dataset);
  const edges: RoutingGraphEdge[] = graph.edges.map((edge) => ({
    ...edge,
    label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
  }));
  return { id, description: `${nodeCount} nodes / ${edgeCount} relations`, dataset, graph: { ...graph, edges } };
}

export function createPracticalityCases(): PracticalityCase[] {
  return [
    makeCase("sparse", 8, 7),
    makeCase("dense", 14, 49),
    makeCase("long-label", 10, 20, { longLabels: true }),
    makeCase("connected", 14, 49, { longLabels: true, connected: true }),
    makeCase("parallel-self-loop", 10, 18, { parallel: true, selfLoop: true }),
  ];
}

export function positionsFor(practicalityCase: PracticalityCase, phase: "fast" | "hq"): Record<string, LayoutPoint> {
  const input = {
    entities: practicalityCase.dataset.entities.map(({ id }) => ({ id })),
    relations: practicalityCase.dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
  };
  return phase === "fast"
    ? settleInitialPlacement(input)
    : solveAutoLayout(input, { iterations: 12 });
}
