import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { minimumPathToLabelRectDistance, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = process.argv[2];
const positionsPath = process.argv[3];
if (!fixturePath || !positionsPath) throw new Error("Usage: node regional-care-hit-diagnostic.mjs <fixture.json> <generic-search-output.json>");

function readJson(path) {
  const bytes = fs.readFileSync(path);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe
    ? bytes.subarray(2).toString("utf16le")
    : bytes.toString("utf8").replace(/^\ufeff/, "");
  return JSON.parse(text);
}

const dataset = readJson(fixturePath);
const search = readJson(positionsPath);
const positions = search.selected.positions;
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function routeLength(samples) {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(
    point.x - samples[index].x,
    point.y - samples[index].y,
  ), 0);
}

function innerSamples(route) {
  return route.samples.length > 8 ? route.samples.slice(4, -4) : route.samples;
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
    const hit = routes[left].samples.some((a, index) => routes[right].samples.some((c, otherIndex) => index > 0 && otherIndex > 0
      && segmentIntersection(routes[left].samples[index - 1], a, routes[right].samples[otherIndex - 1], c)));
    if (hit) count += 1;
  }
  return count;
}

function render(edgeCurveOffsets = {}, feedbackEnabled = true) {
  const provisionalNodeLabels = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id],
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]),
    [],
  ));
  const passes = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets,
    selfLoopOverrides: {},
    provisionalNodeLabels,
    ...emptyState,
    feedbackEnabled,
    presentationPassSink: (pass, routes, relationLabels, nodeLabels) => passes.push({
      pass,
      routes,
      relationLabels,
      nodeLabels,
    }),
  });
  return { presentation, passes };
}

function measure(presentation) {
  const labels = graph.nodes.map((node) => ({ id: node.id, rect: presentation.nodeLabels.get(node.id) })).filter(({ rect }) => rect);
  const hitDetails = [];
  const routeSummaries = presentation.routedEdges.map((route) => {
    const inner = innerSamples(route);
    const conflicts = labels.flatMap(({ id, rect }) => {
      const fullHit = routeSamplesHaveLabelCollision(route.samples, [rect]);
      if (!fullHit) return [];
      const innerHit = routeSamplesHaveLabelCollision(inner, [rect]);
      const minimumClearance = minimumPathToLabelRectDistance(inner, rect);
      return [{
        labelId: id,
        endpointLabel: id === route.sourceId || id === route.targetId,
        fullHit,
        innerHit,
        endpointOnly: !innerHit,
        minimumClearance,
      }];
    });
    if (conflicts.length > 0) hitDetails.push({
      relationId: route.id,
      sourceId: route.sourceId,
      targetId: route.targetId,
      conflicts,
      endpointOnly: conflicts.every((conflict) => conflict.endpointOnly),
    });
    return {
      relationId: route.id,
      routeLength: routeLength(route.samples),
      hit: conflicts.length > 0,
      near: route.samples.some((point) => labels.some(({ rect }) => {
        const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
        const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
        return Math.hypot(dx, dy) < 20;
      })),
    };
  });
  const routePaths = Object.fromEntries(presentation.routedEdges.map((route) => [route.id, route.path]));
  const relationLabelPaths = Object.fromEntries([...presentation.relationLabels.entries()].map(([id, label]) => [id, JSON.stringify(label)]));
  const lengths = routeSummaries.map((route) => route.routeLength).sort((left, right) => left - right);
  return {
    hitDetails,
    hitRelationIds: hitDetails.map((detail) => detail.relationId),
    nearRelationIds: routeSummaries.filter((route) => route.near).map((route) => route.relationId),
    routeSummaries,
    crossings: crossingCount(presentation.routedEdges),
    routeMedian: lengths[Math.floor(lengths.length / 2)],
    routeMax: Math.max(...lengths),
    routePaths,
    relationLabelPaths,
    feedbackApplied: presentation.feedbackApplied,
  };
}

const baseRendered = render({}, true);
const base = measure(baseRendered.presentation);
const firstPass = baseRendered.passes.find((pass) => pass.pass === "first");
const feedbackPass = baseRendered.passes.find((pass) => pass.pass === "feedback");
const noFeedback = measure(render({}, false).presentation);
const baseHitIds = base.hitRelationIds;
const routeSideOffsets = [0, ...[-1, 1].flatMap((sign) => [12, 24, 48, 72, 96, 120, 144, 168, 192].map((value) => sign * value))];

const routeSideSensitivity = baseHitIds.map((relationId) => {
  const alternatives = routeSideOffsets.map((offset) => {
    const rendered = render({ [relationId]: offset }, true);
    const measured = measure(rendered.presentation);
    const route = measured.routeSummaries.find((candidate) => candidate.relationId === relationId);
    const changedOtherRoutes = Object.keys(measured.routePaths).filter((id) => id !== relationId && measured.routePaths[id] !== base.routePaths[id]);
    return {
      offset,
      hit: measured.hitRelationIds.includes(relationId),
      near: measured.nearRelationIds.includes(relationId),
      globalHits: measured.hitRelationIds.length,
      globalNear: measured.nearRelationIds.length,
      globalCrossings: measured.crossings,
      routeMedian: measured.routeMedian,
      routeMax: measured.routeMax,
      routeLength: route?.routeLength ?? null,
      changedOtherRoutes,
    };
  });
  const hitFree = alternatives.filter((alternative) => !alternative.hit);
  const best = hitFree.slice().sort((left, right) => left.globalHits - right.globalHits
    || left.globalCrossings - right.globalCrossings
    || left.globalNear - right.globalNear
    || (left.routeLength ?? Infinity) - (right.routeLength ?? Infinity))[0] ?? null;
  return { relationId, currentHit: true, alternatives, hitFreeOffsets: hitFree.map((alternative) => alternative.offset), best };
});

function passMeasure(pass) {
  return pass ? measure({
    routedEdges: pass.routes,
    relationLabels: pass.relationLabels,
    nodeLabels: pass.nodeLabels,
    feedbackApplied: false,
  }) : null;
}

const firstMetrics = passMeasure(firstPass);
const feedbackMetrics = passMeasure(feedbackPass);
const feedbackRouteChanges = firstPass && feedbackPass
  ? Object.keys(base.routePaths).filter((id) => {
    const firstRoute = firstPass.routes.find((route) => route.id === id);
    const finalRoute = feedbackPass.routes.find((route) => route.id === id);
    return firstRoute?.path !== finalRoute?.path;
  })
  : [];
const feedbackRelationLabelChanges = firstPass && feedbackPass
  ? Object.keys(base.relationLabelPaths).filter((id) => {
    const firstLabel = firstPass.relationLabels.get(id);
    const finalLabel = feedbackPass.relationLabels.get(id);
    return JSON.stringify(firstLabel) !== JSON.stringify(finalLabel);
  })
  : [];

console.log(JSON.stringify({
  contract: "LIAISONSCAPE-REGIONAL-CARE-RESIDUAL-HIT-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  fixturePath,
  positionsPath,
  geometryFixed: true,
  routeSideOffsets,
  labelCorridorMargin: 48,
  base,
  firstPass: firstMetrics,
  feedbackPass: feedbackMetrics,
  noFeedback,
  feedbackSensitivity: {
    feedbackApplied: base.feedbackApplied,
    changedRoutes: feedbackRouteChanges,
    changedRelationLabels: feedbackRelationLabelChanges,
  },
  routeSideSensitivity,
  relationLabelPlacementSensitivity: {
    routeHitPredicateUses: "node-label-rectangles",
    relationLabelsAreDownstreamOfRouteSelection: true,
    causalForCurrentLabelRouteHit: false,
  },
}, null, 2));
