// Bounded architecture probe for narrow graph decomposition.
// It measures whether biconnected local subproblems can be bounded while
// retaining an explicit shared-endpoint capacity contract. It does not place
// Product routes or labels and does not change the Product provider.
import { discretePlacementAudit } from "./discrete-placement-feasibility.mjs";

const MAX_NODES = 64;
const MAX_EDGES = 256;
const MAX_COMPONENTS = 32;
const MAX_PRODUCT = 1_000_000_000;

function boundedProduct(values) {
  return values.reduce((product, value) => Math.min(MAX_PRODUCT, product * Math.max(1, value)), 1);
}

function simpleGraph(nodes, edges) {
  const ids = nodes.map(({ id }) => id).sort();
  if (ids.length > MAX_NODES || edges.length > MAX_EDGES || new Set(ids).size !== ids.length) throw new Error("decomposition input bound");
  const index = new Map(ids.map((id, i) => [id, i]));
  const adjacency = ids.map(() => []);
  const validEdges = [];
  const sortedEdges = [...edges].sort((left, right) => String(left.id ?? `${left.sourceId}->${left.targetId}:${left.label ?? ""}`).localeCompare(String(right.id ?? `${right.sourceId}->${right.targetId}:${right.label ?? ""}`)));
  for (const [edgeIndex, edge] of sortedEdges.entries()) {
    const source = index.get(edge.sourceId), target = index.get(edge.targetId);
    if (source === undefined || target === undefined) continue;
    const record = { edgeIndex, source, target, edge };
    validEdges.push(record);
    if (source !== target) {
      adjacency[source].push(record);
      adjacency[target].push(record);
    }
  }
  return { ids, index, adjacency, validEdges };
}

function biconnectedComponents(graph) {
  const { ids, adjacency, validEdges } = graph;
  const discovery = Array(ids.length).fill(0);
  const low = Array(ids.length).fill(0);
  const edgeStack = [];
  const components = [];
  let clock = 0;

  const emitUntil = (edgeIndex) => {
    const componentEdges = [];
    let current;
    do {
      current = edgeStack.pop();
      if (current !== undefined) componentEdges.push(current);
    } while (current !== edgeIndex && edgeStack.length > 0);
    if (componentEdges.length > 0) components.push(componentEdges);
  };

  const visit = (vertex, parentEdgeIndex) => {
    discovery[vertex] = low[vertex] = ++clock;
    for (const record of adjacency[vertex]) {
      if (record.edgeIndex === parentEdgeIndex) continue;
      const other = record.source === vertex ? record.target : record.source;
      if (!discovery[other]) {
        edgeStack.push(record);
        visit(other, record.edgeIndex);
        low[vertex] = Math.min(low[vertex], low[other]);
        if (low[other] >= discovery[vertex]) emitUntil(record.edgeIndex);
      } else if (discovery[other] < discovery[vertex]) {
        edgeStack.push(record);
        low[vertex] = Math.min(low[vertex], discovery[other]);
      }
    }
  };

  for (let vertex = 0; vertex < ids.length; vertex += 1) {
    if (!discovery[vertex]) visit(vertex, -1);
  }

  const edgeComponent = new Map();
  const output = components.map((records, componentIndex) => {
    const edgeIndexes = records.map(({ edgeIndex }) => edgeIndex).sort((a, b) => a - b);
    for (const edgeIndex of edgeIndexes) edgeComponent.set(edgeIndex, componentIndex);
    return { id: `component-${componentIndex + 1}`, edgeIndexes, nodeIndexes: [...new Set(records.flatMap(({ source, target }) => [source, target]))].sort((a, b) => a - b) };
  });

  // Isolated vertices and self-relations do not participate in the DFS edge
  // stack, but they still require a local placement responsibility.
  for (let vertex = 0; vertex < ids.length; vertex += 1) {
    const incident = validEdges.filter(({ source, target }) => source === vertex || target === vertex);
    if (output.every(({ nodeIndexes }) => !nodeIndexes.includes(vertex))) {
      const componentIndex = output.length;
      const edgeIndexes = incident.map(({ edgeIndex }) => edgeIndex).sort((a, b) => a - b);
      for (const edgeIndex of edgeIndexes) edgeComponent.set(edgeIndex, componentIndex);
      output.push({ id: `component-${componentIndex + 1}`, edgeIndexes, nodeIndexes: [vertex] });
    }
  }
  output.sort((left, right) => left.edgeIndexes[0] - right.edgeIndexes[0] || left.nodeIndexes[0] - right.nodeIndexes[0]);
  edgeComponent.clear();
  output.forEach((component, componentIndex) => component.edgeIndexes.forEach((edgeIndex) => edgeComponent.set(edgeIndex, componentIndex)));
  if (output.length > MAX_COMPONENTS) throw new Error("decomposition component bound");
  return { components: output, edgeComponent };
}

function labelDemand(edge) {
  return Math.max(0, String(edge.label ?? "").length * 8);
}

function localAudit(nodes, edges) {
  if (nodes.length === 0) return { families: 0, feasibleFamilies: 0, maxStates: 0, stateCapHits: 0, totalStates: 0 };
  const plans = discretePlacementAudit(nodes, edges);
  return {
    families: plans.length,
    feasibleFamilies: plans.filter(({ positions }) => Boolean(positions)).length,
    maxStates: Math.max(...plans.map(({ cheap }) => cheap.states), 0),
    stateCapHits: plans.filter(({ cheap }) => cheap.states >= cheap.stateLimit).length,
    totalStates: plans.reduce((sum, { cheap }) => sum + cheap.states, 0),
  };
}

export function decompositionCapacityAudit(nodes, edges) {
  const graph = simpleGraph(nodes, edges);
  const { components, edgeComponent } = biconnectedComponents(graph);
  const nodeMembership = new Map(graph.ids.map((id) => [id, []]));
  const componentRows = components.map((component, componentIndex) => {
    const componentNodes = component.nodeIndexes.map((index) => ({ id: graph.ids[index] }));
    const componentEdges = component.edgeIndexes.map((edgeIndex) => graph.validEdges.find(({ edgeIndex: candidate }) => candidate === edgeIndex).edge);
    for (const node of componentNodes) nodeMembership.get(node.id).push(componentIndex);
    const audit = localAudit(componentNodes, componentEdges);
    return { id: component.id, nodes: componentNodes.length, edges: componentEdges.length, nodeIds: componentNodes.map(({ id }) => id), local: audit };
  });

  const contracts = [];
  for (const [nodeId, memberships] of nodeMembership) {
    if (memberships.length < 2) continue;
    const nodeEdges = graph.validEdges.filter(({ source, target }) => graph.ids[source] === nodeId || graph.ids[target] === nodeId);
    const byComponent = memberships.map((componentIndex) => {
      const relationEdges = nodeEdges.filter(({ edgeIndex }) => edgeComponent.get(edgeIndex) === componentIndex);
      return {
        componentId: components[componentIndex].id,
        relationCount: relationEdges.length,
        labelDemandPx: relationEdges.reduce((sum, { edge }) => sum + labelDemand(edge), 0),
        relationIds: relationEdges.map(({ edge }) => edge.id ?? `${edge.sourceId}->${edge.targetId}`).sort(),
      };
    });
    const relationCount = byComponent.reduce((sum, item) => sum + item.relationCount, 0);
    contracts.push({
      nodeId,
      componentCount: memberships.length,
      relationCount,
      requiredAngularSpanDeg: Math.min(360, relationCount * 8),
      labelDemandPx: byComponent.reduce((sum, item) => sum + item.labelDemandPx, 0),
      byComponent,
      classification: relationCount >= 6 || memberships.length >= 3 ? "global-bottleneck" : "shared-endpoint",
    });
  }

  const localPlanCounts = componentRows.map(({ local }) => local.feasibleFamilies);
  const localSearchProduct = boundedProduct(componentRows.map(({ local }) => Math.max(1, local.maxStates)));
  const finalistCombinationUpperBound = boundedProduct(localPlanCounts);
  const globalBottleneckCount = contracts.filter(({ classification }) => classification === "global-bottleneck").length;
  const hasGlobalCore = componentRows.length === 1 && graph.ids.length > 1;
  return {
    graph: { nodes: graph.ids.length, edges: graph.validEdges.length },
    decomposition: {
      componentCount: componentRows.length,
      components: componentRows,
      hasGlobalCore,
      topologySignal: hasGlobalCore ? "global-core-retained" : contracts.length ? "local-order-plus-boundary-contract" : "independent-components",
    },
    capacityContract: {
      boundaryCount: contracts.length,
      globalBottleneckCount,
      contracts,
      status: globalBottleneckCount > 0 ? "global-coupling-remains" : contracts.length ? "explicit-boundary-contract" : "no-cross-boundary-demand",
    },
    boundedness: {
      maxLocalStates: Math.max(...componentRows.map(({ local }) => local.maxStates), 0),
      stateCapHits: componentRows.reduce((sum, { local }) => sum + local.stateCapHits, 0),
      localSearchProduct,
      finalistCombinationUpperBound,
      finalistBounded: finalistCombinationUpperBound < MAX_PRODUCT,
    },
  };
}
