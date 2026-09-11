import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";
import { INITIAL_ENTITY_CLEARANCE } from "../src/initial-entity-placement.ts";

const fixturePath = process.argv[2] ?? "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
function syntheticK33Dataset() {
  const left = ["left-a", "left-b", "left-c"]; const right = ["right-a", "right-b", "right-c"];
  return {
    version: "1.0",
    entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })),
    events: [],
    relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))),
  };
}
const dataset = fixturePath === "synthetic:k3-3" ? syntheticK33Dataset() : JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const graph = buildEntityGraph(dataset);
const profile = { presentationCalls: 0, fullPresentationEvaluations: 0, presentationMs: 0, duplicatePositionCalls: 0, presentationCacheHits: 0, stages: {} };
const presentationCache = new Map();
let activeProfileStage = "setup";
const presentationFinalistLimit = Number.parseInt(process.env.E2R_PRESENTATION_FINALIST_LIMIT ?? "8", 10);
const parsedPresentationRepairRounds = Number.parseInt(process.env.E2R_PRESENTATION_REPAIR_ROUNDS ?? "24", 10);
const presentationRepairRounds = Number.isFinite(parsedPresentationRepairRounds) && parsedPresentationRepairRounds >= 1 ? parsedPresentationRepairRounds : 24;
const relaxationTargeting = process.env.E2R_RELAXATION_TARGETING ?? "full";
const relaxationAdmission = process.env.E2R_RELAXATION_ADMISSION ?? "hard";
const relaxationMoveMode = process.env.E2R_RELAXATION_MOVE_MODE ?? "single";
const relaxationObjective = process.env.E2R_RELAXATION_OBJECTIVE ?? "standard";
const parsedRelaxationPairLimit = Number.parseInt(process.env.E2R_RELAXATION_PAIR_LIMIT ?? "8", 10);
const relaxationPairLimit = Number.isFinite(parsedRelaxationPairLimit) && parsedRelaxationPairLimit >= 2 ? parsedRelaxationPairLimit : 8;
const parsedRelaxationClusterLimit = Number.parseInt(process.env.E2R_RELAXATION_CLUSTER_LIMIT ?? "6", 10);
const relaxationClusterLimit = Number.isFinite(parsedRelaxationClusterLimit) && parsedRelaxationClusterLimit >= 3 ? parsedRelaxationClusterLimit : 6;
const parsedRelaxationMaxDisplacement = Number.parseFloat(process.env.E2R_RELAXATION_MAX_DISPLACEMENT ?? "48");
const relaxationMaxDisplacement = Number.isFinite(parsedRelaxationMaxDisplacement) && parsedRelaxationMaxDisplacement > 0 ? parsedRelaxationMaxDisplacement : 48;
const parsedRelaxationTargetLimit = Number.parseInt(process.env.E2R_RELAXATION_TARGET_LIMIT ?? "0", 10);
const relaxationTargetLimit = Number.isFinite(parsedRelaxationTargetLimit) && parsedRelaxationTargetLimit >= 1 ? parsedRelaxationTargetLimit : null;
const relaxationStepMode = process.env.E2R_RELAXATION_STEP_MODE ?? "full";
const parsedLabelCorridorMargin = Number.parseFloat(process.env.E2R_LABEL_CORRIDOR_MARGIN ?? "48");
const labelCorridorMargin = Number.isFinite(parsedLabelCorridorMargin) && parsedLabelCorridorMargin > 0 ? parsedLabelCorridorMargin : 48;
const parsedLabelCorridorWeight = Number.parseFloat(process.env.E2R_LABEL_CORRIDOR_WEIGHT ?? "1200");
const labelCorridorWeight = Number.isFinite(parsedLabelCorridorWeight) && parsedLabelCorridorWeight > 0 ? parsedLabelCorridorWeight : 1200;
const parsedRelaxationLatticeStep = Number.parseFloat(process.env.E2R_RELAXATION_LATTICE_STEP ?? "0");
const relaxationLatticeStep = Number.isFinite(parsedRelaxationLatticeStep) && parsedRelaxationLatticeStep > 0 ? parsedRelaxationLatticeStep : 0;
const relaxationLatticeProbe = process.env.E2R_RELAXATION_LATTICE_PROBE === "1" || relaxationLatticeStep > 0;
const relaxationCheapScreenMode = process.env.E2R_RELAXATION_CHEAP_SCREEN ?? "off";
const relaxationCheapScreenEnabled = relaxationCheapScreenMode === "on";
const relaxationCheapScreenProbe = relaxationCheapScreenEnabled || relaxationCheapScreenMode === "probe";
const relaxationDependencyTraceEnabled = process.env.E2R_RELAXATION_DEPENDENCY_TRACE === "1";
const relaxationApproximationMode = process.env.E2R_RELAXATION_APPROXIMATION ?? "off";
const relaxationApproximationAudit = process.env.E2R_RELAXATION_APPROXIMATION_AUDIT === "1";
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

function compareId(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function clonePositions(positions) { return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }])); }
function positionsKey(positions) {
  return Object.entries(positions).sort(([left], [right]) => compareId(left, right))
    .map(([id, point]) => `${id}:${point.x},${point.y}`).join("|");
}
function quantizePositions(positions, step) {
  if (!(step > 0)) return clonePositions(positions);
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  }]));
}
function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}
function nodeFeasibility(positions) {
  let overlapPairs = 0; let minimumSeparation = Infinity;
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    const separation = Math.hypot(first.x - second.x, first.y - second.y);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  return { overlapPairs, minimumSeparation };
}
function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  const firstLength = Math.hypot(rx, ry); const secondLength = Math.hypot(sx, sy);
  return {
    x: a.x + t * rx,
    y: a.y + t * ry,
    angleDegrees: Math.asin(Math.min(1, Math.abs(denominator) / Math.max(1e-9, firstLength * secondLength))) * 180 / Math.PI,
  };
}
function crossingDetails(routes, relationLabels) {
  const labels = [...relationLabels.values()]; const details = [];
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let hit = null;
    for (let a = 1; a < first.samples.length && !hit; a += 1) for (let b = 1; b < second.samples.length && !hit; b += 1) hit = segmentIntersection(first.samples[a - 1], first.samples[a], second.samples[b - 1], second.samples[b]);
    if (hit) details.push({ routes: [first.id, second.id], ...hit, relationLabelNear: labels.some((label) => distanceToRect(hit, label) < 24) });
  }
  return details;
}
function mapGeometrySignatures(values) {
  return Object.fromEntries([...values.entries()].map(([id, value]) => [id, JSON.stringify(value)]));
}
function routeGeometrySignatures(routes) {
  return Object.fromEntries(routes.map((route) => [route.id, JSON.stringify({
    path: route.path,
    samples: route.samples,
    labelPoint: route.labelPoint,
    controlPoint: route.controlPoint,
    sourcePosition: route.sourcePosition,
    targetPosition: route.targetPosition,
    directRecoveryObstacleId: route.directRecoveryObstacleId,
  })]));
}
function compactRouteDecision(decision) {
  const selected = decision.candidateDiagnostics.find((candidate) => candidate.selected);
  return {
    pass: decision.pass,
    processingIndex: decision.processingIndex,
    edgeId: decision.edgeId,
    usedPreviousRoute: decision.usedPreviousRoute,
    recoveredCurrentRoute: decision.recoveredCurrentRoute,
    selectedOffset: selected?.offset ?? null,
    activeRecovery: {
      previousRouteDirectRecoveryObstacleId: decision.activeRecovery.previousRouteDirectRecoveryObstacleId,
      provenanceMatchesActiveDrag: decision.activeRecovery.provenanceMatchesActiveDrag,
      provenanceMatchesFinalizingDrag: decision.activeRecovery.provenanceMatchesFinalizingDrag,
      freshRouteIsSafe: decision.activeRecovery.freshRouteIsSafe,
      freshRouteHasNodeInfluence: decision.activeRecovery.freshRouteHasNodeInfluence,
      freshRouteHasOccupiedPathConflict: decision.activeRecovery.freshRouteHasOccupiedPathConflict,
      freshRouteHasLabelCollision: decision.activeRecovery.freshRouteHasLabelCollision,
    },
    continuity: {
      previousRoutePresent: decision.continuity.previousRoutePresent,
      draggedNodePresent: decision.continuity.draggedNodePresent,
      isIncident: decision.continuity.isIncident,
      isEligibleShape: decision.continuity.isEligibleShape,
      priorRouteHasNodeInfluence: decision.continuity.priorRouteHasNodeInfluence,
      priorRouteHasOccupiedPathConflict: decision.continuity.priorRouteHasOccupiedPathConflict,
      priorRouteHasLabelCollision: decision.continuity.priorRouteHasLabelCollision,
      blockingNodeIds: decision.continuity.blockingNodeIds,
      blockingOccupiedRouteIds: decision.continuity.blockingOccupiedRouteIds,
      blockingNodeLabelIds: decision.continuity.blockingNodeLabelIds,
    },
  };
}
function derivePresentationMetrics(positions, { replayPrefix } = {}) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const routeDecisionTrace = relaxationDependencyTraceEnabled ? [] : null;
  const replayedPrefixTrace = relaxationDependencyTraceEnabled ? [] : null;
  const presentationPassTrace = relaxationDependencyTraceEnabled ? [] : null;
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels: provisional, ...emptyState,
    routeDecisionSink: routeDecisionTrace ? (decision) => routeDecisionTrace.push(compactRouteDecision(decision)) : undefined,
    replayPrefix,
    replayPrefixSink: replayedPrefixTrace ? (edgeIds) => replayedPrefixTrace.push(edgeIds) : undefined,
    presentationPassSink: presentationPassTrace ? ({ route, relationLabel, nodeLabel }) => presentationPassTrace.push({
      pass: route.pass,
      routes: routeGeometrySignatures(route.routes),
      relationLabels: mapGeometrySignatures(relationLabel.labels),
      nodeLabels: mapGeometrySignatures(nodeLabel.labels),
    }) : undefined,
  });
  const routeLengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0)).sort((a, b) => a - b);
  const nodeLabels = [...presentation.nodeLabels.values()];
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, nodeLabels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => nodeLabels.some((label) => distanceToRect(point, label) < 20))).length;
  let labelCorridorDeficit = 0;
  let labelCorridorConflictPairs = 0;
  let labelCorridorMinimumClearance = Infinity;
  let labelCorridorMaximumIntrusion = 0;
  const routeLabelCorridors = presentation.routedEdges.map((route) => {
    const innerSamples = route.samples.length > 8 ? route.samples.slice(4, -4) : route.samples;
    let nearestLabelDistance = Infinity;
    let corridorDeficit = 0;
    let conflictPairs = 0;
    for (const label of nodeLabels) {
      const distance = innerSamples.length === 0 ? Infinity : Math.min(...innerSamples.map((point) => distanceToRect(point, label)));
      nearestLabelDistance = Math.min(nearestLabelDistance, distance);
      labelCorridorMinimumClearance = Math.min(labelCorridorMinimumClearance, distance);
      if (distance < labelCorridorMargin) {
        conflictPairs += 1;
        const intrusion = labelCorridorMargin - distance;
        corridorDeficit += intrusion;
        labelCorridorDeficit += intrusion;
        labelCorridorConflictPairs += 1;
        labelCorridorMaximumIntrusion = Math.max(labelCorridorMaximumIntrusion, intrusion);
      }
    }
    return { id: route.id, nearestLabelDistance, corridorDeficit, conflictPairs };
  });
  let labelOverlap = 0;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) {
    if (Math.abs(nodeLabels[left].x - nodeLabels[right].x) < (nodeLabels[left].width + nodeLabels[right].width) / 2
      && Math.abs(nodeLabels[left].y - nodeLabels[right].y) < (nodeLabels[left].height + nodeLabels[right].height) / 2) labelOverlap += 1;
  }
  const routeSupports = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id); const width = label?.width ?? 48;
    const length = route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0);
    const first = route.samples[0]; const last = route.samples.at(-1) ?? first;
    const direct = Math.hypot(last.x - first.x, last.y - first.y); const horizontalSpan = Math.abs(last.x - first.x);
    const horizontalRatio = horizontalSpan / Math.max(1, direct); const straightness = direct / Math.max(1, length);
    const shallow = horizontalRatio >= 0.55; const usableSpan = shallow ? horizontalSpan * straightness : null; const minimumUsableSpan = shallow ? width + 48 : null;
    return { id: route.id, length, horizontalRatio, usableSpan, minimumUsableSpan, usableShortfall: shallow ? Math.max(0, minimumUsableSpan - usableSpan) : 0 };
  });
  const usableSpanPenalty = routeSupports.reduce((sum, route) => sum + (route.usableShortfall / 18) ** 2 * 160, 0);
  const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y)).sort((a, b) => a - b);
  const x = Object.values(positions).map((point) => point.x); const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const crossing = crossingDetails(presentation.routedEdges, presentation.relationLabels);
  const feasibility = nodeFeasibility(positions);
  const pressureReasons = new Map();
  const addPressure = (id, reason) => {
    if (!pressureReasons.has(id)) pressureReasons.set(id, []);
    pressureReasons.get(id).push(reason);
  };
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  for (const support of routeSupports) {
    if (support.usableShortfall > 0 || support.length > 480) {
      const edge = edgeById.get(support.id);
      if (edge) {
        addPressure(edge.sourceId, support.usableShortfall > 0 ? `relation-label-span:${support.id}` : `long-route:${support.id}`);
        addPressure(edge.targetId, support.usableShortfall > 0 ? `relation-label-span:${support.id}` : `long-route:${support.id}`);
      }
    }
  }
  for (const detail of crossing) {
    const first = edgeById.get(detail.routes[0]); const second = edgeById.get(detail.routes[1]);
    for (const edge of [first, second]) if (edge) {
      addPressure(edge.sourceId, `route-crossing:${edge.id}`);
      addPressure(edge.targetId, `route-crossing:${edge.id}`);
    }
  }
  for (const route of presentation.routedEdges) {
    const routeHitsLabel = routeSamplesHaveLabelCollision(route.samples, nodeLabels);
    const routeNearLabel = route.samples.some((point) => nodeLabels.some((label) => distanceToRect(point, label) < 20));
    if (routeHitsLabel || routeNearLabel) {
      addPressure(route.sourceId, routeHitsLabel ? `route-label-hit:${route.id}` : `route-label-near:${route.id}`);
      addPressure(route.targetId, routeHitsLabel ? `route-label-hit:${route.id}` : `route-label-near:${route.id}`);
      nodeLabels.forEach((label, index) => {
        const distance = Math.min(...route.samples.map((point) => distanceToRect(point, label)));
        if (distance < 20) addPressure(graph.nodes[index]?.id, `node-label-route-near:${route.id}`);
      });
    }
  }
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) {
    if (Math.abs(nodeLabels[left].x - nodeLabels[right].x) < (nodeLabels[left].width + nodeLabels[right].width) / 2
      && Math.abs(nodeLabels[left].y - nodeLabels[right].y) < (nodeLabels[left].height + nodeLabels[right].height) / 2) {
      addPressure(graph.nodes[left]?.id, "node-label-overlap");
      addPressure(graph.nodes[right]?.id, "node-label-overlap");
    }
  }
  for (const edge of edges) {
    const hop = Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y);
    if (hop < INITIAL_ENTITY_CLEARANCE * 1.45) {
      addPressure(edge.sourceId, `short-hop:${edge.id}`);
      addPressure(edge.targetId, `short-hop:${edge.id}`);
    }
  }
  const routeMedian = routeLengths[Math.floor(routeLengths.length / 2)]; const routeMax = Math.max(...routeLengths);
  const shortHopCount = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.45).length;
  const score = crossing.length * 100000 + crossing.filter((detail) => detail.relationLabelNear).length * 15000 + labelRouteHits * 30000 + labelNear20 * 5000 + labelOverlap * 10000
    + usableSpanPenalty * 4 + shortHopCount * 5000 + routeMedian * 2 + routeMax + (extent[0] + extent[1]) * 0.25;
  const presentationTrace = routeDecisionTrace ? {
    routes: routeGeometrySignatures(presentation.routedEdges),
    relationLabels: mapGeometrySignatures(presentation.relationLabels),
    nodeLabels: mapGeometrySignatures(presentation.nodeLabels),
    feedbackApplied: presentation.feedbackApplied,
    routeDecisions: routeDecisionTrace,
    replayedPrefix: replayedPrefixTrace,
    passes: presentationPassTrace,
  } : undefined;
  const result = { score, ...feasibility, extent, aspectRatio: extent[0] / Math.max(1, extent[1]), fitScale: fitGraphView(Object.values(positions), 800, 500).scale, routeMedian, routeMax, hopLengths: { minimum: hopLengths[0], median: hopLengths[Math.floor(hopLengths.length / 2)], maximum: Math.max(...hopLengths), shortHopCount }, crossings: crossing.length, crossingDetails: crossing, labelRouteHits, labelNear20, labelOverlap, labelCorridorDeficit, labelCorridorConflictPairs, labelCorridorMinimumClearance: Number.isFinite(labelCorridorMinimumClearance) ? labelCorridorMinimumClearance : null, labelCorridorMaximumIntrusion, routeLabelCorridors, usableSpanPenalty, routeSupports, pressureNodeIds: [...pressureReasons.keys()].filter(Boolean).sort(compareId), pressureReasons: Object.fromEntries([...pressureReasons.entries()].filter(([id]) => id).sort(([left], [right]) => compareId(left, right))) };
  if (presentationTrace) Object.defineProperty(result, "presentationTrace", { value: presentationTrace, enumerable: false });
  Object.defineProperty(result, "presentationArtifacts", {
    value: { routedEdges: presentation.routedEdges, relationLabels: presentation.relationLabels, nodeLabels: presentation.nodeLabels },
    enumerable: false,
  });
  return result;
}
function localNodeFeasibility(nodes, positions) {
  let overlapPairs = 0;
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    const first = positions[nodes[left].id]; const second = positions[nodes[right].id];
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  return { overlapPairs };
}
function localPresentationScope(positions, focusIds) {
  const scope = new Set(focusIds);
  const radius = INITIAL_ENTITY_CLEARANCE * 2.5;
  for (const edge of edges) {
    if (scope.has(edge.sourceId) || scope.has(edge.targetId)) {
      scope.add(edge.sourceId); scope.add(edge.targetId);
    }
  }
  for (const focusId of focusIds) {
    const origin = positions[focusId];
    for (const node of graph.nodes) {
      if (Math.hypot(positions[node.id].x - origin.x, positions[node.id].y - origin.y) <= radius) scope.add(node.id);
    }
  }
  const nodes = graph.nodes.filter((node) => scope.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const scopedEdges = edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  return { nodes, edges: scopedEdges, radius, focusIds: focusIds.slice().sort(compareId) };
}
function deriveLocalPresentationApproximation(positions, focusIds) {
  const scope = localPresentationScope(positions, focusIds);
  const provisionalNodeLabels = scope.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], scope.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: scope.nodes, edges: scope.edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(), previousRelationLabelPlacements: new Map(), manualNodeLabelOffsets: new Map(), manualRelationLabelAnchors: new Map(),
  });
  const labels = [...presentation.nodeLabels.values()];
  const routeLengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0)).sort((a, b) => a - b);
  const crossings = crossingDetails(presentation.routedEdges, presentation.relationLabels);
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).length;
  let labelOverlap = 0;
  for (let left = 0; left < labels.length; left += 1) for (let right = left + 1; right < labels.length; right += 1) {
    if (Math.abs(labels[left].x - labels[right].x) < (labels[left].width + labels[right].width) / 2
      && Math.abs(labels[left].y - labels[right].y) < (labels[left].height + labels[right].height) / 2) labelOverlap += 1;
  }
  const hopLengths = scope.edges.map((edge) => Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y)).sort((a, b) => a - b);
  const x = scope.nodes.map((node) => positions[node.id].x); const y = scope.nodes.map((node) => positions[node.id].y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const feasibility = localNodeFeasibility(scope.nodes, positions);
  const score = crossings.length * 100000 + labelRouteHits * 30000 + labelNear20 * 5000 + labelOverlap * 10000 + feasibility.overlapPairs * 5000000
    + (hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.45).length * 5000)
    + (routeLengths[Math.floor(routeLengths.length / 2)] ?? 0) * 2 + Math.max(...routeLengths, 0) + (extent[0] + extent[1]) * 0.20;
  return {
    score,
    scope: { nodeIds: scope.nodes.map((node) => node.id), edgeIds: scope.edges.map((edge) => edge.id), radius: scope.radius, focusIds: scope.focusIds },
    metrics: { crossings: crossings.length, labelRouteHits, labelNear20, labelOverlap, overlapPairs: feasibility.overlapPairs, routeMedian: routeLengths[Math.floor(routeLengths.length / 2)] ?? 0, routeMax: Math.max(...routeLengths, 0), extent },
  };
}
function compareSignatureMaps(before, after) {
  const ids = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...ids].filter((id) => before?.[id] !== after?.[id]).sort(compareId);
}
function routeDecisionMap(trace, pass) {
  return new Map((trace?.routeDecisions ?? [])
    .filter((decision) => decision.pass === pass)
    .map((decision) => [decision.edgeId, decision]));
}
function dependencyTraceDiff(before, after, movedNodeId) {
  const changedRouteIds = compareSignatureMaps(before.routes, after.routes);
  const changedRelationLabelIds = compareSignatureMaps(before.relationLabels, after.relationLabels);
  const changedNodeLabelIds = compareSignatureMaps(before.nodeLabels, after.nodeLabels);
  const incidentRouteIds = edges.filter((edge) => edge.sourceId === movedNodeId || edge.targetId === movedNodeId).map((edge) => edge.id);
  const incidentRouteSet = new Set(incidentRouteIds);
  const remoteRouteIds = changedRouteIds.filter((id) => !incidentRouteSet.has(id));
  const beforeDecisions = routeDecisionMap(before, "first");
  const afterDecisions = routeDecisionMap(after, "first");
  const decisionIds = new Set([...beforeDecisions.keys(), ...afterDecisions.keys()]);
  const changedDecisionIds = [...decisionIds].filter((id) => JSON.stringify(beforeDecisions.get(id)) !== JSON.stringify(afterDecisions.get(id))).sort(compareId);
  const routeOrderBefore = [...beforeDecisions.values()].sort((left, right) => left.processingIndex - right.processingIndex).map((decision) => decision.edgeId);
  const routeOrderAfter = [...afterDecisions.values()].sort((left, right) => left.processingIndex - right.processingIndex).map((decision) => decision.edgeId);
  const routeOrderChanged = JSON.stringify(routeOrderBefore) !== JSON.stringify(routeOrderAfter);
  const processingIndexById = new Map([...afterDecisions.values()].map((decision) => [decision.edgeId, decision.processingIndex]));
  const dirtyRouteIds = [...new Set([...changedRouteIds, ...changedDecisionIds])].sort(compareId);
  const earliestChangedProcessingIndex = Math.min(...dirtyRouteIds.map((id) => processingIndexById.get(id) ?? Infinity));
  const changedAfterEarliest = Number.isFinite(earliestChangedProcessingIndex)
    ? changedRouteIds.filter((id) => (processingIndexById.get(id) ?? -Infinity) > earliestChangedProcessingIndex).length
    : 0;
  return {
    movedNodeId,
    changedRouteIds,
    dirtyRouteIds,
    incidentRouteIds,
    remoteRouteIds,
    changedRelationLabelIds,
    changedNodeLabelIds,
    feedbackChanged: before.feedbackApplied !== after.feedbackApplied,
    changedDecisionIds,
    routeOrderChanged,
    earliestChangedProcessingIndex: Number.isFinite(earliestChangedProcessingIndex) ? earliestChangedProcessingIndex : null,
    changedAfterEarliest,
  };
}
function recordDependencyTrace(stats, diff, scoreBefore, scoreAfter, accepted) {
  stats.candidates += 1;
  stats.routeChangedCandidates += diff.changedRouteIds.length > 0 ? 1 : 0;
  stats.remoteRoutePropagationCandidates += diff.remoteRouteIds.length > 0 ? 1 : 0;
  stats.maxChangedRoutes = Math.max(stats.maxChangedRoutes, diff.changedRouteIds.length);
  stats.maxRemoteRoutes = Math.max(stats.maxRemoteRoutes, diff.remoteRouteIds.length);
  stats.maxChangedRelationLabels = Math.max(stats.maxChangedRelationLabels, diff.changedRelationLabelIds.length);
  stats.maxChangedNodeLabels = Math.max(stats.maxChangedNodeLabels, diff.changedNodeLabelIds.length);
  stats.feedbackChangedCount += diff.feedbackChanged ? 1 : 0;
  stats.routeOrderChangedCount += diff.routeOrderChanged ? 1 : 0;
  stats.routeDecisionChangedCandidates += diff.changedDecisionIds.length > 0 ? 1 : 0;
  stats.totalChangedRoutes += diff.changedRouteIds.length;
  stats.totalRemoteRoutes += diff.remoteRouteIds.length;
  stats.totalChangedRelationLabels += diff.changedRelationLabelIds.length;
  stats.totalChangedNodeLabels += diff.changedNodeLabelIds.length;
  if (accepted) {
    stats.acceptedCandidates += 1;
    stats.acceptedRemotePropagationCandidates += diff.remoteRouteIds.length > 0 ? 1 : 0;
    stats.acceptedTotalRemoteRoutes += diff.remoteRouteIds.length;
    stats.acceptedMaxRemoteRoutes = Math.max(stats.acceptedMaxRemoteRoutes, diff.remoteRouteIds.length);
  }
  if (stats.examples.length < 24) stats.examples.push({ ...diff, scoreBefore, scoreAfter, accepted });
}
function canonicalPrefixBeforeDirtyRoute(beforeTrace, afterTrace, dirtyRouteIds) {
  const dirty = new Set(dirtyRouteIds);
  const beforeOrder = (beforeTrace?.routeDecisions ?? [])
    .filter((decision) => decision.pass === "first")
    .sort((left, right) => left.processingIndex - right.processingIndex);
  const afterOrder = (afterTrace?.routeDecisions ?? [])
    .filter((decision) => decision.pass === "first")
    .sort((left, right) => left.processingIndex - right.processingIndex);
  const prefix = [];
  for (let index = 0; index < Math.min(beforeOrder.length, afterOrder.length); index += 1) {
    const beforeId = beforeOrder[index].edgeId;
    const afterId = afterOrder[index].edgeId;
    if (beforeId !== afterId || dirty.has(beforeId) || dirty.has(afterId)) break;
    prefix.push(beforeId);
  }
  return prefix;
}
function comparePresentationOutputs(full, incremental) {
  const routeMismatches = compareSignatureMaps(full.presentationTrace?.routes, incremental.presentationTrace?.routes);
  const relationLabelMismatches = compareSignatureMaps(full.presentationTrace?.relationLabels, incremental.presentationTrace?.relationLabels);
  const nodeLabelMismatches = compareSignatureMaps(full.presentationTrace?.nodeLabels, incremental.presentationTrace?.nodeLabels);
  const feedbackMismatch = full.presentationTrace?.feedbackApplied !== incremental.presentationTrace?.feedbackApplied;
  const metricMismatch = JSON.stringify(full) !== JSON.stringify(incremental);
  const passSnapshot = (trace, pass) => trace?.passes?.find((snapshot) => snapshot.pass === pass);
  const firstPass = passSnapshot(full.presentationTrace, "first");
  const incrementalFirstPass = passSnapshot(incremental.presentationTrace, "first");
  const feedbackPass = passSnapshot(full.presentationTrace, "feedback");
  const incrementalFeedbackPass = passSnapshot(incremental.presentationTrace, "feedback");
  const firstPassRouteMismatches = compareSignatureMaps(firstPass?.routes, incrementalFirstPass?.routes);
  const feedbackPassRouteMismatches = compareSignatureMaps(feedbackPass?.routes, incrementalFeedbackPass?.routes);
  const firstMismatchStage = firstPassRouteMismatches.length > 0 ? "first-route-geometry"
    : feedbackPassRouteMismatches.length > 0 ? "feedback-route-geometry"
      : routeMismatches.length > 0 ? "route-geometry"
        : relationLabelMismatches.length > 0 ? "relation-label-geometry"
          : nodeLabelMismatches.length > 0 ? "node-label-geometry"
            : feedbackMismatch ? "feedback-state"
              : metricMismatch ? "derived-metrics" : null;
  return {
    exact: firstMismatchStage === null,
    firstMismatchStage,
    routeMismatches,
    relationLabelMismatches,
    nodeLabelMismatches,
    firstPassRouteMismatches,
    feedbackPassRouteMismatches,
    feedbackMismatch,
    metricMismatch,
  };
}
function incrementalPresentationMetrics(positions, previousMetrics, prefixEdgeIds) {
  const previousRoutes = new Map(previousMetrics.presentationArtifacts.routedEdges.map((route) => [route.id, route]));
  return derivePresentationMetrics(positions, {
    replayPrefix: { edgeIds: prefixEdgeIds, routes: previousRoutes },
  });
}
function presentationMetrics(positions) {
  const positionKey = positionsKey(positions);
  const stage = profile.stages[activeProfileStage] ??= { presentationCalls: 0, fullPresentationEvaluations: 0, presentationMs: 0, presentationCacheHits: 0 };
  profile.presentationCalls += 1;
  stage.presentationCalls += 1;
  if (presentationCache.has(positionKey)) {
    profile.duplicatePositionCalls += 1;
    profile.presentationCacheHits += 1;
    stage.presentationCacheHits += 1;
    return presentationCache.get(positionKey);
  }
  const startedAt = performance.now();
  const result = derivePresentationMetrics(positions);
  const elapsed = performance.now() - startedAt;
  profile.fullPresentationEvaluations += 1;
  stage.fullPresentationEvaluations += 1;
  presentationCache.set(positionKey, result);
  profile.presentationMs += elapsed;
  stage.presentationMs += elapsed;
  return result;
}
function startProfileStage(name) {
  activeProfileStage = name;
  profile.stages[name] ??= { presentationCalls: 0, fullPresentationEvaluations: 0, presentationMs: 0, presentationCacheHits: 0 };
  profile.stages[name].startedAt = performance.now();
}
function finishProfileStage(name) {
  const stage = profile.stages[name];
  stage.wallMs = performance.now() - stage.startedAt;
  delete stage.startedAt;
}
function chordCrossings(order) {
  const index = new Map(order.map((id, position) => [id, position])); let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]; const second = edges[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    const [a, b] = [index.get(first.sourceId), index.get(first.targetId)].sort((x, y) => x - y);
    const [c, d] = [index.get(second.sourceId), index.get(second.targetId)].sort((x, y) => x - y);
    if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) crossings += 1;
  }
  return crossings;
}
function permutations(items, visitor) {
  const working = items.slice(); let count = 0;
  function visit(index) {
    if (index === working.length) { count += 1; visitor(working.slice()); return; }
    for (let next = index; next < working.length; next += 1) { [working[index], working[next]] = [working[next], working[index]]; visit(index + 1); [working[index], working[next]] = [working[next], working[index]]; }
  }
  visit(0); return count;
}
function exactCircularOrders(ids, maximum = 12) {
  const anchor = ids[0]; const rest = ids.slice(1); const orders = []; let best = Infinity;
  const evaluated = permutations(rest, (permutation) => {
    if (compareId(permutation[0], permutation.at(-1)) > 0) return;
    const order = [anchor, ...permutation]; const crossings = chordCrossings(order);
    if (crossings < best) { best = crossings; orders.length = 0; }
    if (crossings === best && orders.length < maximum) orders.push({ order, chordCrossings: crossings });
  });
  return { mode: "EXACT_CIRCULAR_ORDER", evaluated, bestChordCrossings: best, orders };
}
function seededRandom(seed) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; }; }
function heuristicCircularOrders(ids, seeds = 8, rounds = 80) {
  const results = []; let evaluated = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const random = seededRandom(9001 + seed); const order = ids.slice();
    for (let index = order.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
    let current = chordCrossings(order); evaluated += 1;
    for (let round = 0; round < rounds; round += 1) {
      const left = Math.floor(random() * order.length); const right = Math.floor(random() * order.length);
      if (left === right) continue;
      [order[left], order[right]] = [order[right], order[left]];
      const candidate = chordCrossings(order); evaluated += 1;
      if (candidate <= current || random() < 0.025) current = candidate;
      else [order[left], order[right]] = [order[right], order[left]];
    }
    results.push({ order: order.slice(), chordCrossings: current });
  }
  results.sort((left, right) => left.chordCrossings - right.chordCrossings || left.order.join("\0").localeCompare(right.order.join("\0")));
  return { mode: "HEURISTIC_CIRCULAR_ORDER", evaluated, bestChordCrossings: results[0]?.chordCrossings ?? Infinity, orders: results.slice(0, 12) };
}
function ellipsePositions(order, { aspect, scale, phase }) {
  const minimumNeighborGap = INITIAL_ENTITY_CLEARANCE * 1.8;
  const radiusY = Math.max(160, minimumNeighborGap / (2 * Math.sin(Math.PI / Math.max(3, order.length))) * scale);
  const radiusX = radiusY * aspect;
  return Object.fromEntries(order.map((id, index) => {
    const angle = phase + 2 * Math.PI * index / order.length;
    return [id, { x: radiusX + radiusX * Math.cos(angle), y: radiusY + radiusY * Math.sin(angle) }];
  }));
}
function straightCrossingsForPositions(positions) {
  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const first = edges[left]; const second = edges[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    if (segmentIntersection(positions[first.sourceId], positions[first.targetId], positions[second.sourceId], positions[second.targetId])) crossings += 1;
  }
  return crossings;
}
function gridSlots(nodeCount) {
  const columns = Math.max(3, Math.ceil(Math.sqrt(nodeCount * 1.35)));
  const rows = Math.max(2, Math.ceil(nodeCount / columns));
  const horizontalGap = Math.max(196, INITIAL_ENTITY_CLEARANCE * 2.55);
  const verticalGap = Math.max(164, INITIAL_ENTITY_CLEARANCE * 2.15);
  return Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns) * horizontalGap,
    y: Math.floor(index / columns) * verticalGap,
  }));
}
function makeGridState(ids, random) {
  const slots = gridSlots(ids.length); const assignment = [...ids];
  for (let index = assignment.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [assignment[index], assignment[swap]] = [assignment[swap], assignment[index]]; }
  const occupied = assignment.map((id, index) => ({ id, slot: index }));
  return { slots, occupied };
}
function positionsFromGridState(state) {
  return Object.fromEntries(state.occupied.map(({ id, slot }) => [id, state.slots[slot]]));
}
function cloneGridState(state) { return { slots: state.slots, occupied: state.occupied.map((entry) => ({ ...entry })) }; }
function mutateGridState(state, random) {
  const next = cloneGridState(state); const used = new Set(next.occupied.map((entry) => entry.slot));
  const left = Math.floor(random() * next.occupied.length);
  const available = next.slots.map((_, slot) => slot).filter((slot) => !used.has(slot));
  if (available.length > 0 && random() < 0.42) next.occupied[left].slot = available[Math.floor(random() * available.length)];
  else {
    const right = Math.floor(random() * next.occupied.length);
    [next.occupied[left].slot, next.occupied[right].slot] = [next.occupied[right].slot, next.occupied[left].slot];
  }
  return next;
}
function cheapGridObjective(positions) {
  const crossings = straightCrossingsForPositions(positions);
  const hopLengths = edges.map((edge) => Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y));
  const shortEdges = hopLengths.filter((length) => length < INITIAL_ENTITY_CLEARANCE * 1.65).length;
  const longEdgePenalty = hopLengths.reduce((sum, length) => sum + Math.max(0, length - 480) ** 2, 0);
  return crossings * 1000000 + shortEdges * 20000 + longEdgePenalty;
}
function genericGridSearch(ids, seeds = 16, rounds = 1200) {
  const finalists = []; let evaluated = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const random = seededRandom(17041 + seed); let current = makeGridState(ids, random); let currentScore = cheapGridObjective(positionsFromGridState(current)); evaluated += 1;
    let best = current; let bestScore = currentScore;
    for (let round = 0; round < rounds; round += 1) {
      const candidate = mutateGridState(current, random); const candidateScore = cheapGridObjective(positionsFromGridState(candidate)); evaluated += 1;
      const temperature = Math.max(0.001, 0.04 * (1 - round / rounds));
      if (candidateScore <= currentScore || random() < temperature) { current = candidate; currentScore = candidateScore; }
      if (candidateScore < bestScore) { best = candidate; bestScore = candidateScore; }
    }
    finalists.push({ positions: positionsFromGridState(best), cheapScore: bestScore, straightCrossings: straightCrossingsForPositions(positionsFromGridState(best)) });
  }
  const unique = new Map();
  for (const candidate of finalists) {
    const key = Object.entries(candidate.positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x},${point.y}`).join("|");
    if (!unique.has(key) || unique.get(key).cheapScore > candidate.cheapScore) unique.set(key, candidate);
  }
  return { mode: "GRID_SWAP_AND_EMPTY_SLOT_SEARCH", evaluated, seeds, rounds, finalists: [...unique.values()].sort((left, right) => left.cheapScore - right.cheapScore).slice(0, 12) };
}
function fullPresentationScore(metrics) {
  return metrics.score + metrics.overlapPairs * 5000000;
}
function mutatePresentationPositions(positions, ids, random) {
  const next = clonePositions(positions);
  const id = ids[Math.floor(random() * ids.length)];
  const step = [24, 36, 48, 64, 80, 96][Math.floor(random() * 6)];
  const direction = Math.floor(random() * 8);
  const angle = direction * Math.PI / 4;
  next[id].x += Math.cos(angle) * step;
  next[id].y += Math.sin(angle) * step;
  return next;
}
function refineForPresentation(finalists, ids, seedsPerFinalist = 3, rounds = 90) {
  const refined = []; let evaluated = 0;
  for (let finalistIndex = 0; finalistIndex < finalists.length; finalistIndex += 1) {
    for (let seed = 0; seed < seedsPerFinalist; seed += 1) {
      const random = seededRandom(26003 + finalistIndex * 131 + seed);
      let current = clonePositions(finalists[finalistIndex].positions);
      let currentMetrics = presentationMetrics(current); evaluated += 1;
      let currentScore = fullPresentationScore(currentMetrics);
      let best = current; let bestMetrics = currentMetrics; let bestScore = currentScore;
      for (let round = 0; round < rounds; round += 1) {
        const candidate = mutatePresentationPositions(current, ids, random);
        const metrics = presentationMetrics(candidate); evaluated += 1;
        const score = fullPresentationScore(metrics);
        const temperature = Math.max(0.001, 0.025 * (1 - round / rounds));
        if (score <= currentScore || random() < temperature) { current = candidate; currentMetrics = metrics; currentScore = score; }
        if (score < bestScore) { best = candidate; bestMetrics = metrics; bestScore = score; }
      }
      refined.push({ positions: best, structuralCrossings: finalists[finalistIndex].straightCrossings, presentationScore: bestScore, metrics: bestMetrics });
    }
  }
  const unique = new Map();
  for (const candidate of refined) {
    const key = Object.entries(candidate.positions).sort(([left], [right]) => compareId(left, right)).map(([id, point]) => `${id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|");
    if (!unique.has(key) || unique.get(key).presentationScore > candidate.presentationScore) unique.set(key, candidate);
  }
  return { mode: "PRODUCT_PRESENTATION_LOCAL_REPAIR", evaluated, seedsPerFinalist, rounds, finalists: [...unique.values()].sort((left, right) => left.presentationScore - right.presentationScore).slice(0, 12) };
}
function hopDistanceMap(positions) {
  return new Map(edges.map((edge) => [edge.id, Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y)]));
}
function constrainedRelaxationScore(metrics, positions, referencePositions) {
  const presentationDefectScore = metrics.crossings * 100000 + metrics.labelRouteHits * 30000 + metrics.labelNear20 * 5000 + metrics.labelOverlap * 10000 + metrics.overlapPairs * 5000000;
  if (relaxationAdmission !== "soft-defect" && presentationDefectScore > 0) return Infinity;
  const referenceHops = hopDistanceMap(referencePositions);
  let localityPenalty = 0; let edgeLengthPenalty = 0;
  for (const edge of edges) {
    const length = Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y);
    const ratio = length / Math.max(1, referenceHops.get(edge.id));
    localityPenalty += Math.max(0, 0.80 - ratio) ** 2 + Math.max(0, ratio - 1.20) ** 2;
    edgeLengthPenalty += Math.max(0, length - 480) ** 2 / 480;
  }
  const corridorObjectivePenalty = relaxationObjective === "label-corridor" ? metrics.labelCorridorDeficit * labelCorridorWeight : 0;
  return presentationDefectScore + corridorObjectivePenalty + metrics.usableSpanPenalty * 6 + metrics.routeMedian * 2 + metrics.routeMax + (metrics.extent[0] + metrics.extent[1]) * 0.20
    + localityPenalty * 9000 + edgeLengthPenalty;
}
function constrainedRelaxationLowerBound(positions) {
  const endpointAttachmentBound = 96;
  const directLengths = edges.map((edge) => Math.max(0, Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y) - endpointAttachmentBound)).sort((left, right) => left - right);
  const localityFree = 0;
  const edgeLengthLowerBound = edges.reduce((sum, edge) => {
    const direct = Math.max(0, Math.hypot(positions[edge.sourceId].x - positions[edge.targetId].x, positions[edge.sourceId].y - positions[edge.targetId].y) - endpointAttachmentBound);
    return sum + Math.max(0, direct - 480) ** 2 / 480;
  }, 0);
  const extentX = Math.max(...Object.values(positions).map((point) => point.x)) - Math.min(...Object.values(positions).map((point) => point.x));
  const extentY = Math.max(...Object.values(positions).map((point) => point.y)) - Math.min(...Object.values(positions).map((point) => point.y));
  // Every routed polyline is at least as long as its attachment-point chord.
  // The conservative 96-unit subtraction bounds the two Node-boundary
  // offsets from the Node-center chord used by the relaxation score. The
  // median and maximum therefore have these lower bounds; locality and
  // usable-span terms are non-negative and can be omitted.
  return directLengths[Math.floor(directLengths.length / 2)] * 2 + Math.max(...directLengths) + (extentX + extentY) * 0.20 + localityFree + edgeLengthLowerBound;
}
function constrainedPostStructuralRelaxation(startPositions, ids, maxDisplacement = 48) {
  const inputPositions = clonePositions(startPositions);
  const referencePositions = quantizePositions(startPositions, relaxationLatticeStep); let current = clonePositions(referencePositions);
  let currentMetrics = presentationMetrics(current); let currentScore = constrainedRelaxationScore(currentMetrics, current, referencePositions);
  let best = current; let bestMetrics = currentMetrics; let bestScore = currentScore; let evaluated = 1; let acceptedMoves = 0;
  const dependencyTraceStats = relaxationDependencyTraceEnabled ? {
    candidates: 0,
    routeChangedCandidates: 0,
    remoteRoutePropagationCandidates: 0,
    maxChangedRoutes: 0,
    maxRemoteRoutes: 0,
    maxChangedRelationLabels: 0,
    maxChangedNodeLabels: 0,
    feedbackChangedCount: 0,
    routeOrderChangedCount: 0,
    routeDecisionChangedCandidates: 0,
    totalChangedRoutes: 0,
    totalRemoteRoutes: 0,
    totalChangedRelationLabels: 0,
    totalChangedNodeLabels: 0,
    acceptedCandidates: 0,
    acceptedRemotePropagationCandidates: 0,
    acceptedTotalRemoteRoutes: 0,
    acceptedMaxRemoteRoutes: 0,
    incrementalAudit: {
      candidates: 0,
      exactMatches: 0,
      mismatches: 0,
      firstMismatchStages: {},
      prefixRoutesRequested: 0,
      suffixRoutesReplayed: 0,
      relationLabelsReused: 0,
      relationLabelsReplayed: 0,
      nodeLabelsReused: 0,
      nodeLabelsReplayed: 0,
      fullEvaluationMs: 0,
      incrementalEvaluationMs: 0,
      firstMismatchExample: null,
      examples: [],
    },
    examples: [],
  } : null;
  const rawCandidateKeys = relaxationLatticeProbe ? new Set() : null;
  const configuredCandidateKeys = relaxationLatticeProbe ? new Set() : null;
  const hypotheticalKeys = relaxationLatticeProbe ? new Map([1, 2, 4].map((step) => [step, new Set()])) : null;
  let candidateRequests = 0; let fractionalCandidateRequests = 0;
  const localApproximationCache = new Map();
  const approximationStats = relaxationApproximationMode === "local-screen" ? {
    mode: relaxationApproximationMode,
    audit: relaxationApproximationAudit,
    considered: 0,
    predictedImprovement: 0,
    fullValidated: 0,
    skippedFullValidation: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    scopeNodeCount: 0,
    scopeEdgeCount: 0,
    localEvaluations: 0,
    localCacheHits: 0,
    localEvaluationMs: 0,
    scopeSamples: [],
  } : null;
  const localApproximationFor = (positions, focusIds) => {
    if (!approximationStats) return null;
    const key = `${positionsKey(positions)}|${focusIds.slice().sort(compareId).join("\u0000")}`;
    if (localApproximationCache.has(key)) {
      approximationStats.localCacheHits += 1;
      return localApproximationCache.get(key);
    }
    const startedAt = performance.now();
    localApproximationCache.set(key, deriveLocalPresentationApproximation(positions, focusIds));
    approximationStats.localEvaluations += 1;
    approximationStats.localEvaluationMs += performance.now() - startedAt;
    return localApproximationCache.get(key);
  };
  const cheapScreenStats = relaxationCheapScreenProbe ? { considered: 0, rejected: 0, overlapRejected: 0, lowerBoundRejected: 0, lowerBoundViolations: 0, lowerBoundSamples: [], acceptedTrace: [] } : null;
  const directions = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
  const steps = relaxationStepMode === "omit-fine" ? [18, 9] : [18, 9, 6];
  const pressureWeight = (id) => (currentMetrics.pressureReasons?.[id] ?? []).reduce((total, reason) => total
    + (reason.includes("route-label-hit") ? 5 : reason.includes("route-crossing") ? 4 : reason.includes("route-label-near") ? 3 : reason.includes("node-label-route-near") ? 2 : 1), 0);
  const moveTargetLimit = relaxationMoveMode === "cluster" ? relaxationClusterLimit : relaxationPairLimit;
  let moveTargetIds = relaxationMoveMode === "pair" || relaxationMoveMode === "cluster"
    ? ids.slice().sort((left, right) => pressureWeight(right) - pressureWeight(left) || compareId(left, right)).slice(0, Math.min(moveTargetLimit, ids.length))
    : ids.slice();
  if (relaxationTargetLimit) moveTargetIds = moveTargetIds.slice().sort((left, right) => pressureWeight(right) - pressureWeight(left) || compareId(left, right)).slice(0, Math.min(relaxationTargetLimit, moveTargetIds.length));
  const movePlans = [];
  if (relaxationMoveMode === "pair") {
    for (let left = 0; left < moveTargetIds.length; left += 1) for (let right = left + 1; right < moveTargetIds.length; right += 1) {
      for (const step of [18, 9]) for (const angle of directions) for (const sameDirection of [true, false]) {
        movePlans.push({ ids: [moveTargetIds[left], moveTargetIds[right]], step, angles: [angle, sameDirection ? angle : angle + Math.PI] });
      }
    }
  } else if (relaxationMoveMode === "cluster") {
    for (let first = 0; first < moveTargetIds.length; first += 1) for (let second = first + 1; second < moveTargetIds.length; second += 1) for (let third = second + 1; third < moveTargetIds.length; third += 1) {
      for (const step of [18, 9]) for (const angle of directions) for (const oppositeIndex of [-1, 0, 1, 2]) {
        movePlans.push({
          ids: [moveTargetIds[first], moveTargetIds[second], moveTargetIds[third]],
          step,
          angles: [0, 1, 2].map((index) => index === oppositeIndex ? angle + Math.PI : angle),
        });
      }
    }
  } else {
    for (const id of moveTargetIds) for (const step of steps) for (const angle of directions) movePlans.push({ ids: [id], step, angles: [angle] });
  }
  for (const plan of movePlans) {
      const id = plan.ids[0];
      const rawCandidate = clonePositions(current);
      plan.ids.forEach((planId, index) => {
        const angle = plan.angles[index];
        rawCandidate[planId].x += Math.cos(angle) * plan.step;
        rawCandidate[planId].y += Math.sin(angle) * plan.step;
      });
      candidateRequests += 1;
      if (relaxationLatticeProbe) {
        rawCandidateKeys.add(positionsKey(rawCandidate));
        if (Object.values(rawCandidate).some((point) => !Number.isInteger(point.x) || !Number.isInteger(point.y))) fractionalCandidateRequests += 1;
        for (const [probeStep, keys] of hypotheticalKeys) keys.add(positionsKey(quantizePositions(rawCandidate, probeStep)));
      }
      const candidate = quantizePositions(rawCandidate, relaxationLatticeStep);
      if (relaxationLatticeProbe) configuredCandidateKeys.add(positionsKey(candidate));
      if (plan.ids.some((planId) => Math.hypot(candidate[planId].x - referencePositions[planId].x, candidate[planId].y - referencePositions[planId].y) > maxDisplacement)) continue;
      // Soft-defect admission may cross presentation defects, but node-body
      // overlap remains a hard safety boundary for every move mode.
      if (nodeFeasibility(candidate).overlapPairs > 0) continue;
      const cheapOverlap = false;
      const cheapLowerBound = relaxationCheapScreenProbe ? constrainedRelaxationLowerBound(candidate) : null;
      const lowerBoundReject = cheapLowerBound !== null && Number.isFinite(currentScore) && cheapLowerBound >= currentScore;
      if (cheapScreenStats) {
        cheapScreenStats.considered += 1;
        if (cheapLowerBound !== null && cheapScreenStats.lowerBoundSamples.length < 12) cheapScreenStats.lowerBoundSamples.push(cheapLowerBound);
      }
      if (relaxationCheapScreenEnabled && (cheapOverlap || lowerBoundReject)) {
        if (cheapScreenStats) {
          cheapScreenStats.rejected += 1;
          if (cheapOverlap) cheapScreenStats.overlapRejected += 1;
          if (lowerBoundReject) cheapScreenStats.lowerBoundRejected += 1;
        }
        continue;
      }
      const approximateCurrent = localApproximationFor(current, plan.ids);
      const approximateCandidate = localApproximationFor(candidate, plan.ids);
      const approximationPredictsImprovement = !approximationStats || approximateCandidate.score < approximateCurrent.score;
      if (approximationStats) {
        approximationStats.considered += 1;
        approximationStats.scopeNodeCount += approximateCandidate.scope.nodeIds.length;
        approximationStats.scopeEdgeCount += approximateCandidate.scope.edgeIds.length;
        if (approximationStats.scopeSamples.length < 12) approximationStats.scopeSamples.push({ focusIds: plan.ids, nodeIds: approximateCandidate.scope.nodeIds, edgeIds: approximateCandidate.scope.edgeIds, radius: approximateCandidate.scope.radius });
        if (approximateCandidate.score < approximateCurrent.score) approximationStats.predictedImprovement += 1;
      }
      if (approximationStats && !approximationPredictsImprovement && !relaxationApproximationAudit) {
        approximationStats.skippedFullValidation += 1;
        continue;
      }
      const fullStartedAt = performance.now();
      const metrics = presentationMetrics(candidate); evaluated += 1;
      const fullElapsed = performance.now() - fullStartedAt;
      const score = constrainedRelaxationScore(metrics, candidate, referencePositions);
      if (approximationStats) {
        approximationStats.fullValidated += 1;
        const exactImprovement = score < currentScore;
        if (approximationPredictsImprovement && exactImprovement) approximationStats.truePositive += 1;
        else if (approximationPredictsImprovement && !exactImprovement) approximationStats.falsePositive += 1;
        else if (!approximationPredictsImprovement && exactImprovement) approximationStats.falseNegative += 1;
        else approximationStats.trueNegative += 1;
      }
      if (dependencyTraceStats) recordDependencyTrace(
        dependencyTraceStats,
        dependencyTraceDiff(currentMetrics.presentationTrace, metrics.presentationTrace, id),
        currentScore,
        score,
        score < currentScore,
      );
      if (dependencyTraceStats) {
        const diff = dependencyTraceDiff(currentMetrics.presentationTrace, metrics.presentationTrace, id);
        const prefixEdgeIds = canonicalPrefixBeforeDirtyRoute(currentMetrics.presentationTrace, metrics.presentationTrace, diff.dirtyRouteIds);
        const incrementalStartedAt = performance.now();
        const incrementalMetrics = incrementalPresentationMetrics(candidate, currentMetrics, prefixEdgeIds);
        const incrementalElapsed = performance.now() - incrementalStartedAt;
        const equivalence = comparePresentationOutputs(metrics, incrementalMetrics);
        const audit = dependencyTraceStats.incrementalAudit;
        audit.candidates += 1;
        audit.prefixRoutesRequested += prefixEdgeIds.length;
        audit.suffixRoutesReplayed += Math.max(0, edges.length - prefixEdgeIds.length);
        audit.relationLabelsReplayed += edges.length;
        audit.nodeLabelsReplayed += graph.nodes.length;
        audit.fullEvaluationMs += fullElapsed;
        audit.incrementalEvaluationMs += incrementalElapsed;
        if (equivalence.exact) audit.exactMatches += 1;
        else {
          audit.mismatches += 1;
          audit.firstMismatchStages[equivalence.firstMismatchStage] = (audit.firstMismatchStages[equivalence.firstMismatchStage] ?? 0) + 1;
          if (audit.firstMismatchExample === null) audit.firstMismatchExample = {
            movedNodeId: id,
            prefixRoutesRequested: prefixEdgeIds.length,
            prefixEdgeIds,
            replayedPrefix: incrementalMetrics.presentationTrace.replayedPrefix,
            earliestDirtyProcessingIndex: diff.earliestChangedProcessingIndex,
            currentToFullChangedRouteIds: diff.changedRouteIds,
            currentToFullDirtyRouteIds: diff.dirtyRouteIds,
            routeMismatches: equivalence.routeMismatches,
            relationLabelMismatches: equivalence.relationLabelMismatches,
            nodeLabelMismatches: equivalence.nodeLabelMismatches,
          };
        }
        if (audit.examples.length < 12) audit.examples.push({
          movedNodeId: id,
          prefixRoutesRequested: prefixEdgeIds.length,
          earliestDirtyProcessingIndex: diff.earliestChangedProcessingIndex,
          exact: equivalence.exact,
          firstMismatchStage: equivalence.firstMismatchStage,
          routeMismatches: equivalence.routeMismatches,
          relationLabelMismatches: equivalence.relationLabelMismatches,
          nodeLabelMismatches: equivalence.nodeLabelMismatches,
        });
      }
      if (cheapScreenStats && cheapLowerBound !== null && Number.isFinite(score) && cheapLowerBound > score + 1e-9) cheapScreenStats.lowerBoundViolations += 1;
      if (score < currentScore) {
        if (cheapScreenStats) cheapScreenStats.acceptedTrace.push({ nodeIds: plan.ids, step: plan.step, angles: plan.angles, scoreBefore: currentScore, scoreAfter: score });
        current = candidate; currentMetrics = metrics; currentScore = score; acceptedMoves += 1;
      }
      if (score < bestScore) { best = candidate; bestMetrics = metrics; bestScore = score; }
  }
  const movedNodeIds = ids.filter((id) => Math.hypot(best[id].x - referencePositions[id].x, best[id].y - referencePositions[id].y) > 1e-9);
  const inputFractionalCoordinates = Object.values(inputPositions).flatMap((point) => [point.x, point.y]).filter((value) => !Number.isInteger(value)).length;
  const inputQuantizationMaxDelta = Math.max(0, ...Object.keys(inputPositions).map((id) => Math.hypot(referencePositions[id].x - inputPositions[id].x, referencePositions[id].y - inputPositions[id].y)));
  return {
    mode: relaxationMoveMode === "cluster"
      ? "POST_STRUCTURAL_SMALL_CLUSTER_RELAXATION"
      : relaxationMoveMode === "pair" ? "POST_STRUCTURAL_COUPLED_MOVE_RELAXATION"
      : relaxationAdmission === "soft-defect" ? "POST_STRUCTURAL_SOFT_DEFECT_RELAXATION" : "POST_STRUCTURAL_CONSTRAINED_RELAXATION",
    admission: relaxationAdmission, moveMode: relaxationMoveMode, moveTargetIds, targetLimit: relaxationTargetLimit, pairLimit: relaxationPairLimit, clusterLimit: relaxationClusterLimit, evaluated, acceptedMoves, targetNodeIds: ids.slice(), movedNodeIds, maxDisplacement,
    lattice: {
      configuredStep: relaxationLatticeStep,
      probeEnabled: relaxationLatticeProbe,
      inputFractionalCoordinates,
      inputQuantizationMaxDelta,
      candidateRequests,
      fractionalCandidateRequests: relaxationLatticeProbe ? fractionalCandidateRequests : null,
      uniqueRawCandidateStates: relaxationLatticeProbe ? rawCandidateKeys.size : null,
      rawDuplicateRequests: relaxationLatticeProbe ? candidateRequests - rawCandidateKeys.size : null,
      uniqueConfiguredCandidateStates: relaxationLatticeProbe ? configuredCandidateKeys.size : null,
      configuredDuplicateRequests: relaxationLatticeProbe ? candidateRequests - configuredCandidateKeys.size : null,
      hypotheticalUniqueStates: relaxationLatticeProbe ? Object.fromEntries([...hypotheticalKeys].map(([step, keys]) => [step, keys.size])) : null,
    },
    inputPositions, startPositions: referencePositions, startMetrics: presentationMetrics(referencePositions), positions: best, metrics: bestMetrics, score: bestScore, changed: acceptedMoves > 0,
    cheapScreen: cheapScreenStats ? { mode: relaxationCheapScreenMode, ...cheapScreenStats } : null,
    approximation: approximationStats ? {
      ...approximationStats,
      averageScopeNodeCount: approximationStats.scopeNodeCount / Math.max(1, approximationStats.considered),
      averageScopeEdgeCount: approximationStats.scopeEdgeCount / Math.max(1, approximationStats.considered),
      averageLocalEvaluationMs: approximationStats.localEvaluationMs / Math.max(1, approximationStats.localEvaluations),
      localCacheEntries: localApproximationCache.size,
    } : null,
    ...(dependencyTraceStats ? { dependencyTrace: dependencyTraceStats } : {}),
  };
}
function derivePressureNeighborhood(metrics, positions) {
  const pressureNodeIds = metrics.pressureNodeIds ?? [];
  const expanded = new Set(pressureNodeIds);
  const radius = INITIAL_ENTITY_CLEARANCE * 2.5;
  for (const id of pressureNodeIds) {
    const origin = positions[id];
    for (const node of graph.nodes) {
      const point = positions[node.id];
      if (Math.hypot(point.x - origin.x, point.y - origin.y) <= radius) expanded.add(node.id);
    }
  }
  return { pressureNodeIds, expandedNodeIds: [...expanded].sort(compareId), radius };
}
function genericSearch() {
  const ids = graph.nodes.map((node) => node.id).sort(compareId);
  startProfileStage("stage1-structural");
  const orderSearch = ids.length <= 9 ? exactCircularOrders(ids) : heuristicCircularOrders(ids);
  const variants = [
    { aspect: 1.18, scale: 1, phase: -Math.PI / 2 },
    { aspect: 1.30, scale: 1, phase: -Math.PI / 2 },
    { aspect: 1.30, scale: 1.1, phase: -Math.PI / 2 },
    { aspect: 1.18, scale: 1.1, phase: -Math.PI / 2 },
  ];
  const candidates = [];
  for (const orderResult of orderSearch.orders) for (const variant of variants) {
    const positions = ellipsePositions(orderResult.order, variant); const metrics = presentationMetrics(positions);
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "circular-order", order: orderResult.order, chordCrossings: orderResult.chordCrossings, structuralCrossings: orderResult.chordCrossings, variant, positions, metrics, eligible });
  }
  const gridSearch = genericGridSearch(ids);
  for (const finalist of gridSearch.finalists) {
    const metrics = presentationMetrics(finalist.positions);
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "grid-structural", ...finalist, structuralCrossings: finalist.straightCrossings, positions: clonePositions(finalist.positions), metrics, eligible });
  }
  finishProfileStage("stage1-structural");
  // Only zero-crossing structural states enter the expensive Product-aware repair.
  // This keeps the diagnostic bounded while making label safety decisive once the
  // structural feasibility condition has already been found.
  const zeroCrossingFinalists = gridSearch.finalists.filter((finalist) => finalist.straightCrossings === 0).slice(0, Math.max(1, presentationFinalistLimit));
  startProfileStage("stage2-presentation-and-relaxation");
  const presentationRepair = refineForPresentation(zeroCrossingFinalists, ids, 1, presentationRepairRounds);
  for (const finalist of presentationRepair.finalists) {
    const metrics = finalist.metrics;
    const eligible = metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: "grid-structural-presentation-repair", ...finalist, positions: clonePositions(finalist.positions), metrics, eligible });
  }
  candidates.sort((left, right) => Number(right.structuralCrossings === 0) - Number(left.structuralCrossings === 0) || Number(right.eligible) - Number(left.eligible) || left.metrics.score - right.metrics.score);
  const structuralSelected = candidates.find((candidate) => candidate.structuralCrossings === 0) ?? null;
  const pressureNeighborhood = structuralSelected ? derivePressureNeighborhood(structuralSelected.metrics, structuralSelected.positions) : { pressureNodeIds: [], expandedNodeIds: [], radius: INITIAL_ENTITY_CLEARANCE * 2.5 };
  const pressureTargetingFallback = relaxationTargeting === "pressure" && pressureNeighborhood.expandedNodeIds.length === 0 ? "NO_PRESSURE_SIGNAL_FALLBACK_TO_FULL_NODE" : null;
  const relaxationNodeIds = relaxationTargeting === "pressure" && !pressureTargetingFallback ? pressureNeighborhood.expandedNodeIds : ids;
  const postStructuralRelaxation = structuralSelected ? constrainedPostStructuralRelaxation(structuralSelected.positions, relaxationNodeIds, relaxationMaxDisplacement) : null;
  if (postStructuralRelaxation) {
    const metrics = postStructuralRelaxation.metrics;
    const eligible = metrics.crossings === 0 && metrics.overlapPairs === 0 && metrics.labelRouteHits === 0 && metrics.labelOverlap === 0 && metrics.labelNear20 === 0;
    candidates.push({ family: relaxationMoveMode === "cluster"
      ? "post-structural-small-cluster-relaxation"
      : relaxationMoveMode === "pair" ? "post-structural-coupled-move-relaxation"
      : relaxationAdmission === "soft-defect" ? "post-structural-soft-defect-relaxation" : "post-structural-constrained-relaxation", structuralCrossings: 0, positions: clonePositions(postStructuralRelaxation.positions), metrics, eligible, relaxation: postStructuralRelaxation });
  }
  candidates.sort((left, right) => Number(right.structuralCrossings === 0) - Number(left.structuralCrossings === 0) || Number(right.eligible) - Number(left.eligible) || left.metrics.score - right.metrics.score);
  const zeroCrossingStructural = gridSearch.finalists.filter((finalist) => finalist.straightCrossings === 0).length;
  const zeroCrossingPresentation = candidates.filter((candidate) => candidate.structuralCrossings === 0 && candidate.metrics.crossings === 0).length;
  const structuralCandidates = candidates.filter((candidate) => Number.isFinite(candidate.structuralCrossings));
  const minimumStructuralCrossings = structuralCandidates.length > 0 ? Math.min(...structuralCandidates.map((candidate) => candidate.structuralCrossings)) : null;
  const boundedFallback = minimumStructuralCrossings === null ? [] : structuralCandidates.filter((candidate) => candidate.structuralCrossings === minimumStructuralCrossings);
  finishProfileStage("stage2-presentation-and-relaxation");
  return { orderSearch, gridSearch, presentationRepair, postStructuralRelaxation, relaxationTargeting, relaxationTargetLimit, presentationRepairRounds, relaxationStepMode, relaxationLatticeStep, relaxationCheapScreenMode, pressureTargetingFallback, pressureNeighborhood, presentationEvaluations: candidates.length, zeroCrossingStructural, zeroCrossingPresentation, minimumStructuralCrossings, boundedFallbackCount: boundedFallback.length, candidates, selected: candidates[0] ?? null };
}
function complexityProbe() {
  return [9, 10, 12, 16, 25].map((nodeCount) => ({
    nodeCount,
    mode: nodeCount <= 9 ? "exact circular order + grid structural search" : "heuristic circular order + grid structural search",
    exactCircularPermutations: nodeCount <= 9 ? `${Math.floor(factorial(nodeCount - 1) / 2)}` : "not attempted",
    gridBudget: "16 seeded starts × 1200 swap/move evaluations = ≤19216 cheap geometry evaluations",
    presentationRepairBudget: "up to 8 zero-crossing grid finalists × 1 start × 24 rounds = ≤200 Product presentation evaluations",
  }));
}
function factorial(value) { let result = 1; for (let factor = 2; factor <= value; factor += 1) result *= factor; return result; }

const startedAt = performance.now();
const search = genericSearch();
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-GENERIC-CROSSING-SEARCH-v1",
  diagnosticOnly: true,
  fixturePath,
  graph: { nodes: graph.nodes.length, edges: edges.length },
  hardBoundary: { rule: "INITIAL_ENTITY_CLEARANCE", value: INITIAL_ENTITY_CLEARANCE, overlapRejected: true },
  strategy: "exact circular-order search for n<=9; deterministic heuristic circular-order search above that; Product presentation evaluates only finalists",
  elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  profile: {
    presentationCalls: profile.presentationCalls,
    fullPresentationEvaluations: profile.fullPresentationEvaluations,
    duplicatePositionCalls: profile.duplicatePositionCalls,
    presentationCacheHits: profile.presentationCacheHits,
    presentationMs: Math.round(profile.presentationMs * 100) / 100,
    averagePresentationMs: Math.round(profile.presentationMs / Math.max(1, profile.fullPresentationEvaluations) * 100) / 100,
    stages: Object.fromEntries(Object.entries(profile.stages).map(([name, stage]) => [name, {
      presentationCalls: stage.presentationCalls,
      fullPresentationEvaluations: stage.fullPresentationEvaluations,
      presentationCacheHits: stage.presentationCacheHits,
      presentationMs: Math.round(stage.presentationMs * 100) / 100,
      averagePresentationMs: Math.round(stage.presentationMs / Math.max(1, stage.fullPresentationEvaluations) * 100) / 100,
      wallMs: Math.round(stage.wallMs * 100) / 100,
    }])),
  },
  searchBudget: { presentationFinalistLimit, presentationRepairRounds, relaxationAdmission, relaxationMoveMode, relaxationObjective, relaxationPairLimit, relaxationClusterLimit, relaxationMaxDisplacement, relaxationTargetLimit, relaxationStepMode, relaxationApproximationMode, relaxationApproximationAudit, labelCorridorMargin, labelCorridorWeight, relaxationLatticeStep, relaxationLatticeProbe, relaxationCheapScreenMode },
  scaling: complexityProbe(),
  ...search,
}, null, 2));
