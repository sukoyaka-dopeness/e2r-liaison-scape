import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveAutomaticNodeLabels, deriveAutomaticRelationLabels, deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { curveOffsetFromControlPoint, fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";

const fixturePath = process.argv[2];
const positionsPath = process.argv[3];
if (!fixturePath || !positionsPath) throw new Error("Usage: node regional-care-arbitration-diagnostic.mjs <fixture.json> <generic-search-output.json>");

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
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const residualRelations = ["r03", "r16", "r18"];

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

function provisionalLabels() {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id],
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]),
    [],
  ));
}

function render({ edgeCurveOffsets = {}, feedbackEnabled = true, manualNodeLabelOffsets = new Map(), provisionalNodeLabels = provisionalLabels() } = {}) {
  const passes = [];
  const decisions = [];
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets,
    selfLoopOverrides: {},
    provisionalNodeLabels,
    ...emptyState,
    manualNodeLabelOffsets,
    feedbackEnabled,
    routeDecisionSink: (decision) => decisions.push(decision),
    presentationPassSink: ({ route, relationLabel, nodeLabel }) => passes.push({ pass: route.pass, routes: route.routes, relationLabels: relationLabel.labels, nodeLabels: nodeLabel.labels }),
  });
  return { presentation, passes, decisions };
}

function measure(presentation) {
  const labels = [...presentation.nodeLabels.entries()].map(([id, rect]) => ({ id, rect }));
  const hitDetails = [];
  const nearRelationIds = [];
  const routeSummaries = presentation.routedEdges.map((route) => {
    const conflicts = labels.flatMap(({ id, rect }) => {
      if (!routeSamplesHaveLabelCollision(route.samples, [rect])) return [];
      const innerHit = routeSamplesHaveLabelCollision(innerSamples(route), [rect]);
      return [{ labelId: id, endpointLabel: id === route.sourceId || id === route.targetId, innerHit, endpointOnly: !innerHit }];
    });
    if (conflicts.length > 0) hitDetails.push({
      relationId: route.id,
      sourceId: route.sourceId,
      targetId: route.targetId,
      conflicts,
      endpointOnly: conflicts.every((conflict) => conflict.endpointOnly),
    });
    const near = route.samples.some((point) => labels.some(({ rect }) => {
      const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
      const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
      return Math.hypot(dx, dy) < 20;
    }));
    if (near) nearRelationIds.push(route.id);
    return { relationId: route.id, routeLength: routeLength(route.samples), near };
  });
  const lengths = routeSummaries.map((route) => route.routeLength).sort((left, right) => left - right);
  const x = Object.values(positions).map((point) => point.x);
  const y = Object.values(positions).map((point) => point.y);
  return {
    hitDetails,
    hitRelationIds: hitDetails.map((detail) => detail.relationId),
    nearRelationIds,
    crossings: crossingCount(presentation.routedEdges),
    routeMedian: lengths[Math.floor(lengths.length / 2)],
    routeMax: Math.max(...lengths),
    extent: [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)],
    fit: fitGraphView(Object.values(positions), 800, 500).scale,
    feedbackApplied: presentation.feedbackApplied,
  };
}

function densify(points, steps = 12) {
  const samples = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    for (let step = 0; step < steps; step += 1) {
      const ratio = step / steps;
      samples.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
    }
  }
  samples.push(points[points.length - 1]);
  return samples;
}

function pathForSamples(samples) {
  return samples.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function richerTopologyRoute(route, kind, offset) {
  const start = route.samples[0];
  const end = route.samples[route.samples.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  let controlPoints;
  if (kind === "orthogonal-like") {
    if (Math.abs(dx) >= Math.abs(dy)) {
      const corridorY = midpoint.y + normal.y * offset;
      controlPoints = [{ x: start.x, y: corridorY }, { x: end.x, y: corridorY }];
    } else {
      const corridorX = midpoint.x + normal.x * offset;
      controlPoints = [{ x: corridorX, y: start.y }, { x: corridorX, y: end.y }];
    }
  } else if (kind === "three-bend") {
    controlPoints = [
      { x: start.x + tangent.x * length * 0.22 + normal.x * offset, y: start.y + tangent.y * length * 0.22 + normal.y * offset },
      { x: midpoint.x + normal.x * offset * 1.35, y: midpoint.y + normal.y * offset * 1.35 },
      { x: end.x - tangent.x * length * 0.22 + normal.x * offset, y: end.y - tangent.y * length * 0.22 + normal.y * offset },
    ];
  } else {
    controlPoints = [
      { x: start.x + tangent.x * length * 0.30 + normal.x * offset, y: start.y + tangent.y * length * 0.30 + normal.y * offset },
      { x: end.x - tangent.x * length * 0.30 + normal.x * offset, y: end.y - tangent.y * length * 0.30 + normal.y * offset },
    ];
  }
  const samples = densify([start, ...controlPoints, end]);
  const midpointSample = samples[Math.floor(samples.length / 2)] ?? midpoint;
  return {
    ...route,
    path: pathForSamples(samples),
    samples,
    labelPoint: midpointSample,
    controlPoint: controlPoints[Math.floor(controlPoints.length / 2)] ?? midpoint,
  };
}

function rederiveFromRoutes(routedEdges, manualNodeLabelOffsets = new Map()) {
  const nodePoints = graph.nodes.map((node) => positions[node.id]);
  const relationLabels = deriveAutomaticRelationLabels({
    routedEdges,
    nodes: nodePoints,
    previousPlacements: new Map(),
    manualAnchors: new Map(),
  });
  const nodeLabels = deriveAutomaticNodeLabels({
    nodes: graph.nodes,
    positions,
    routedEdges,
    occupiedRelationLabels: relationLabels,
    previousPlacements: new Map(),
    manualOffsets: manualNodeLabelOffsets,
  });
  return { routedEdges, relationLabels, nodeLabels, feedbackApplied: false };
}

function topologyRecord(rendered, relationId, kind, offset) {
  const metrics = measure(rendered);
  return {
    relationId,
    kind,
    offset,
    localHit: metrics.hitRelationIds.includes(relationId),
    globalHits: metrics.hitRelationIds.length,
    globalNear: metrics.nearRelationIds.length,
    globalCrossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    extent: metrics.extent,
    fit: metrics.fit,
  };
}

function decisionSummary(rendered, relationId) {
  return rendered.decisions
    .filter((decision) => decision.edgeId === relationId)
    .map((decision) => ({
      pass: decision.pass,
      processingIndex: decision.processingIndex,
      usedPreviousRoute: decision.usedPreviousRoute,
      candidateOffsets: decision.candidateDiagnostics.filter((candidate) => candidate.selected).map((candidate) => candidate.offset),
      candidateCount: decision.candidateDiagnostics.length,
      blockingNodeLabelIds: decision.continuity.blockingNodeLabelIds,
      activeRecovery: decision.activeRecovery,
    }));
}

function summaryForRelation(metrics, relationId) {
  const detail = metrics.hitDetails.find((candidate) => candidate.relationId === relationId);
  return detail ? {
    relationId,
    hit: true,
    conflicts: detail.conflicts,
    endpointOnly: detail.endpointOnly,
  } : { relationId, hit: false, conflicts: [] };
}

function compareCandidate(candidate) {
  return [candidate.globalHits, candidate.globalCrossings, candidate.globalNear, candidate.routeMax, candidate.routeMedian];
}

function selectBest(candidates) {
  return candidates.slice().sort((left, right) => {
    const a = compareCandidate(left); const b = compareCandidate(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return Math.abs(left.displacement ?? 0) - Math.abs(right.displacement ?? 0);
  })[0] ?? null;
}

const baseRendered = render();
const base = measure(baseRendered.presentation);
const firstPass = baseRendered.passes.find((pass) => pass.pass === "first");
const feedbackPass = baseRendered.passes.find((pass) => pass.pass === "feedback");
const noFeedbackRendered = render({ feedbackEnabled: false });
const noFeedback = measure(noFeedbackRendered.presentation);
const routeOffsets = [0, ...[-1, 1].flatMap((sign) => [24, 48, 72, 96, 120, 144, 168, 192].map((value) => sign * value))];

const routeSideAlternatives = residualRelations.map((relationId) => {
  const alternatives = routeOffsets.map((offset) => {
    const rendered = render({ edgeCurveOffsets: { [relationId]: offset } });
    const metrics = measure(rendered.presentation);
    return {
      offset,
      localHit: metrics.hitRelationIds.includes(relationId),
      globalHits: metrics.hitRelationIds.length,
      globalNear: metrics.nearRelationIds.length,
      globalCrossings: metrics.crossings,
      routeMedian: metrics.routeMedian,
      routeMax: metrics.routeMax,
      extent: metrics.extent,
      fit: metrics.fit,
    };
  });
  const hitFree = alternatives.filter((candidate) => !candidate.localHit);
  const best = selectBest(hitFree.map((candidate) => ({ ...candidate, displacement: candidate.offset })));
  return { relationId, hitFreeOffsets: hitFree.map((candidate) => candidate.offset), best };
});

function labelCandidates(nodeId, label) {
  const node = positions[nodeId];
  return Array.from({ length: 32 }, (_, index) => {
    const angle = Math.PI / 2 + index * Math.PI / 16;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const distance = 40 + Math.abs(directionX) * label.width / 2 + Math.abs(directionY) * label.height / 2;
    return {
      index,
      label: { ...label, x: node.x + directionX * distance, y: node.y + directionY * distance, directionX, directionY },
    };
  });
}

const baseLabels = baseRendered.presentation.nodeLabels;
const nodeLabelAlternatives = residualRelations.map((relationId) => {
  const detail = base.hitDetails.find((candidate) => candidate.relationId === relationId);
  const labelIds = detail?.conflicts.map((conflict) => conflict.labelId) ?? [];
  const alternatives = [];
  for (const labelId of labelIds) {
    const currentLabel = baseLabels.get(labelId);
    if (!currentLabel) continue;
    for (const candidate of labelCandidates(labelId, currentLabel)) {
      const node = positions[labelId];
      const offsets = new Map([[labelId, { x: candidate.label.x - node.x, y: candidate.label.y - node.y }]]);
      const nextProvisional = provisionalLabels();
      const nodeIndex = graph.nodes.findIndex(({ id }) => id === labelId);
      nextProvisional[nodeIndex] = candidate.label;
      const rendered = render({ manualNodeLabelOffsets: offsets, provisionalNodeLabels: nextProvisional });
      const metrics = measure(rendered.presentation);
      alternatives.push({
        labelId,
        candidateIndex: candidate.index,
        candidateLabel: candidate.label,
        displacement: Math.hypot(offsets.get(labelId).x, offsets.get(labelId).y),
        localHit: metrics.hitRelationIds.includes(relationId),
        globalHits: metrics.hitRelationIds.length,
        globalNear: metrics.nearRelationIds.length,
        globalCrossings: metrics.crossings,
        routeMedian: metrics.routeMedian,
        routeMax: metrics.routeMax,
        extent: metrics.extent,
        fit: metrics.fit,
      });
    }
  }
  const hitFree = alternatives.filter((candidate) => !candidate.localHit);
  const byLabel = labelIds.map((labelId) => {
    const labelAlternatives = hitFree.filter((candidate) => candidate.labelId === labelId);
    return {
      labelId,
      hitFreeCount: labelAlternatives.length,
      bestHitFree: selectBest(labelAlternatives),
    };
  });
  return {
    relationId,
    labelIds,
    hitFreeCount: hitFree.length,
    bestHitFree: selectBest(hitFree),
    bestAny: selectBest(alternatives),
    byLabel,
  };
});

const r16FirstRoute = firstPass?.routes.find((route) => route.id === "r16");
const r16Source = positions[r16FirstRoute?.sourceId];
const r16Target = positions[r16FirstRoute?.targetId];
const r16FirstOffset = r16FirstRoute && r16Source && r16Target
  ? curveOffsetFromControlPoint(r16Source, r16Target, r16FirstRoute.controlPoint)
  : null;
const feedbackArbitration = r16FirstOffset === null ? null : (() => {
  const rendered = render({ edgeCurveOffsets: { r16: r16FirstOffset }, feedbackEnabled: true });
  const metrics = measure(rendered.presentation);
  return {
    preservedFirstPassRouteOffset: r16FirstOffset,
    metrics,
    r16: summaryForRelation(metrics, "r16"),
    decisions: decisionSummary(rendered, "r16"),
  };
})();

const feedbackLabelRetention = ["r03", "r16", "r18"].flatMap((relationId) => {
  const detail = base.hitDetails.find((candidate) => candidate.relationId === relationId);
  return (detail?.conflicts ?? []).map(({ labelId }) => {
    const firstLabel = firstPass?.nodeLabels.get(labelId);
    if (!firstLabel) return { relationId, labelId, unavailable: true };
    const node = positions[labelId];
    const offsets = new Map([[labelId, { x: firstLabel.x - node.x, y: firstLabel.y - node.y }]]);
    const nextProvisional = provisionalLabels();
    const nodeIndex = graph.nodes.findIndex(({ id }) => id === labelId);
    nextProvisional[nodeIndex] = firstLabel;
    const rendered = render({ manualNodeLabelOffsets: offsets, provisionalNodeLabels: nextProvisional, feedbackEnabled: true });
    const metrics = measure(rendered.presentation);
    return {
      relationId,
      labelId,
      firstPassLabelRetained: true,
      metrics,
      local: summaryForRelation(metrics, relationId),
      decisions: decisionSummary(rendered, relationId),
    };
  });
});

const topologyKinds = ["dogleg", "orthogonal-like", "three-bend"];
const topologyOffsets = [-240, -192, -144, -96, 96, 144, 192, 240];
const richerTopology = ["r03", "r18"].map((relationId) => {
  const alternatives = [];
  const targetRoute = baseRendered.presentation.routedEdges.find((route) => route.id === relationId);
  for (const kind of topologyKinds) for (const offset of topologyOffsets) {
    if (!targetRoute) continue;
    const routes = baseRendered.presentation.routedEdges.map((route) => route.id === relationId
      ? richerTopologyRoute(route, kind, offset)
      : route);
    const presentation = rederiveFromRoutes(routes);
    alternatives.push(topologyRecord(presentation, relationId, kind, offset));
  }
  const localHitFree = alternatives.filter((candidate) => !candidate.localHit);
  return {
    relationId,
    evaluated: alternatives.length,
    localHitFreeCount: localHitFree.length,
    hitFreeKinds: [...new Set(localHitFree.map(({ kind }) => kind))],
    best: selectBest(localHitFree),
    bestAny: selectBest(alternatives),
    topHitFree: localHitFree.slice().sort((left, right) => {
      const a = compareCandidate(left); const b = compareCandidate(right);
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
      return left.kind.localeCompare(right.kind) || left.offset - right.offset;
    }).slice(0, 8),
  };
});

const topologyPools = richerTopology.map((result) => [null, ...result.topHitFree.slice(0, 6)]);
const topologyCombinations = [];
for (const r03Candidate of topologyPools[0]) for (const r18Candidate of topologyPools[1]) {
  const actions = [r03Candidate, r18Candidate].filter(Boolean);
  const routes = baseRendered.presentation.routedEdges.map((route) => {
    const action = actions.find((candidate) => candidate.relationId === route.id);
    return action ? richerTopologyRoute(route, action.kind, action.offset) : route;
  });
  const presentation = rederiveFromRoutes(routes);
  const metrics = measure(presentation);
  topologyCombinations.push({
    actions: actions.map(({ relationId, kind, offset }) => ({ relationId, kind, offset })),
    ...metrics,
    globalHits: metrics.hitRelationIds.length,
    globalNear: metrics.nearRelationIds.length,
    globalCrossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    remoteRouteEffects: "not re-arbitrated; routes other than the edited topology remain fixed",
  });
}
const sortedTopologyCombinations = topologyCombinations.slice().sort((left, right) => {
  const a = compareCandidate(left); const b = compareCandidate(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return JSON.stringify(left.actions).localeCompare(JSON.stringify(right.actions));
});
const topologyMateriallySafer = sortedTopologyCombinations.filter((candidate) =>
  candidate.globalHits < base.hitRelationIds.length
  && candidate.globalNear <= base.nearRelationIds.length
  && candidate.globalCrossings <= base.crossings
  && candidate.routeMedian <= base.routeMedian * 1.05
  && candidate.routeMax <= base.routeMax * 1.05,
);

function feedbackRollbackPresentation({ routeRollback = false, labelRollback = false }) {
  let routedEdges = baseRendered.presentation.routedEdges;
  if (routeRollback && firstPass) {
    const firstRoute = firstPass.routes.find((route) => route.id === "r16");
    if (firstRoute) routedEdges = routedEdges.map((route) => route.id === "r16" ? firstRoute : route);
  }
  const relationLabels = new Map(baseRendered.presentation.relationLabels);
  const nodeLabels = new Map(baseRendered.presentation.nodeLabels);
  if (labelRollback && firstPass) {
    const firstLabel = firstPass.nodeLabels.get("city-hospital");
    if (firstLabel) nodeLabels.set("city-hospital", firstLabel);
  }
  return { routedEdges, relationLabels, nodeLabels, feedbackApplied: false };
}

const feedbackRollback = [
  ["none", false, false],
  ["r16-route", true, false],
  ["r16-label", false, true],
  ["r16-route+label", true, true],
].map(([policy, routeRollback, labelRollback]) => {
  const presentation = feedbackRollbackPresentation({ routeRollback, labelRollback });
  const metrics = measure(presentation);
  return {
    policy,
    r16: summaryForRelation(metrics, "r16"),
    hits: metrics.hitRelationIds.length,
    hitRelationIds: metrics.hitRelationIds,
    near: metrics.nearRelationIds.length,
    nearRelationIds: metrics.nearRelationIds,
    crossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    extent: metrics.extent,
    fit: metrics.fit,
    changedRemoteRoutes: routeRollback ? ["r16"] : [],
    changedNodeLabels: labelRollback ? ["city-hospital"] : [],
    model: "bounded state-level rollback; downstream labels are not re-derived",
  };
});

function renderJoint(routeOffsets = {}, labelOverrides = {}, feedbackEnabled = true) {
  const nextProvisional = provisionalLabels();
  const manualNodeLabelOffsets = new Map();
  for (const [labelId, label] of Object.entries(labelOverrides)) {
    const node = positions[labelId];
    const nodeIndex = graph.nodes.findIndex(({ id }) => id === labelId);
    if (!node || nodeIndex < 0) continue;
    nextProvisional[nodeIndex] = label;
    manualNodeLabelOffsets.set(labelId, { x: label.x - node.x, y: label.y - node.y });
  }
  return render({ edgeCurveOffsets: routeOffsets, manualNodeLabelOffsets, provisionalNodeLabels: nextProvisional, feedbackEnabled });
}

function routeChanges(rendered, excludedIds = []) {
  const excluded = new Set(excludedIds);
  return rendered.presentation.routedEdges
    .filter((route) => !excluded.has(route.id))
    .filter((route) => baseRendered.presentation.routedEdges.find((baseRoute) => baseRoute.id === route.id)?.path !== route.path)
    .map((route) => route.id);
}

function labelChanges(rendered) {
  return [...rendered.presentation.nodeLabels.entries()]
    .filter(([id, label]) => {
      const baseLabel = baseRendered.presentation.nodeLabels.get(id);
      return !baseLabel || Math.hypot(label.x - baseLabel.x, label.y - baseLabel.y) > 0.5;
    })
    .map(([id]) => id);
}

function jointCandidateRecord(rendered, relationId, routeOffset, labelPlan, labelOverrides) {
  const metrics = measure(rendered.presentation);
  const local = summaryForRelation(metrics, relationId);
  return {
    relationId,
    routeOffset,
    labelPlan,
    labelIds: Object.keys(labelOverrides),
    localHit: local.hit,
    globalHits: metrics.hitRelationIds.length,
    globalNear: metrics.nearRelationIds.length,
    globalCrossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    extent: metrics.extent,
    fit: metrics.fit,
    changedRemoteRoutes: routeChanges(rendered, [relationId]),
    changedNodeLabels: labelChanges(rendered),
    labelOverrides,
  };
}

function labelPlansForRelation(relationId) {
  const alternatives = nodeLabelAlternatives.find((candidate) => candidate.relationId === relationId);
  const plans = [{ name: "none", overrides: {} }];
  for (const labelAlternative of alternatives?.byLabel ?? []) {
    const best = labelAlternative.bestHitFree;
    if (best?.candidateLabel) plans.push({
      name: `label:${labelAlternative.labelId}:candidate-${best.candidateIndex}`,
      overrides: { [labelAlternative.labelId]: best.candidateLabel },
    });
  }
  if (relationId === "r18") {
    const combined = (alternatives?.byLabel ?? []).filter(({ bestHitFree }) => bestHitFree?.candidateLabel);
    if (combined.length === 3) plans.push({
      name: "labels:all-three-best-hit-free",
      overrides: Object.fromEntries(combined.map(({ labelId, bestHitFree }) => [labelId, bestHitFree.candidateLabel])),
    });
  }
  if (relationId === "r16") {
    const firstLabel = firstPass?.nodeLabels.get("city-hospital");
    if (firstLabel) plans.push({ name: "feedback:retain-first-pass-city-hospital", overrides: { "city-hospital": firstLabel } });
  }
  return plans;
}

const jointPerRelation = residualRelations.map((relationId) => {
  const routeAlternative = routeSideAlternatives.find((candidate) => candidate.relationId === relationId);
  const routeOptions = [0, ...(routeAlternative?.hitFreeOffsets ?? [])].filter((offset, index, offsets) => offsets.indexOf(offset) === index);
  const labelPlans = labelPlansForRelation(relationId);
  const candidates = [];
  for (const routeOffset of routeOptions) for (const plan of labelPlans) {
    const rendered = renderJoint({ [relationId]: routeOffset }, plan.overrides, true);
    candidates.push(jointCandidateRecord(rendered, relationId, routeOffset, plan.name, plan.overrides));
  }
  const localHitFree = candidates.filter((candidate) => !candidate.localHit);
  const best = selectBest(localHitFree);
  return {
    relationId,
    routeOptions,
    labelPlans: labelPlans.map(({ name }) => name),
    evaluated: candidates.length,
    localHitFreeCount: localHitFree.length,
    best,
    topHitFree: localHitFree.slice().sort((left, right) => {
      const a = compareCandidate(left); const b = compareCandidate(right);
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
      return left.labelPlan.localeCompare(right.labelPlan) || left.routeOffset - right.routeOffset;
    }).slice(0, 8),
  };
});

function mergeJointActions(actions) {
  return {
    routeOffsets: Object.fromEntries(actions.filter((action) => action.routeOffset !== 0).map((action) => [action.relationId, action.routeOffset])),
    labelOverrides: Object.assign({}, ...actions.map((action) => action.labelOverrides)),
  };
}

const jointPools = jointPerRelation.map((result) => [
  { relationId: result.relationId, routeOffset: 0, labelPlan: "none", labelOverrides: {} },
  ...result.topHitFree.slice(0, 5).map((candidate) => ({
    relationId: candidate.relationId,
    routeOffset: candidate.routeOffset,
    labelPlan: candidate.labelPlan,
    labelOverrides: candidate.labelOverrides,
  })),
]);

const jointCombinations = [];
for (const first of jointPools[0]) for (const second of jointPools[1]) for (const third of jointPools[2]) {
  const actions = [first, second, third];
  const merged = mergeJointActions(actions);
  const rendered = renderJoint(merged.routeOffsets, merged.labelOverrides, true);
  const metrics = measure(rendered.presentation);
  jointCombinations.push({
    actions: actions.map(({ relationId, routeOffset, labelPlan }) => ({ relationId, routeOffset, labelPlan })),
    ...metrics,
    globalHits: metrics.hitRelationIds.length,
    globalNear: metrics.nearRelationIds.length,
    globalCrossings: metrics.crossings,
    routeMedian: metrics.routeMedian,
    routeMax: metrics.routeMax,
    changedRemoteRoutes: routeChanges(rendered),
    changedNodeLabels: labelChanges(rendered),
  });
}
const sortedJointCombinations = jointCombinations.slice().sort((left, right) => {
  const a = compareCandidate(left); const b = compareCandidate(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return left.actions.map(({ labelPlan }) => labelPlan).join("|").localeCompare(right.actions.map(({ labelPlan }) => labelPlan).join("|"));
});
const materiallySaferJoint = sortedJointCombinations.filter((candidate) =>
  candidate.globalHits < base.hitRelationIds.length
  && candidate.globalNear <= base.nearRelationIds.length
  && candidate.globalCrossings <= base.crossings
  && candidate.routeMedian <= base.routeMedian * 1.05
  && candidate.routeMax <= base.routeMax * 1.05,
);

const hitClassifications = residualRelations.map((relationId) => {
  const detail = base.hitDetails.find((candidate) => candidate.relationId === relationId);
  const route = routeSideAlternatives.find((candidate) => candidate.relationId === relationId);
  const labels = nodeLabelAlternatives.find((candidate) => candidate.relationId === relationId);
  return {
    relationId,
    conflicts: detail?.conflicts ?? [],
    endpointOnly: detail?.endpointOnly ?? false,
    routeSideHasLocalHitFree: (route?.hitFreeOffsets.length ?? 0) > 0,
    nodeLabelHasLocalHitFree: (labels?.hitFreeCount ?? 0) > 0,
    routeSideBestGlobal: route?.best ?? null,
    nodeLabelBestGlobal: labels?.bestHitFree ?? null,
    classification: relationId === "r16"
      ? "feedback-dependent"
      : (labels?.hitFreeCount ?? 0) > 0 ? "Node-label-placement-sensitive" : "routing-limited-or-joint-interaction",
  };
});

console.log(JSON.stringify({
  contract: "LIAISONSCAPE-REGIONAL-CARE-ARBITRATION-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  geometryFixed: true,
  fixturePath,
  positionsPath,
  base,
  firstPass: firstPass ? measure({ routedEdges: firstPass.routes, relationLabels: firstPass.relationLabels, nodeLabels: firstPass.nodeLabels, feedbackApplied: false }) : null,
  feedbackPass: feedbackPass ? measure({ routedEdges: feedbackPass.routes, relationLabels: feedbackPass.relationLabels, nodeLabels: feedbackPass.nodeLabels, feedbackApplied: false }) : null,
  noFeedback,
  residualRelations,
  hitClassifications,
  routeSideAlternatives,
  nodeLabelAlternatives,
  feedbackArbitration,
  feedbackLabelRetention,
  richerTopology,
  richerTopologyGlobalSearch: {
    candidatePoolSizes: topologyPools.map((pool) => pool.length),
    combinationsEvaluated: topologyCombinations.length,
    bestByGlobalVector: sortedTopologyCombinations.slice(0, 5),
    materiallySaferCount: topologyMateriallySafer.length,
    bestMateriallySafer: topologyMateriallySafer[0] ?? null,
  },
  feedbackRollback,
  jointPerRelation,
  jointGlobalSearch: {
    candidatePoolSizes: jointPools.map((pool) => pool.length),
    combinationsEvaluated: jointCombinations.length,
    bestByGlobalVector: sortedJointCombinations.slice(0, 5),
    materiallySaferCount: materiallySaferJoint.length,
    bestMateriallySafer: materiallySaferJoint[0] ?? null,
  },
  routeDecisionEvidence: Object.fromEntries(residualRelations.map((relationId) => [relationId, decisionSummary(baseRendered, relationId)])),
  relationLabelCausality: {
    currentHitPredicate: "route samples against final Node-label rectangles",
    relationLabelsAreDownstreamOfRouteSelection: true,
    directSwitchForResidualHits: false,
  },
}, null, 2));
