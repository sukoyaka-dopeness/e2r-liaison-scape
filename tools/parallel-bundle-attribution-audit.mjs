import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveNodeInfluence } from "../src/viewport.ts";

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

console.log(JSON.stringify({
  contract: "PARALLEL-INCIDENT-BUNDLE-GEOMETRY-ATTRIBUTION-v1",
  diagnosticOnly: true,
  method: {
    routingCounterfactual: "same positions, baseline vs pair-16 vs bundle-16 slot policy",
    placementCounterfactual: "same baseline routing semantics, centroid mirror/rotation of coordinates",
    metrics: "authoritative Product routes/Relation-labels plus fitScale; no presentation authority moved into Initial Layout",
    warning: "counterfactual transforms are attribution probes, not production rules",
  },
  results,
}, null, 2));
