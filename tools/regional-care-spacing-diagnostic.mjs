import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = process.argv[2];
const positionsPath = process.argv[3];
if (!fixturePath || !positionsPath) throw new Error("Usage: node regional-care-spacing-diagnostic.mjs <fixture.json> <generic-search-output.json>");

function readJson(path) {
  const bytes = fs.readFileSync(path);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe
    ? bytes.subarray(2).toString("utf16le")
    : bytes.toString("utf8").replace(/^\ufeff/, "");
  return JSON.parse(text);
}

const dataset = readJson(fixturePath);
const search = readJson(positionsPath);
const basePositions = search.selected.positions;
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));

const specs = {
  r03: {
    sourceId: "regional-care-network",
    targetId: "east-clinic",
    owners: ["public-health-office"],
    affected: ["regional-care-network", "east-clinic", "public-health-office"],
    cluster: ["regional-care-network", "east-clinic", "public-health-office", "east-community-center", "elder-care-center", "municipal-council"],
  },
  r18: {
    sourceId: "west-clinic",
    targetId: "west-community-center",
    owners: ["pharmacy-coalition", "volunteer-coalition"],
    affected: ["west-clinic", "west-community-center", "pharmacy-coalition", "volunteer-coalition"],
    cluster: ["west-clinic", "west-community-center", "pharmacy-coalition", "volunteer-coalition", "city-hospital", "blood-bank"],
  },
};

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
}

function routeLength(samples) {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(
    point.x - samples[index].x,
    point.y - samples[index].y,
  ), 0);
}

function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return false;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function crossingCount(routes) {
  let count = 0;
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    if ([routes[left].sourceId, routes[left].targetId].some((id) => id === routes[right].sourceId || id === routes[right].targetId)) continue;
    if (routes[left].samples.some((point, index) => routes[right].samples.some((other, otherIndex) => index > 0 && otherIndex > 0
      && segmentIntersection(routes[left].samples[index - 1], point, routes[right].samples[otherIndex - 1], other)))) count += 1;
  }
  return count;
}

function provisionalLabels(positions) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id],
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]),
    [],
  ));
}

function renderAt(positions) {
  const passes = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels: provisionalLabels(positions),
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors: new Map(),
    feedbackEnabled: true,
    presentationPassSink: ({ route, relationLabel, nodeLabel }) => passes.push({ pass: route.pass, routes: route.routes, relationLabels: relationLabel.labels, nodeLabels: nodeLabel.labels }),
  });
  return { presentation, passes };
}

function measure(rendered, positions) {
  const labels = [...rendered.presentation.nodeLabels.values()];
  const hitRelationIds = rendered.presentation.routedEdges
    .filter((route) => routeSamplesHaveLabelCollision(route.samples, labels))
    .map((route) => route.id);
  const nearRelationIds = rendered.presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((rect) => {
    const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
    const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
    return Math.hypot(dx, dy) < 20;
  }))).map((route) => route.id);
  const lengths = rendered.presentation.routedEdges.map(({ samples }) => routeLength(samples)).sort((left, right) => left - right);
  const x = Object.values(positions).map((point) => point.x);
  const y = Object.values(positions).map((point) => point.y);
  return {
    hitRelationIds,
    nearRelationIds,
    crossings: crossingCount(rendered.presentation.routedEdges),
    routeMedian: lengths[Math.floor(lengths.length / 2)],
    routeMax: Math.max(...lengths),
    extent: [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)],
    fit: fitGraphView(Object.values(positions), 800, 500).scale,
    feedbackApplied: rendered.presentation.feedbackApplied,
  };
}

function lineFrame(route) {
  const start = route.samples[0];
  const end = route.samples[route.samples.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    start,
    end,
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    tangent: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
  };
}

function signedLineDistance(point, frame) {
  return (point.x - frame.start.x) * frame.normal.x + (point.y - frame.start.y) * frame.normal.y;
}

function expandPositions(spec, frame, strategy, step, sign) {
  const next = clonePositions(basePositions);
  const move = (id, dx, dy) => {
    next[id] = { x: next[id].x + dx, y: next[id].y + dy };
  };
  if (strategy === "owner-normal") {
    for (const id of spec.owners) {
      const side = Math.sign(signedLineDistance(next[id], frame)) || sign;
      move(id, frame.normal.x * side * step, frame.normal.y * side * step);
    }
  } else if (strategy === "endpoint-normal") {
    move(spec.sourceId, frame.normal.x * sign * step, frame.normal.y * sign * step);
    move(spec.targetId, -frame.normal.x * sign * step, -frame.normal.y * sign * step);
  } else if (strategy === "endpoint-tangent") {
    move(spec.sourceId, -frame.tangent.x * step, -frame.tangent.y * step);
    move(spec.targetId, frame.tangent.x * step, frame.tangent.y * step);
  } else if (strategy === "corridor-balanced") {
    move(spec.sourceId, frame.normal.x * sign * step * 0.5, frame.normal.y * sign * step * 0.5);
    move(spec.targetId, -frame.normal.x * sign * step * 0.5, -frame.normal.y * sign * step * 0.5);
    for (const id of spec.owners) {
      const side = Math.sign(signedLineDistance(next[id], frame)) || sign;
      move(id, frame.normal.x * side * step, frame.normal.y * side * step);
    }
  } else if (strategy === "cluster-radial") {
    const points = spec.cluster.map((id) => next[id]);
    const centroid = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    for (const id of spec.cluster) {
      const dx = next[id].x - centroid.x;
      const dy = next[id].y - centroid.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      move(id, dx / length * step, dy / length * step);
    }
  }
  return next;
}

function nodeSpacingValid(positions) {
  const nodes = graph.nodes.map((node) => positions[node.id]);
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    if (Math.abs(nodes[left].x - nodes[right].x) < 76 && Math.abs(nodes[left].y - nodes[right].y) < 76) return false;
  }
  return true;
}

function candidateRecord(targetId, strategy, step, sign, positions, rendered, baselineMetrics, baselineRendered) {
  const metrics = measure(rendered, positions);
  const baseHitSet = new Set(baselineMetrics.hitRelationIds);
  const localHitFree = !metrics.hitRelationIds.includes(targetId);
  const noDefectRelocation = metrics.hitRelationIds.every((id) => baseHitSet.has(id));
  const globallyAcceptable = localHitFree
    && noDefectRelocation
    && metrics.hitRelationIds.length < baselineMetrics.hitRelationIds.length
    && metrics.nearRelationIds.length <= baselineMetrics.nearRelationIds.length
    && metrics.crossings <= baselineMetrics.crossings
    && metrics.routeMedian <= baselineMetrics.routeMedian * 1.05
    && metrics.routeMax <= baselineMetrics.routeMax * 1.05;
  const movedNodes = graph.nodes.filter((node) => Math.hypot(
    positions[node.id].x - basePositions[node.id].x,
    positions[node.id].y - basePositions[node.id].y,
  ) > 0.5).map((node) => node.id);
  const changedRemoteRoutes = rendered.presentation.routedEdges
    .filter((route) => route.id !== targetId)
    .filter((route) => route.path !== baselineRendered.presentation.routedEdges.find((baseRoute) => baseRoute.id === route.id)?.path)
    .map((route) => route.id);
  const changedNodeLabels = [...rendered.presentation.nodeLabels.entries()]
    .filter(([id, label]) => {
      const baseline = baselineRendered.presentation.nodeLabels.get(id);
      return !baseline || Math.hypot(label.x - baseline.x, label.y - baseline.y) > 0.5;
    })
    .map(([id]) => id);
  return {
    targetId,
    strategy,
    step,
    sign,
    movedNodes,
    maxNodeDisplacement: Math.max(...movedNodes.map((id) => Math.hypot(
      positions[id].x - basePositions[id].x,
      positions[id].y - basePositions[id].y,
    )), 0),
    localHitFree,
    noDefectRelocation,
    globallyAcceptable,
    hitRelationIds: metrics.hitRelationIds,
    nearRelationIds: metrics.nearRelationIds,
    crossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    extent: metrics.extent,
    fit: metrics.fit,
    feedbackApplied: metrics.feedbackApplied,
    changedRemoteRoutes,
    changedNodeLabels,
    incidentalR16Hit: metrics.hitRelationIds.includes("r16"),
  };
}

const baselineRendered = renderAt(basePositions);
const baselineMetrics = measure(baselineRendered, basePositions);
const targetResults = Object.entries(specs).map(([targetId, spec]) => {
  const route = baselineRendered.presentation.routedEdges.find((candidate) => candidate.id === targetId);
  const frame = lineFrame(route);
  const candidates = [];
  const strategies = ["owner-normal", "endpoint-normal", "endpoint-tangent", "corridor-balanced", "cluster-radial"];
  const steps = [24, 48, 72, 96, 120, 144, 192];
  for (const strategy of strategies) for (const step of steps) for (const sign of strategy === "endpoint-tangent" ? [1] : [-1, 1]) {
    const positions = expandPositions(spec, frame, strategy, step, sign);
    if (!nodeSpacingValid(positions)) continue;
    const rendered = renderAt(positions);
    candidates.push(candidateRecord(targetId, strategy, step, sign, positions, rendered, baselineMetrics, baselineRendered));
  }
  const localHitFree = candidates.filter((candidate) => candidate.localHitFree);
  const globallyAcceptable = candidates.filter((candidate) => candidate.globallyAcceptable);
  const sortBySmallest = (left, right) => left.maxNodeDisplacement - right.maxNodeDisplacement
    || left.crossings - right.crossings
    || left.nearRelationIds.length - right.nearRelationIds.length
    || left.routeMax - right.routeMax;
  return {
    targetId,
    affectedNodes: spec.affected,
    clusterNodes: spec.cluster,
    evaluated: candidates.length,
    localHitFreeCount: localHitFree.length,
    globallyAcceptableCount: globallyAcceptable.length,
    firstLocalHitFree: localHitFree.slice().sort(sortBySmallest)[0] ?? null,
    firstGloballyAcceptable: globallyAcceptable.slice().sort(sortBySmallest)[0] ?? null,
    bestByVector: candidates.slice().sort((left, right) => left.hitRelationIds.length - right.hitRelationIds.length
      || left.crossings - right.crossings
      || left.nearRelationIds.length - right.nearRelationIds.length
      || left.routeMax - right.routeMax).slice(0, 5),
  };
});

function globallyExpandedPositions(factor) {
  const points = Object.values(basePositions);
  const centroid = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  return Object.fromEntries(Object.entries(basePositions).map(([id, point]) => [id, {
    x: centroid.x + (point.x - centroid.x) * factor,
    y: centroid.y + (point.y - centroid.y) * factor,
  }]));
}

function globalExpansionRecord(factor, positions, rendered) {
  const metrics = measure(rendered, positions);
  const changedRemoteRoutes = rendered.presentation.routedEdges
    .filter((route) => route.path !== baselineRendered.presentation.routedEdges.find((baseRoute) => baseRoute.id === route.id)?.path)
    .map((route) => route.id);
  const changedNodeLabels = [...rendered.presentation.nodeLabels.entries()]
    .filter(([id, label]) => {
      const baseline = baselineRendered.presentation.nodeLabels.get(id);
      return !baseline || Math.hypot(label.x - baseline.x, label.y - baseline.y) > 0.5;
    })
    .map(([id]) => id);
  return {
    factor,
    movedNodes: graph.nodes.map((node) => node.id),
    maxNodeDisplacement: Math.max(...graph.nodes.map((node) => Math.hypot(
      positions[node.id].x - basePositions[node.id].x,
      positions[node.id].y - basePositions[node.id].y,
    ))),
    r03LocalHitFree: !metrics.hitRelationIds.includes("r03"),
    r18LocalHitFree: !metrics.hitRelationIds.includes("r18"),
    incidentalR16Hit: metrics.hitRelationIds.includes("r16"),
    hitRelationIds: metrics.hitRelationIds,
    nearRelationIds: metrics.nearRelationIds,
    crossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    extent: metrics.extent,
    fit: metrics.fit,
    feedbackApplied: metrics.feedbackApplied,
    changedRemoteRoutes,
    changedNodeLabels,
  };
}

const globalExpansion = [1.05, 1.10, 1.15, 1.20, 1.30, 1.50, 2.00].map((factor) => {
  const positions = globallyExpandedPositions(factor);
  if (!nodeSpacingValid(positions)) return { factor, rejected: "initial-node-clearance" };
  return globalExpansionRecord(factor, positions, renderAt(positions));
});
const firstGlobalR03HitFree = globalExpansion.find((candidate) => candidate.r03LocalHitFree);
const firstGlobalR18HitFree = globalExpansion.find((candidate) => candidate.r18LocalHitFree);
const firstGlobalBothHitFree = globalExpansion.find((candidate) => candidate.r03LocalHitFree && candidate.r18LocalHitFree);

console.log(JSON.stringify({
  contract: "LIAISONSCAPE-REGIONAL-CARE-LOCAL-SPACING-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  geometryMode: "bounded local Node expansion; Product spacing rule unchanged",
  fixturePath,
  positionsPath,
  baseline: baselineMetrics,
  targetResults,
  globalExpansion: {
    candidates: globalExpansion,
    firstR03HitFree: firstGlobalR03HitFree ?? null,
    firstR18HitFree: firstGlobalR18HitFree ?? null,
    firstBothHitFree: firstGlobalBothHitFree ?? null,
  },
  causalDecision: targetResults.every((result) => result.globallyAcceptableCount === 0)
    ? "D_OR_E_PENDING_POSITIVE_FIXTURE_AND_GLOBAL_EXPANSION_COMPARISON"
    : "LOCAL_OR_MODERATE_EXPANSION_CANDIDATE_FOUND",
  positiveFixtureComparison: "not rerun; prior four-fixture hard-clean regression baseline remains unchanged because Product source was not modified",
  governedEvidenceChanged: false,
}, null, 2));
