import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticRelationLabels, deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, relationLabelDisplayWidth, routeGraphEdge, routeSamplesHaveNodeInfluence } from "../src/viewport.ts";
import { decideIncidentAllocation } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/incident-allocation.ts";
import { planEndpointAllocations } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/endpoint-plan.ts";
import { isCompressedGeometryFamilyMember } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/candidate-compression.ts";

const canonicalExamples = "C:/Users/extra/E2R/e2r-spec/examples";
const canonicalCells = [
  ["lighthouse", "en", `${canonicalExamples}/lighthouse-restoration-demo.en.e2r.json`],
  ["lighthouse", "ja", `${canonicalExamples}/lighthouse-restoration-demo.ja.e2r.json`],
  ["titanic", "en", `${canonicalExamples}/titanic-final-voyage.en.e2r.json`],
  ["titanic", "ja", `${canonicalExamples}/titanic-final-voyage.ja.e2r.json`],
  ["apollo-11", "en", `${canonicalExamples}/apollo-11-mission.en.e2r.json`],
  ["apollo-11", "ja", `${canonicalExamples}/apollo-11-mission.ja.e2r.json`],
];

function syntheticBundle(reverse = false) {
  const nodes = [
    { id: "a", name: "Source", description: "" },
    { id: "b", name: "Target", description: "" },
    { id: "outer", name: "Outer ordinary", description: "" },
    { id: "obstacle", name: "Nearby obstacle", description: "" },
    { id: "obstacle-target", name: "Obstacle target", description: "" },
  ];
  const parallelLabels = [
    "Long parallel Relation label alpha",
    "Long parallel Relation label beta",
    "short",
  ];
  const relations = reverse
    ? [
      { id: "p1", name: parallelLabels[0], sourceId: "a", targetId: "b" },
      { id: "p2", name: parallelLabels[1], sourceId: "a", targetId: "b" },
      { id: "p3", name: parallelLabels[2], sourceId: "b", targetId: "a" },
      { id: "p4", name: "short reverse", sourceId: "b", targetId: "a" },
      { id: "outer-edge", name: "nearby ordinary Relation", sourceId: "a", targetId: "outer" },
      { id: "obstacle-edge", name: "obstacle path", sourceId: "obstacle", targetId: "obstacle-target" },
    ]
    : [
      { id: "p1", name: parallelLabels[0], sourceId: "a", targetId: "b" },
      { id: "p2", name: parallelLabels[1], sourceId: "a", targetId: "b" },
      { id: "p3", name: parallelLabels[2], sourceId: "a", targetId: "b" },
      { id: "outer-edge", name: "nearby ordinary Relation", sourceId: "a", targetId: "outer" },
      { id: "obstacle-edge", name: "obstacle path", sourceId: "obstacle", targetId: "obstacle-target" },
    ];
  return {
    version: "1.0",
    entities: nodes,
    events: [],
    relations,
    positions: {
      a: { x: 0, y: 0 },
      b: { x: 360, y: 0 },
      outer: { x: 24, y: 180 },
      obstacle: { x: 180, y: 72 },
      "obstacle-target": { x: 180, y: 280 },
    },
  };
}

function syntheticTwoParallel(labelMode) {
  const labels = labelMode === "long-long"
    ? ["Long parallel Relation label alpha", "Long parallel Relation label beta"]
    : labelMode === "long-short"
      ? ["Long parallel Relation label alpha", "short B"]
    : ["short A", "short B"];
  return {
    version: "1.0",
    entities: [
      { id: "a", name: "Source", description: "" },
      { id: "b", name: "Target", description: "" },
      { id: "outer", name: "Outer ordinary", description: "" },
      { id: "obstacle", name: "Nearby obstacle", description: "" },
    ],
    events: [],
    relations: [
      { id: "p1", name: labels[0], sourceId: "a", targetId: "b" },
      { id: "p2", name: labels[1], sourceId: "a", targetId: "b" },
      { id: "outer-edge", name: "nearby ordinary Relation", sourceId: "a", targetId: "outer" },
    ],
    positions: {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 360 },
      outer: { x: 170, y: 200 },
      obstacle: { x: 72, y: 180 },
    },
  };
}

function syntheticMultipleOrdinary({ asymmetric = false } = {}) {
  return {
    version: "1.0",
    entities: ["a", "b", "o1", "o2", "o3", "obstacle"].map((id) => ({ id, name: id, description: "" })),
    events: [],
    relations: [
      { id: "p1", name: "Long parallel alpha", sourceId: "a", targetId: "b" },
      { id: "p2", name: "Long parallel beta", sourceId: "a", targetId: "b" },
      { id: "o1-edge", name: "ordinary one", sourceId: "a", targetId: "o1" },
      { id: "o2-edge", name: "ordinary two", sourceId: "a", targetId: "o2" },
      { id: "o3-edge", name: "ordinary three", sourceId: "b", targetId: "o3" },
    ],
    positions: {
      a: { x: 0, y: 0 }, b: { x: 360, y: 0 },
      o1: { x: 170, y: asymmetric ? 55 : 95 }, o2: { x: 80, y: -145 },
      o3: { x: 440, y: asymmetric ? 45 : 130 }, obstacle: { x: 180, y: 68 },
    },
  };
}

function syntheticSharedBundles(angleDegrees = 90) {
  const angle = angleDegrees * Math.PI / 180;
  return {
    version: "1.0",
    entities: ["hub", "right", "down", "ordinary"].map((id) => ({ id, name: id, description: "" })),
    events: [],
    relations: [
      { id: "right-a", name: "Long right parallel relation alpha", sourceId: "hub", targetId: "right" },
      { id: "right-b", name: "Long right parallel relation beta", sourceId: "hub", targetId: "right" },
      { id: "down-a", name: "Long angled parallel relation alpha", sourceId: "hub", targetId: "down" },
      { id: "down-b", name: "Long angled parallel relation beta", sourceId: "hub", targetId: "down" },
      { id: "ordinary-edge", name: "ordinary", sourceId: "hub", targetId: "ordinary" },
    ],
    positions: { hub: { x: 0, y: 0 }, right: { x: 360, y: 0 }, down: { x: Math.cos(angle) * 340, y: Math.sin(angle) * 340 }, ordinary: { x: 170, y: 105 } },
  };
}

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
}

function transformPositions(positions, mode) {
  const points = Object.values(positions);
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  };
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const transformed = mode === "mirror-x"
      ? { x: center.x - dx, y: point.y }
      : mode === "mirror-y"
        ? { x: point.x, y: center.y - dy }
        : mode === "rotate-90"
          ? { x: center.x - dy, y: center.y + dx }
          : { ...point };
    return [id, transformed];
  }));
}

function distancePointToSegment(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (first.x + t * dx), point.y - (first.y + t * dy));
}

function distancePointToPolyline(point, samples) {
  let minimum = Infinity;
  for (let index = 1; index < samples.length; index += 1) minimum = Math.min(minimum, distancePointToSegment(point, samples[index - 1], samples[index]));
  return minimum;
}

function rectDistance(first, second) {
  const dx = Math.max(Math.abs(first.x - second.x) - (first.width + second.width) / 2, 0);
  const dy = Math.max(Math.abs(first.y - second.y) - (first.height + second.height) / 2, 0);
  return Math.hypot(dx, dy);
}

function routeLength(samples) {
  return samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - samples[index].x, point.y - samples[index].y), 0);
}

function angularDistance(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function endpointAngularCapacity(group, edges, positions) {
  const endpointIds = [...new Set(group.flatMap((edge) => [edge.sourceId, edge.targetId]))];
  return Math.min(...endpointIds.map((endpointId) => {
    const otherEndpointId = endpointIds.find((id) => id !== endpointId);
    const endpoint = positions[endpointId];
    const otherEndpoint = positions[otherEndpointId];
    if (!endpoint || !otherEndpoint) return Infinity;
    const bundleAngle = Math.atan2(otherEndpoint.y - endpoint.y, otherEndpoint.x - endpoint.x);
    const ordinaryAngles = edges
      .filter((edge) => edge.parallelCount === 1 && (edge.sourceId === endpointId || edge.targetId === endpointId))
      .flatMap((edge) => {
        const neighborId = edge.sourceId === endpointId ? edge.targetId : edge.sourceId;
        const neighbor = positions[neighborId];
        return neighbor ? [Math.atan2(neighbor.y - endpoint.y, neighbor.x - endpoint.x)] : [];
      });
    return ordinaryAngles.length === 0 ? Infinity : Math.min(...ordinaryAngles.map((angle) => angularDistance(angle, bundleAngle)));
  }), Infinity) * 180 / Math.PI;
}

function incidentAngleFromBundle(edge, endpointIds, positions) {
  return Math.min(...endpointIds.flatMap((endpointId) => {
    if (edge.sourceId !== endpointId && edge.targetId !== endpointId) return [];
    const oppositeId = endpointIds.find((id) => id !== endpointId);
    const neighborId = edge.sourceId === endpointId ? edge.targetId : edge.sourceId;
    const endpoint = positions[endpointId];
    const opposite = positions[oppositeId];
    const neighbor = positions[neighborId];
    if (!endpoint || !opposite || !neighbor) return [];
    return [angularDistance(
      Math.atan2(neighbor.y - endpoint.y, neighbor.x - endpoint.x),
      Math.atan2(opposite.y - endpoint.y, opposite.x - endpoint.x),
    ) * 180 / Math.PI];
  }), Infinity);
}

function relieveIncidentAngularCapacity(edges, positions, minimumDegrees = 32) {
  const adjusted = clonePositions(positions);
  const minimum = minimumDegrees * Math.PI / 180;
  for (const group of parallelGroups(edges)) {
    const endpointIds = [...new Set(group.flatMap((edge) => [edge.sourceId, edge.targetId]))].sort();
    for (const endpointId of endpointIds) {
      const oppositeId = endpointIds.find((id) => id !== endpointId);
      const endpoint = adjusted[endpointId];
      const opposite = adjusted[oppositeId];
      if (!endpoint || !opposite) continue;
      const bundleAngle = Math.atan2(opposite.y - endpoint.y, opposite.x - endpoint.x);
      const incident = edges.filter((edge) => edge.parallelCount === 1 && (edge.sourceId === endpointId || edge.targetId === endpointId))
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const edge of incident) {
        const neighborId = edge.sourceId === endpointId ? edge.targetId : edge.sourceId;
        const neighbor = adjusted[neighborId];
        if (!neighbor) continue;
        const dx = neighbor.x - endpoint.x;
        const dy = neighbor.y - endpoint.y;
        const radius = Math.hypot(dx, dy);
        if (radius < 1) continue;
        const currentAngle = Math.atan2(dy, dx);
        const signedDelta = Math.atan2(Math.sin(currentAngle - bundleAngle), Math.cos(currentAngle - bundleAngle));
        if (Math.abs(signedDelta) >= minimum) continue;
        const direction = signedDelta === 0 ? (neighborId.localeCompare(endpointId) < 0 ? -1 : 1) : Math.sign(signedDelta);
        const targetAngle = bundleAngle + direction * minimum;
        adjusted[neighborId] = { x: endpoint.x + Math.cos(targetAngle) * radius, y: endpoint.y + Math.sin(targetAngle) * radius };
      }
    }
  }
  return adjusted;
}

function midpoint(samples) {
  return samples[Math.floor(samples.length / 2)] ?? samples[0] ?? { x: 0, y: 0 };
}

function groupKey(edge) {
  return [edge.sourceId, edge.targetId].sort().join("<->");
}

function parallelGroups(edges) {
  const groups = new Map();
  for (const edge of edges) {
    if (edge.parallelCount <= 1) continue;
    const group = groups.get(groupKey(edge)) ?? [];
    group.push(edge);
    groups.set(groupKey(edge), group);
  }
  return [...groups.values()].map((group) => group.sort((left, right) => left.parallelIndex - right.parallelIndex));
}

function groupMetrics(group, routes, positions, relationLabels, allRoutes, fitScale) {
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const selected = group.map((edge) => routeById.get(edge.id)).filter(Boolean);
  if (selected.length === 0) return null;
  const endpointIds = [...new Set(group.flatMap((edge) => [edge.sourceId, edge.targetId]))].sort();
  if (endpointIds.length < 2 || !positions[endpointIds[0]] || !positions[endpointIds[1]]) return null;
  const first = positions[endpointIds[0]];
  const second = positions[endpointIds[1]];
  const chord = { x: second.x - first.x, y: second.y - first.y };
  const chordLength = Math.max(1, Math.hypot(chord.x, chord.y));
  const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const signedOffsets = selected.map((route) => {
    const point = midpoint(route.samples);
    return (chord.x * (point.y - middle.y) - chord.y * (point.x - middle.x)) / chordLength;
  });
  const sortedOffsets = signedOffsets.slice().sort((left, right) => left - right);
  const offsetRange = sortedOffsets.at(-1) - sortedOffsets[0];
  const meanOffset = signedOffsets.reduce((sum, value) => sum + value, 0) / signedOffsets.length;
  const spread = Math.max(1, offsetRange / 2);
  const ordinaryRoutes = allRoutes.filter((route) => !group.some((edge) => edge.id === route.id));
  const outerClearance = Math.min(...selected.flatMap((route) => ordinaryRoutes.map((ordinary) => {
    let minimum = Infinity;
    const routeInterior = route.samples.length > 8 ? route.samples.slice(4, -4) : route.samples;
    const ordinaryInterior = ordinary.samples.length > 8 ? ordinary.samples.slice(4, -4) : ordinary.samples;
    for (const point of routeInterior) minimum = Math.min(minimum, distancePointToPolyline(point, ordinaryInterior));
    return minimum;
  })), Infinity);
  const labelCenters = selected.map((route) => relationLabels.get(route.id)).filter(Boolean);
  const labelClearance = Math.min(...labelCenters.flatMap((left, index) => labelCenters.slice(index + 1).map((right) => rectDistance(left, right))), Infinity);
  const labelAssociation = selected.map((route) => {
    const label = relationLabels.get(route.id);
    if (!label) return null;
    const own = distancePointToPolyline({ x: label.x, y: label.y }, route.samples);
    const other = Math.min(...selected.filter((candidate) => candidate.id !== route.id).map((candidate) => distancePointToPolyline({ x: label.x, y: label.y }, candidate.samples)), Infinity);
    return { id: route.id, ownRouteDistance: own, nearestOtherRouteDistance: other, ownershipMargin: other - own, width: label.width, height: label.height };
  }).filter(Boolean);
  const obstacleInfluence = selected.flatMap((route) => Object.entries(positions)
    .filter(([id]) => !endpointIds.includes(id))
    .filter(([, point]) => routeSamplesHaveNodeInfluence(route.samples, [point]))
    .map(([id]) => ({ routeId: route.id, nodeId: id })));
  const nodeSeparation = Math.min(...Object.values(positions).flatMap((left, leftIndex, values) => values.slice(leftIndex + 1).map((right) => Math.hypot(left.x - right.x, left.y - right.y))), Infinity);
  return {
    edgeIds: group.map((edge) => edge.id),
    parallelCount: group.length,
    signedLaneOffsets: signedOffsets.map((value) => Math.round(value * 10) / 10),
    laneSeparationGraph: sortedOffsets.length > 1 ? Math.min(...sortedOffsets.slice(1).map((value, index) => value - sortedOffsets[index])) : null,
    laneSeparationScreen: sortedOffsets.length > 1 ? Math.min(...sortedOffsets.slice(1).map((value, index) => value - sortedOffsets[index])) * fitScale : null,
    bundleMeanOffset: Math.round(meanOffset * 10) / 10,
    bundleOffsetRange: Math.round(offsetRange * 10) / 10,
    bundleSideBias: Math.round(Math.abs(meanOffset) / spread * 100) / 100,
    outerOrdinaryClearanceGraph: Number.isFinite(outerClearance) ? Math.round(outerClearance * 10) / 10 : null,
    outerOrdinaryClearanceScreen: Number.isFinite(outerClearance) ? Math.round(outerClearance * fitScale * 10) / 10 : null,
    relationLabelClearanceGraph: Number.isFinite(labelClearance) ? Math.round(labelClearance * 10) / 10 : null,
    relationLabelClearanceScreen: Number.isFinite(labelClearance) ? Math.round(labelClearance * fitScale * 10) / 10 : null,
    labelAssociation: labelAssociation.map((value) => ({ ...value, ownRouteDistance: Math.round(value.ownRouteDistance * 10) / 10, nearestOtherRouteDistance: Math.round(value.nearestOtherRouteDistance * 10) / 10, ownershipMargin: Math.round(value.ownershipMargin * 10) / 10 })),
    routeLengths: selected.map((route) => ({ id: route.id, graph: Math.round(routeLength(route.samples) * 10) / 10, screen: Math.round(routeLength(route.samples) * fitScale * 10) / 10 })),
    obstacleInfluence,
    minimumNodeSeparationScreen: Math.round(nodeSeparation * fitScale * 10) / 10,
  };
}

function presentation(dataset, positions, { spacing = 0, mode = "bundle" } = {}) {
  const graph = buildEntityGraph(dataset);
  const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const result = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
    parallelBundleSpacing: spacing, parallelBundleMode: mode,
  });
  const routes = result.routedEdges;
  const fitScale = fitGraphView(Object.values(positions), 800, 500).scale;
  const crossingCount = routes.length === 0 ? 0 : routes.reduce((count, route, index) => count + routes.slice(index + 1).filter((other) => {
    if ([route.sourceId, route.targetId].some((id) => id === other.sourceId || id === other.targetId)) return false;
    for (let left = 1; left < route.samples.length; left += 1) for (let right = 1; right < other.samples.length; right += 1) {
      const a = route.samples[left - 1]; const b = route.samples[left]; const c = other.samples[right - 1]; const d = other.samples[right];
      const ab = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(ab) < 1e-9) continue;
      const ac = c.x - a.x; const ad = c.y - a.y;
      const t = (ac * (d.y - c.y) - ad * (d.x - c.x)) / ab;
      const u = (ac * (b.y - a.y) - ad * (b.x - a.x)) / ab;
      if (t > 0 && t < 1 && u > 0 && u < 1) return true;
    }
    return false;
  }).length, 0);
  const groups = parallelGroups(edges).map((group) => groupMetrics(group, routes, positions, result.relationLabels, routes, fitScale)).filter(Boolean);
  return {
    graph: { nodes: graph.nodes.length, edges: edges.length },
    fitScale: Math.round(fitScale * 1000) / 1000,
    crossings: crossingCount,
    routeMedianScreen: Math.round(routes.map((route) => routeLength(route.samples)).sort((left, right) => left - right)[Math.floor(routes.length / 2)] * fitScale * 10) / 10,
    groups,
    routeCount: routes.length,
    routeGeometry: Object.fromEntries(routes.map((route) => [route.id, JSON.stringify(route.samples)])),
  };
}

function summarizeCustomPresentation(dataset, positions, edges, routes, relationLabels, policy) {
  const fitScale = fitGraphView(Object.values(positions), 800, 500).scale;
  const crossingCount = routes.reduce((count, route, index) => count + routes.slice(index + 1).filter((other) => {
    if ([route.sourceId, route.targetId].some((id) => id === other.sourceId || id === other.targetId)) return false;
    for (let left = 1; left < route.samples.length; left += 1) for (let right = 1; right < other.samples.length; right += 1) {
      const a = route.samples[left - 1]; const b = route.samples[left]; const c = other.samples[right - 1]; const d = other.samples[right];
      const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(denominator) < 1e-9) continue;
      const ac = c.x - a.x; const acy = c.y - a.y;
      const t = (ac * (d.y - c.y) - acy * (d.x - c.x)) / denominator;
      const u = (ac * (b.y - a.y) - acy * (b.x - a.x)) / denominator;
      if (t > 0 && t < 1 && u > 0 && u < 1) return true;
    }
    return false;
  }).length, 0);
  const groups = parallelGroups(edges).map((group) => ({
    ...groupMetrics(group, routes, positions, relationLabels, routes, fitScale),
    minimumEndpointAngularCapacityDegrees: Math.round(endpointAngularCapacity(group, edges, positions) * 10) / 10,
  }));
  return {
    graph: { nodes: Object.keys(positions).length, edges: edges.length },
    fitScale: Math.round(fitScale * 1000) / 1000,
    crossings: crossingCount,
    routeMedianScreen: Math.round(routes.map((route) => routeLength(route.samples)).sort((left, right) => left - right)[Math.floor(routes.length / 2)] * fitScale * 10) / 10,
    groups,
    routeCount: routes.length,
    routeGeometry: Object.fromEntries(routes.map((route) => [route.id, JSON.stringify(route.samples)])),
    incidentAllocator: policy,
  };
}

function atomicIncidentPortfolio(dataset, positions, { hardFirst = false, collectCandidates = false, independentGroups = false, candidateFilter } = {}) {
  const startedAt = performance.now();
  const graph = buildEntityGraph(dataset);
  const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const baseline = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
  });
  let routesById = new Map(baseline.routedEdges.map((route) => [route.id, route]));
  const decisions = [];
  const candidateInventories = [];
  for (const group of parallelGroups(edges)) {
    const endpointIds = [...new Set(group.flatMap((edge) => [edge.sourceId, edge.targetId]))].sort();
    if (endpointIds.length !== 2) continue;
    const first = positions[endpointIds[0]];
    const second = positions[endpointIds[1]];
    if (!first || !second) continue;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const chordLength = Math.max(1, Math.hypot(dx, dy));
    const unitX = dx / chordLength;
    const unitY = dy / chordLength;
    const maximumLabelWidth = Math.max(...group.map((edge) => relationLabelDisplayWidth(edge.label)));
    const projectedLabel = maximumLabelWidth * Math.abs(unitY) + 22 * Math.abs(unitX);
    const gaps = [...new Set([40, 56, 72, 88, Math.min(176, Math.max(56, Math.round((projectedLabel + 16) / 8) * 8))])];
    const centers = [-96, -64, -32, 0, 32, 64, 96];
    const incidentOrdinary = edges.filter((edge) => edge.parallelCount === 1
      && edge.sourceId !== edge.targetId
      && endpointIds.some((id) => edge.sourceId === id || edge.targetId === id));
    const candidates = [];
    for (const gap of gaps) for (const center of centers) for (const ordinaryPolicy of ["preserve-unaffected", "reroute-all"]) {
      if (candidateFilter && !candidateFilter({ gap, center, ordinaryPolicy })) continue;
      const preferredPhysicalSign = (edge) => (edge.parallelIndex % 2 === 0 ? 1 : -1)
        * (edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1);
      const physicalOffsetById = new Map();
      for (const sign of [-1, 1]) {
        group.filter((edge) => preferredPhysicalSign(edge) === sign)
          .sort((left, right) => Math.floor(left.parallelIndex / 2) - Math.floor(right.parallelIndex / 2) || left.id.localeCompare(right.id))
          .forEach((edge, index) => physicalOffsetById.set(edge.id, sign * (gap / 2 + index * gap)));
      }
      const rawPhysicalOffsets = group.map((edge) => physicalOffsetById.get(edge.id));
      const rawMean = rawPhysicalOffsets.reduce((sum, value) => sum + value, 0) / rawPhysicalOffsets.length;
      const physicalOffsets = rawPhysicalOffsets.map((value) => value - rawMean + center);
      const offsets = group.map((edge, index) => physicalOffsets[index] * (edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1));
      const candidateRoutes = new Map(routesById);
      const halfBundleWidth = Math.max(...physicalOffsets.map((offset) => Math.abs(offset))) + projectedLabel / 2 + 8;
      const requiredHalfSectorDegrees = Math.atan2(halfBundleWidth, chordLength / 2) * 180 / Math.PI;
      const availableHalfSectorDegrees = endpointAngularCapacity(group, edges, positions);
      const affectedOrdinary = incidentOrdinary.filter((edge) =>
        incidentAngleFromBundle(edge, endpointIds, positions) <= requiredHalfSectorDegrees + 4);
      const groupRoutes = group.map((edge, index) => {
        const source = positions[edge.sourceId];
        const target = positions[edge.targetId];
        const geometry = routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, [], [], false, 0, offsets[index]);
        const route = { ...edge, ...geometry };
        candidateRoutes.set(edge.id, route);
        return route;
      });
      const reservedPaths = groupRoutes.map((route) => route.samples);
      const reroutedOrdinary = ordinaryPolicy === "reroute-all" ? incidentOrdinary : affectedOrdinary;
      for (const edge of reroutedOrdinary) {
        const source = positions[edge.sourceId];
        const target = positions[edge.targetId];
        const obstacles = graph.nodes.filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId).map((node) => positions[node.id]);
        const geometry = routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, obstacles, reservedPaths, false, 0, undefined, undefined, provisionalNodeLabels, edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1);
        candidateRoutes.set(edge.id, { ...edge, ...geometry });
      }
      const routes = edges.map((edge) => candidateRoutes.get(edge.id));
      const labels = deriveAutomaticRelationLabels({
        routedEdges: routes,
        nodes: graph.nodes.map((node) => positions[node.id]),
        previousPlacements: new Map(), manualAnchors: new Map(),
      });
      const summary = summarizeCustomPresentation(dataset, positions, edges, routes, labels, null);
      const metrics = summary.groups.find((candidate) => candidate.edgeIds.join("\u0000") === group.map((edge) => edge.id).join("\u0000"));
      const obstacleCount = metrics?.obstacleInfluence.length ?? 0;
      const minimumOwnership = Math.min(...(metrics?.labelAssociation.map(({ ownershipMargin }) => ownershipMargin) ?? [0]));
      const labelClearance = metrics?.relationLabelClearanceScreen ?? 0;
      const outerClearance = metrics?.outerOrdinaryClearanceScreen ?? 1000;
      const laneSeparation = metrics?.laneSeparationScreen ?? 0;
      const sideBias = metrics?.bundleSideBias ?? 10;
      const routeTotal = groupRoutes.reduce((sum, route) => sum + routeLength(route.samples), 0);
      const hardFailures = [
        obstacleCount > 0 ? "obstacle" : null,
        laneSeparation < 16 ? "lane-separation" : null,
        labelClearance < 4 ? "label-clearance" : null,
        minimumOwnership < 0 ? "label-ownership" : null,
        incidentOrdinary.length > 0 && outerClearance < 4 ? "outer-clearance" : null,
        summary.crossings > 0 ? "crossing" : null,
        new Set(offsets.map((offset) => Math.round(offset * 100) / 100)).size !== offsets.length ? "physical-order" : null,
      ].filter(Boolean);
      const hardPenalty = obstacleCount * 1e9 + summary.crossings * 1e7 + (minimumOwnership < 0 ? 1e6 + Math.abs(minimumOwnership) * 1000 : 0);
      const readablePenalty = Math.max(0, 12 - labelClearance) * 10000
        + Math.max(0, 8 - outerClearance) * 20000
        + Math.max(0, 18 - laneSeparation) * 5000;
      const score = hardPenalty + readablePenalty + sideBias * 1000 + routeTotal * .01;
      const id = `${gap}:${center}:${ordinaryPolicy}`;
      candidates.push({
        id, score, gap, center, ordinaryPolicy, offsets, routes, labels, summary,
        minimumOwnership, obstacleCount, hardFailures, requiredHalfSectorDegrees,
        availableHalfSectorDegrees, bundleWidthPx: halfBundleWidth * 2 * summary.fitScale,
        bundleRelationIds: group.map(({ id }) => id),
        conflictingRelationIds: affectedOrdinary.map(({ id }) => id),
        pressure: {
          labelReservationDeficitPx: Math.max(0, 4 - labelClearance),
          outerGuardDeficitPx: incidentOrdinary.length > 0 ? Math.max(0, 4 - outerClearance) : 0,
          obstacleConflictCount: obstacleCount,
          portConflictCount: affectedOrdinary.length,
        },
        detourCost: routeTotal,
        affectedRouteIds: [...new Set([...group.map(({ id }) => id), ...reroutedOrdinary.map(({ id }) => id)])],
        endpointReservations: endpointIds.map((endpointId, endpointIndex) => {
          const baseAngle = endpointIndex === 0 ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
          const signedCenterAngle = Math.atan2(center, chordLength / 2) * (endpointIndex === 0 ? 1 : -1);
          return { endpointId, centerAngleDegrees: (baseAngle + signedCenterAngle) * 180 / Math.PI, halfWidthDegrees: requiredHalfSectorDegrees };
        }),
      });
    }
    candidateInventories.push({ groupId: group.map(({ id }) => id).join("+"), endpointIds, candidates });
    const feasibleCandidates = candidates.filter((candidate) => candidate.hardFailures.length === 0);
    const allocation = decideIncidentAllocation(endpointIds, candidates.map((candidate) => ({
      id: candidate.id,
      hardFailures: candidate.hardFailures,
      requiredHalfSectorDegrees: candidate.requiredHalfSectorDegrees,
      availableHalfSectorDegrees: candidate.availableHalfSectorDegrees,
      bundleWidthPx: candidate.bundleWidthPx,
      bundleRelationIds: candidate.bundleRelationIds,
      conflictingRelationIds: candidate.conflictingRelationIds,
      pressure: candidate.pressure,
      qualityCost: candidate.score,
      detourCost: candidate.detourCost,
    })));
    const selectedId = hardFirst
      ? allocation.decision.status === "feasible"
        ? allocation.decision.selectedCandidateId
        : allocation.diagnosticFallbackCandidateId
      : [...candidates].sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))[0].id;
    const selected = candidates.find(({ id }) => id === selectedId);
    if (!selected) throw new Error("Incident diagnostic candidate selection failed");
    if (!independentGroups) routesById = new Map(selected.routes.map((route) => [route.id, route]));
    decisions.push({
      edgeIds: group.map((edge) => edge.id),
      candidateCount: candidates.length,
      selectedGap: selected.gap,
      selectedCenter: selected.center,
      ordinaryPolicy: selected.ordinaryPolicy,
      selectedOffsets: selected.offsets,
      minimumOwnership: selected.minimumOwnership,
      obstacleCount: selected.obstacleCount,
      hardFeasible: selected.hardFailures.length === 0,
      hardFailures: selected.hardFailures,
      feasibleCandidateCount: feasibleCandidates.length,
      endpointAngularCapacityDegrees: endpointAngularCapacity(group, edges, positions),
      allocationDecision: allocation.decision,
      diagnosticFallbackCandidateId: allocation.diagnosticFallbackCandidateId,
      diagnosticFallbackRendered: hardFirst && allocation.decision.status === "capacity-shortage",
    });
  }
  const routes = edges.map((edge) => routesById.get(edge.id));
  const labels = deriveAutomaticRelationLabels({
    routedEdges: routes,
    nodes: graph.nodes.map((node) => positions[node.id]),
    previousPlacements: new Map(), manualAnchors: new Map(),
  });
  const result = summarizeCustomPresentation(dataset, positions, edges, routes, labels, {
    formulation: hardFirst
      ? "hard-feasibility-first-endpoint-sector-portfolio"
      : "atomic-bundle-reservation-plus-incident-ordinary-reroute",
    hardFirst,
    decisions,
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
  if (collectCandidates) {
    result.candidateInventories = candidateInventories;
    result.baselineRoutes = baseline.routedEdges;
    result.edges = edges;
    result.graphNodes = graph.nodes;
    result.provisionalNodeLabels = provisionalNodeLabels;
  }
  return result;
}

function endpointPlanPortfolio(dataset, positions, maxStates = 512, { compressed = false } = {}) {
  const startedAt = performance.now();
  const oracleSource = atomicIncidentPortfolio(dataset, positions, { hardFirst: true, collectCandidates: true, independentGroups: true });
  const source = compressed
    ? atomicIncidentPortfolio(dataset, positions, {
      hardFirst: true, collectCandidates: true, independentGroups: true,
      candidateFilter: ({ gap, center }) => isCompressedGeometryFamilyMember(gap, center),
    })
    : oracleSource;
  const fullInventories = oracleSource.candidateInventories;
  const inventories = source.candidateInventories;
  const groups = inventories.map((inventory) => ({
    id: inventory.groupId,
    candidates: inventory.candidates.map((candidate) => ({
      id: `${inventory.groupId}|${candidate.id}`,
      groupId: inventory.groupId,
      hardFailures: candidate.hardFailures,
      reservations: candidate.endpointReservations,
      changedOrdinaryRelationIds: candidate.affectedRouteIds.filter((id) => !candidate.bundleRelationIds.includes(id)),
      qualityCost: candidate.score,
    })),
    capacityRequest: (() => {
      const allocation = decideIncidentAllocation(inventory.endpointIds, fullInventories.find(({ groupId }) => groupId === inventory.groupId).candidates.map((candidate) => ({
        id: candidate.id, hardFailures: candidate.hardFailures,
        requiredHalfSectorDegrees: candidate.requiredHalfSectorDegrees,
        availableHalfSectorDegrees: candidate.availableHalfSectorDegrees,
        bundleWidthPx: candidate.bundleWidthPx,
        bundleRelationIds: candidate.bundleRelationIds,
        conflictingRelationIds: candidate.conflictingRelationIds,
        pressure: candidate.pressure, qualityCost: candidate.score, detourCost: candidate.detourCost,
      })));
      if (allocation.decision.status !== "capacity-shortage") return undefined;
      const shortage = allocation.decision.shortage;
      return {
        endpointIds: shortage.endpointIds,
        requiredHalfSectorDegrees: shortage.requiredHalfSectorDegrees,
        availableHalfSectorDegrees: shortage.availableHalfSectorDegrees,
        shortageDegrees: shortage.shortageDegrees,
        bundleWidthPx: shortage.bundleWidthPx,
        bundleRelationIds: shortage.bundleRelationIds,
        conflictingRelationIds: shortage.conflictingRelationIds,
        hardFailures: shortage.hardFailures,
        labelReservationDeficitPx: shortage.pressure.labelReservationDeficitPx,
        outerGuardDeficitPx: shortage.pressure.outerGuardDeficitPx,
        obstacleConflictCount: shortage.pressure.obstacleConflictCount,
        portConflictCount: shortage.pressure.portConflictCount,
      };
    })(),
  }));
  const materialized = new Map();
  const materialize = (selectedIds) => {
    const key = [...selectedIds].sort().join("\u0000");
    if (materialized.has(key)) return materialized.get(key);
    const routesById = new Map(source.baselineRoutes.map((route) => [route.id, route]));
    for (const selectedId of selectedIds) {
      const separator = selectedId.indexOf("|");
      const groupId = selectedId.slice(0, separator);
      const candidateId = selectedId.slice(separator + 1);
      const candidate = fullInventories.find((inventory) => inventory.groupId === groupId)?.candidates.find(({ id }) => id === candidateId);
      if (!candidate) continue;
      for (const route of candidate.routes) if (candidate.affectedRouteIds.includes(route.id)) routesById.set(route.id, route);
    }
    const routes = source.edges.map((edge) => routesById.get(edge.id));
    const labels = deriveAutomaticRelationLabels({ routedEdges: routes, nodes: source.graphNodes.map((node) => positions[node.id]), previousPlacements: new Map(), manualAnchors: new Map() });
    const summary = summarizeCustomPresentation(dataset, positions, source.edges, routes, labels, null);
    const failures = [
      summary.crossings > 0 ? "crossing" : null,
      ...summary.groups.flatMap((group) => [
        (group.obstacleInfluence?.length ?? 0) > 0 ? "obstacle" : null,
        group.laneSeparationScreen !== null && group.laneSeparationScreen < 16 ? "lane-separation" : null,
        group.relationLabelClearanceScreen !== null && group.relationLabelClearanceScreen < 4 ? "label-clearance" : null,
        Math.min(...(group.labelAssociation ?? []).map(({ ownershipMargin }) => ownershipMargin), 0) < 0 ? "label-ownership" : null,
        group.outerOrdinaryClearanceScreen !== null && group.outerOrdinaryClearanceScreen < 4 ? "outer-clearance" : null,
      ]),
    ].filter(Boolean);
    const value = { routes, labels, summary, failures };
    materialized.set(key, value);
    return value;
  };
  const plan = planEndpointAllocations(groups, maxStates, (selected) => materialize(selected.map(({ id }) => id)).failures);
  const selectedIds = plan.decision.status === "feasible" ? plan.decision.selectedCandidateIds : plan.diagnosticFallbackCandidateIds;
  const selected = materialize(selectedIds);
  const result = summarizeCustomPresentation(dataset, positions, source.edges, selected.routes, selected.labels, {
    formulation: "bounded-endpoint-plan-multi-bundle-allocation",
    endpointPlan: plan,
    groupCount: groups.length,
    candidateCount: groups.reduce((sum, group) => sum + group.candidates.length, 0),
    fullCandidateCount: fullInventories.reduce((sum, group) => sum + group.candidates.length, 0),
    candidateGenerationElapsedMs: source.incidentAllocator.elapsedMs,
    oracleGenerationElapsedMs: compressed ? oracleSource.incidentAllocator.elapsedMs : source.incidentAllocator.elapsedMs,
    compressed,
    feasiblePlanRetention: fullInventories.every((inventory) => {
      const fullFeasible = inventory.candidates.filter(({ hardFailures }) => hardFailures.length === 0);
      const compressedIds = new Set(inventories.find(({ groupId }) => groupId === inventory.groupId)?.candidates.map(({ id }) => id));
      return fullFeasible.length === 0 || fullFeasible.some(({ id }) => compressedIds.has(id));
    }),
    feasibleGroupRetention: fullInventories.map((inventory) => ({
      groupId: inventory.groupId,
      fullFeasible: inventory.candidates.filter(({ hardFailures }) => hardFailures.length === 0).length,
      retainedFeasible: inventories.find(({ groupId }) => groupId === inventory.groupId)?.candidates.filter(({ hardFailures }) => hardFailures.length === 0).length ?? 0,
    })),
    maxStates,
    atomicCommit: plan.decision.status === "feasible",
    authoritativeCombinationEvaluations: materialized.size,
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
  return result;
}

function g3Positions(fixturePath) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "tools/generic-crossing-search.mjs", fixturePath], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 100 * 1024 * 1024,
    env: {
      ...process.env,
      E2R_GLOBAL_PLACEMENT_ABLATION: "",
      E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
      E2R_GLOBAL_SPACING_SCALE: "0.88",
      E2R_GLOBAL_SPACING_Y: "1.12",
      E2R_GLOBAL_SPACING_STAGE2: "off",
      E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once",
      E2R_PRESENTATION_FINALIST_LIMIT: "2",
      E2R_RELAXATION_STEP_MODE: "omit-fine",
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || `G3 search failed with ${result.status}`);
  const parsed = JSON.parse(result.stdout);
  if (!parsed.selected?.positions) throw new Error("G3 positions missing");
  return parsed.selected.positions;
}

function runCell(name, locale, dataset, positions, source) {
  const arms = [
    ["fixed-routing-baseline", positions, 0, "bundle"],
    ["routing-pair-16", positions, 16, "pair"],
    ["routing-bundle-16", positions, 16, "bundle"],
    ["routing-corridor-aware", positions, 16, "corridor"],
    ["placement-mirror-x", transformPositions(positions, "mirror-x"), 0, "bundle"],
    ["placement-mirror-y", transformPositions(positions, "mirror-y"), 0, "bundle"],
    ["placement-rotate-90", transformPositions(positions, "rotate-90"), 0, "bundle"],
  ];
  const graph = buildEntityGraph(dataset);
  const parallelIds = new Set(graph.edges.filter((edge) => edge.parallelCount > 1).map((edge) => edge.id));
  const evaluated = arms.map(([arm, armPositions, spacing, mode]) => ({ arm, ...presentation(dataset, armPositions, { spacing, mode }) }));
  const jointIncident = atomicIncidentPortfolio(dataset, positions);
  const jointIncidentRepeat = atomicIncidentPortfolio(dataset, positions);
  jointIncident.incidentAllocator.deterministic = JSON.stringify(jointIncident.routeGeometry) === JSON.stringify(jointIncidentRepeat.routeGeometry);
  evaluated.push({ arm: "joint-incident-portfolio", ...jointIncident });
  const hardFirst = atomicIncidentPortfolio(dataset, positions, { hardFirst: true });
  const hardFirstRepeat = atomicIncidentPortfolio(dataset, positions, { hardFirst: true });
  hardFirst.incidentAllocator.deterministic = JSON.stringify(hardFirst.routeGeometry) === JSON.stringify(hardFirstRepeat.routeGeometry);
  evaluated.push({ arm: "hard-feasibility-first", ...hardFirst });
  const endpointPlan = endpointPlanPortfolio(dataset, positions);
  const endpointPlanRepeat = endpointPlanPortfolio(dataset, positions);
  endpointPlan.incidentAllocator.deterministic = JSON.stringify(endpointPlan.routeGeometry) === JSON.stringify(endpointPlanRepeat.routeGeometry)
    && JSON.stringify(endpointPlan.incidentAllocator.endpointPlan) === JSON.stringify(endpointPlanRepeat.incidentAllocator.endpointPlan);
  evaluated.push({ arm: "endpoint-plan", ...endpointPlan });
  const compressedPlan = endpointPlanPortfolio(dataset, positions, 512, { compressed: true });
  const compressedRepeat = endpointPlanPortfolio(dataset, positions, 512, { compressed: true });
  compressedPlan.incidentAllocator.deterministic = JSON.stringify(compressedPlan.routeGeometry) === JSON.stringify(compressedRepeat.routeGeometry)
    && JSON.stringify(compressedPlan.incidentAllocator.endpointPlan) === JSON.stringify(compressedRepeat.incidentAllocator.endpointPlan);
  compressedPlan.incidentAllocator.selectedPlanMatchesFull = JSON.stringify(compressedPlan.incidentAllocator.endpointPlan?.decision?.selectedCandidateIds ?? [])
    === JSON.stringify(endpointPlan.incidentAllocator.endpointPlan?.decision?.selectedCandidateIds ?? []);
  evaluated.push({ arm: "endpoint-plan-compressed", ...compressedPlan });
  const capacityRequests = hardFirst.incidentAllocator.decisions
    .filter(({ allocationDecision }) => allocationDecision.status === "capacity-shortage")
    .map(({ allocationDecision }) => allocationDecision.shortage.requiredHalfSectorDegrees);
  if (capacityRequests.length > 0) {
    const requestedHalfSector = Math.max(...capacityRequests);
    const negotiatedPositions = relieveIncidentAngularCapacity(graph.edges, positions, requestedHalfSector);
    const negotiated = endpointPlanPortfolio(dataset, negotiatedPositions);
    const negotiatedRepeat = endpointPlanPortfolio(dataset, negotiatedPositions);
    negotiated.incidentAllocator.deterministic = JSON.stringify(negotiated.routeGeometry) === JSON.stringify(negotiatedRepeat.routeGeometry);
    negotiated.incidentAllocator.requestedHalfSectorDegrees = requestedHalfSector;
    negotiated.incidentAllocator.minimumNodeSeparationBefore = presentation(dataset, positions).groups[0]?.minimumNodeSeparationScreen ?? null;
    negotiated.incidentAllocator.minimumNodeSeparationAfter = presentation(dataset, negotiatedPositions).groups[0]?.minimumNodeSeparationScreen ?? null;
    evaluated.push({ arm: "capacity-request-placement-counterfactual", ...negotiated });
  }
  const angularRelievedPositions = relieveIncidentAngularCapacity(graph.edges, positions);
  const angularJoint = atomicIncidentPortfolio(dataset, angularRelievedPositions);
  const angularJointRepeat = atomicIncidentPortfolio(dataset, angularRelievedPositions);
  angularJoint.incidentAllocator.deterministic = JSON.stringify(angularJoint.routeGeometry) === JSON.stringify(angularJointRepeat.routeGeometry);
  evaluated.push({ arm: "angular-relief-plus-joint-incident", ...angularJoint });
  const baseline = evaluated[0].routeGeometry;
  const compareRoutes = (current) => Object.keys({ ...baseline, ...current }).filter((id) => baseline[id] !== current[id]);
  return {
    name, locale, source, graph: graph.nodes.length,
    arms: evaluated.map(({ routeGeometry, ...arm }) => {
      const changedRouteIds = compareRoutes(routeGeometry);
      return {
        ...arm,
        routeChangesFromFixedRoutingBaseline: arm.arm === "fixed-routing-baseline" ? 0 : changedRouteIds.length,
        ordinaryRouteChangesFromFixedRoutingBaseline: arm.arm === "fixed-routing-baseline" ? 0 : changedRouteIds.filter((id) => !parallelIds.has(id)).length,
      };
    }),
  };
}

const results = [];
for (const [name, locale, fixturePath] of canonicalCells) {
  const dataset = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  results.push(runCell(name, locale, dataset, g3Positions(fixturePath), "canonical-g3-counterfactual"));
}
for (const reverse of [false, true]) {
  const dataset = syntheticBundle(reverse);
  const { positions, ...payload } = dataset;
  results.push(runCell(reverse ? "synthetic-reverse-bundle" : "synthetic-long-short-obstacle", "n/a", payload, positions, "bounded-synthetic-counterfactual"));
}
for (const labelMode of ["short-short", "long-short", "long-long"]) {
  const dataset = syntheticTwoParallel(labelMode);
  const { positions, ...payload } = dataset;
  results.push(runCell(`synthetic-two-${labelMode}`, "n/a", payload, positions, "bounded-synthetic-counterfactual"));
}
for (const [name, dataset] of [
  ["synthetic-multiple-ordinary", syntheticMultipleOrdinary()],
  ["synthetic-asymmetric-incident", syntheticMultipleOrdinary({ asymmetric: true })],
  ["synthetic-shared-parallel-bundles", syntheticSharedBundles()],
  ["synthetic-conflicting-parallel-bundles", syntheticSharedBundles(28)],
]) {
  const { positions, ...payload } = dataset;
  results.push(runCell(name, "n/a", payload, positions, "bounded-synthetic-counterfactual"));
}

for (const mode of ["mirror-x", "rotate-90"]) {
  const dataset = syntheticMultipleOrdinary({ asymmetric: true });
  const { positions, ...payload } = dataset;
  results.push(runCell(`synthetic-asymmetric-${mode}`, "n/a", payload, transformPositions(positions, mode), "bounded-transform-counterfactual"));
}

const report = {
  contract: "PARALLEL-INCIDENT-GEOMETRY-FORMULATION-EXPLORATION-v1",
  diagnosticOnly: true,
  method: {
    routingCounterfactual: "same positions, baseline vs pair-16 vs bundle-16 slot policy",
    placementCounterfactual: "same baseline routing semantics, centroid mirror/rotation of coordinates",
    metrics: "authoritative Product routes/Relation-labels plus fitScale; no presentation authority moved into Initial Layout",
    warning: "counterfactual transforms are attribution probes, not production rules",
  },
  results,
};

if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "6") {
  console.log(JSON.stringify(report.results.map((cell) => {
    const full = cell.arms.find(({ arm }) => arm === "endpoint-plan");
    const compressed = cell.arms.find(({ arm }) => arm === "endpoint-plan-compressed");
    return {
      cell: `${cell.name}/${cell.locale}`,
      full: full ? { candidates: full.incidentAllocator.candidateCount, plan: full.incidentAllocator.endpointPlan.decision.status, selected: full.incidentAllocator.endpointPlan.decision.selectedCandidateIds ?? [], feasiblePlanRetention: full.incidentAllocator.feasiblePlanRetention } : null,
      compressed: compressed ? { candidates: compressed.incidentAllocator.candidateCount, plan: compressed.incidentAllocator.endpointPlan.decision.status, selected: compressed.incidentAllocator.endpointPlan.decision.selectedCandidateIds ?? [], selectedPlanMatchesFull: compressed.incidentAllocator.selectedPlanMatchesFull, feasiblePlanRetention: compressed.incidentAllocator.feasiblePlanRetention, elapsedMs: compressed.incidentAllocator.elapsedMs, candidateGenerationMs: compressed.incidentAllocator.candidateGenerationElapsedMs, oracleGenerationMs: compressed.incidentAllocator.oracleGenerationElapsedMs, comboEvals: compressed.incidentAllocator.authoritativeCombinationEvaluations, group: compressed.groups[0] ? { lane: compressed.groups[0].laneSeparationScreen, label: compressed.groups[0].relationLabelClearanceScreen, ownership: Math.min(...compressed.groups[0].labelAssociation.map(({ ownershipMargin }) => ownershipMargin)), outer: compressed.groups[0].outerOrdinaryClearanceScreen, bias: compressed.groups[0].bundleSideBias } : null } : null,
    };
  }), null, 2));
} else if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "5") {
  console.log(JSON.stringify(report.results.map((cell) => {
    const arm = cell.arms.find(({ arm }) => arm === "capacity-request-placement-counterfactual");
    return arm ? {
      cell: `${cell.name}/${cell.locale}`,
      plan: arm.incidentAllocator.endpointPlan.decision,
      requestedHalfSectorDegrees: arm.incidentAllocator.requestedHalfSectorDegrees,
      minimumNodeSeparationBefore: arm.incidentAllocator.minimumNodeSeparationBefore,
      minimumNodeSeparationAfter: arm.incidentAllocator.minimumNodeSeparationAfter,
      crossings: arm.crossings,
      ordinaryRouteChanges: arm.ordinaryRouteChangesFromFixedRoutingBaseline,
      elapsedMs: arm.incidentAllocator.elapsedMs,
    } : null;
  }).filter(Boolean), null, 2));
} else if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "4") {
  console.log(JSON.stringify(report.results.map((cell) => {
    const arm = cell.arms.find(({ arm }) => arm === "endpoint-plan");
    const plan = arm?.incidentAllocator?.endpointPlan;
    return {
      cell: `${cell.name}/${cell.locale}`,
      elapsedMs: arm?.incidentAllocator?.elapsedMs,
      ordinaryRouteChanges: arm?.ordinaryRouteChangesFromFixedRoutingBaseline,
      groupCount: arm?.incidentAllocator?.groupCount ?? 0,
      candidateCount: arm?.incidentAllocator?.candidateCount ?? 0,
      plan: plan?.decision ?? null,
      diagnosticFallbackCandidateIds: plan?.diagnosticFallbackCandidateIds ?? [],
    };
  }), null, 2));
} else if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "3") {
  console.log(report.results.map((cell) => {
    const arm = cell.arms.find(({ arm }) => arm === "endpoint-plan");
    const group = arm?.groups[0];
    const plan = arm?.incidentAllocator?.endpointPlan;
    return `${cell.name}/${cell.locale}: plan=${plan?.decision?.status ?? "no-groups"} groups=${arm?.incidentAllocator?.groupCount ?? 0} candidates=${arm?.incidentAllocator?.candidateCount ?? 0} states=${plan?.decision?.exploredStates ?? plan?.decision?.shortage?.exploredStates ?? 0}/${arm?.incidentAllocator?.maxStates ?? 0} reason=${plan?.decision?.status === "capacity-shortage" ? plan.decision.shortage.reason : "none"} lane=${group?.laneSeparationScreen ?? "n/a"} label=${group?.relationLabelClearanceScreen ?? "n/a"} ownership=${group ? Math.min(...group.labelAssociation.map(({ ownershipMargin }) => ownershipMargin)) : "n/a"} outer=${group?.outerOrdinaryClearanceScreen ?? "n/a"} bias=${group?.bundleSideBias ?? "n/a"} ordinaryChanges=${arm?.ordinaryRouteChangesFromFixedRoutingBaseline ?? "n/a"} ms=${arm?.incidentAllocator?.elapsedMs ?? "n/a"} deterministic=${arm?.incidentAllocator?.deterministic ?? false}`;
  }).join("\n"));
} else if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "2") {
  console.log(JSON.stringify(report.results.map((cell) => ({
    cell: `${cell.name}/${cell.locale}`,
    arms: cell.arms.filter(({ arm }) => ["fixed-routing-baseline", "routing-pair-16", "routing-bundle-16", "routing-corridor-aware", "joint-incident-portfolio", "hard-feasibility-first", "angular-relief-plus-joint-incident"].includes(arm)).map(({ arm, crossings, routeMedianScreen, groups, incidentAllocator, ordinaryRouteChangesFromFixedRoutingBaseline }) => ({
      arm,
      crossings,
      median: routeMedianScreen,
      lane: groups[0]?.laneSeparationScreen ?? null,
      label: groups[0]?.relationLabelClearanceScreen ?? null,
      ownership: groups[0] ? Math.min(...groups[0].labelAssociation.map(({ ownershipMargin }) => ownershipMargin)) : null,
      outer: groups[0]?.outerOrdinaryClearanceScreen ?? null,
      bias: groups[0]?.bundleSideBias ?? null,
      obstacles: groups[0]?.obstacleInfluence.length ?? null,
      angle: groups[0]?.minimumEndpointAngularCapacityDegrees ?? null,
      nodeSeparation: groups[0]?.minimumNodeSeparationScreen ?? null,
      ordinaryChanges: ordinaryRouteChangesFromFixedRoutingBaseline,
      evaluations: incidentAllocator?.decisions.reduce((sum, decision) => sum + decision.candidateCount, 0),
      elapsedMs: incidentAllocator?.elapsedMs,
      deterministic: incidentAllocator?.deterministic,
      hardFirst: incidentAllocator?.hardFirst,
      hardFeasible: groups[0]?.hardFeasible,
      hardFailures: groups[0]?.hardFailures,
      feasibleCandidates: groups[0]?.feasibleCandidateCount,
    })),
  })), null, 2));
} else if (process.env.E2R_PARALLEL_AUDIT_SUMMARY === "1") {
  console.log(JSON.stringify(report.results.map((cell) => ({
    name: cell.name,
    locale: cell.locale,
    arms: cell.arms.filter(({ arm }) => ["fixed-routing-baseline", "routing-pair-16", "routing-bundle-16", "routing-corridor-aware", "joint-incident-portfolio", "hard-feasibility-first", "angular-relief-plus-joint-incident"].includes(arm)).map(({ arm, crossings, routeMedianScreen, groups, incidentAllocator, routeChangesFromFixedRoutingBaseline, ordinaryRouteChangesFromFixedRoutingBaseline }) => ({
      arm,
      crossings,
      routeMedianScreen,
      group: groups[0] ? {
        lane: groups[0].laneSeparationScreen,
        label: groups[0].relationLabelClearanceScreen,
        ownership: Math.min(...groups[0].labelAssociation.map(({ ownershipMargin }) => ownershipMargin)),
        outer: groups[0].outerOrdinaryClearanceScreen,
        bias: groups[0].bundleSideBias,
        obstacles: groups[0].obstacleInfluence.length,
        angle: groups[0].minimumEndpointAngularCapacityDegrees,
        nodeSeparation: groups[0].minimumNodeSeparationScreen,
      } : null,
      incidentAllocator,
      routeChangesFromFixedRoutingBaseline,
      ordinaryRouteChangesFromFixedRoutingBaseline,
    })),
  })), null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
