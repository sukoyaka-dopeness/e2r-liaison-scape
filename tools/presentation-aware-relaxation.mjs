import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { fitGraphView, placeNodeLabel, routeSamplesHaveLabelCollision } from "../src/viewport.ts";
import { INITIAL_ENTITY_CLEARANCE } from "../src/initial-entity-placement.ts";

const fixturePath = "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json";
const dataset = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const graph = buildEntityGraph(dataset);
const edges = graph.edges.map((edge) => ({
  ...edge,
  label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
}));
const start = {
  armstrong: { x: -59.717, y: 357.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159 },
  nasa: { x: 145.196, y: 337.480 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const emptyState = {
  previousNodeLabelPlacements: new Map(),
  previousRelationLabelPlacements: new Map(),
  manualNodeLabelOffsets: new Map(),
  manualRelationLabelAnchors: new Map(),
};

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
}

function distanceToRect(point, rect) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0);
  const dy = Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0);
  return Math.hypot(dx, dy);
}

function segmentIntersectionDetails(a, b, c, d) {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = c.x - a.x; const qpy = c.y - a.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  const firstLength = Math.hypot(rx, ry); const secondLength = Math.hypot(sx, sy);
  const sine = Math.min(1, Math.abs(denominator) / Math.max(1e-9, firstLength * secondLength));
  return { x: a.x + t * rx, y: a.y + t * ry, angleDegrees: Math.asin(sine) * 180 / Math.PI };
}

function crossingDiagnostics(routes, relationLabels) {
  const labels = [...relationLabels.values()];
  const diagnostics = [];
  for (let left = 0; left < routes.length; left += 1) for (let right = left + 1; right < routes.length; right += 1) {
    const first = routes[left]; const second = routes[right];
    if ([first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
    let detail = null;
    for (let a = 1; a < first.samples.length && !detail; a += 1) for (let b = 1; b < second.samples.length && !detail; b += 1) {
      detail = segmentIntersectionDetails(first.samples[a - 1], first.samples[a], second.samples[b - 1], second.samples[b]);
    }
    if (detail) diagnostics.push({
      routes: [first.id, second.id],
      ...detail,
      relationLabelNear: labels.some((label) => distanceToRect(detail, label) < 24),
    });
  }
  return diagnostics;
}

function nodeFeasibility(positions) {
  let overlapPairs = 0;
  let minimumSeparation = Infinity;
  for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
    const first = positions[graph.nodes[left].id]; const second = positions[graph.nodes[right].id];
    const separation = Math.hypot(first.x - second.x, first.y - second.y);
    minimumSeparation = Math.min(minimumSeparation, separation);
    if (Math.abs(first.x - second.x) < INITIAL_ENTITY_CLEARANCE && Math.abs(first.y - second.y) < INITIAL_ENTITY_CLEARANCE) overlapPairs += 1;
  }
  return { overlapPairs, minimumSeparation };
}

function presentationMetrics(positions) {
  const provisional = graph.nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]), [],
  ));
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {},
    provisionalNodeLabels: provisional, ...emptyState,
  });
  const lengths = presentation.routedEdges.map((route) => route.samples.slice(1).reduce(
    (total, point, index) => total + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0,
  )).sort((a, b) => a - b);
  const labels = [...presentation.nodeLabels.values()];
  const labelRouteHits = presentation.routedEdges.filter((route) => routeSamplesHaveLabelCollision(route.samples, labels)).length;
  const labelNear20 = presentation.routedEdges.filter((route) => route.samples.some((point) => labels.some((label) => distanceToRect(point, label) < 20))).length;
  const routeSupports = presentation.routedEdges.map((route) => {
    const label = presentation.relationLabels.get(route.id);
    const width = label?.width ?? 48;
    const length = route.samples.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - route.samples[index].x, point.y - route.samples[index].y), 0);
    const first = route.samples[0] ?? { x: 0, y: 0 };
    const last = route.samples[route.samples.length - 1] ?? first;
    const directLength = Math.hypot(last.x - first.x, last.y - first.y);
    const straightness = directLength / Math.max(1, length);
    const horizontalSpan = Math.abs(last.x - first.x);
    const horizontalRatio = horizontalSpan / Math.max(1, directLength);
    const shallowAngleTarget = horizontalRatio >= 0.55;
    const usableSpan = shallowAngleTarget ? horizontalSpan * straightness : null;
    const minimumUsableSpan = shallowAngleTarget ? width + 48 : null;
    return {
      id: route.id,
      length,
      width,
      horizontalSpan,
      horizontalRatio,
      shallowAngleTarget,
      straightness,
      usableSpan,
      minimumUsableSpan,
      usableShortfall: shallowAngleTarget ? Math.max(0, minimumUsableSpan - usableSpan) : 0,
    };
  });
  const usableSpanPenalty = routeSupports.reduce((total, route) => total + (route.usableShortfall / 18) ** 2 * 160, 0);
  let labelOverlap = 0;
  for (let left = 0; left < labels.length; left += 1) for (let right = left + 1; right < labels.length; right += 1) {
    if (Math.abs(labels[left].x - labels[right].x) < (labels[left].width + labels[right].width) / 2
      && Math.abs(labels[left].y - labels[right].y) < (labels[left].height + labels[right].height) / 2) labelOverlap += 1;
  }
  const x = Object.values(positions).map((point) => point.x); const y = Object.values(positions).map((point) => point.y);
  const extent = [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)];
  const aspectRatio = extent[1] === 0 ? Infinity : extent[0] / extent[1];
  const aspectPenalty = Math.max(0, 1.2 - aspectRatio) ** 2 * 10000;
  const fitScale = fitGraphView(Object.values(positions), 800, 500).scale;
  const feasibility = nodeFeasibility(positions);
  const crossingDetails = crossingDiagnostics(presentation.routedEdges, presentation.relationLabels);
  const crossings = crossingDetails.length;
  const routeMedian = lengths[Math.floor(lengths.length / 2)]; const routeMax = Math.max(...lengths);
  const score = crossings * 9000 + labelRouteHits * 6000 + labelNear20 * 700 + labelOverlap * 3000
    + routeMedian * 1.5 + routeMax * 0.5 + (extent[0] + extent[1]) * 0.35;
  return { score, ...feasibility, extent, aspectRatio, aspectPenalty, fitScale, routeMedian, routeMax, crossings, crossingDetails, labelRouteHits, labelNear20, labelOverlap, usableSpanPenalty, routeSupports };
}

const baselineAdjacency = new Map(graph.edges.map((edge) => {
  const source = start[edge.sourceId]; const target = start[edge.targetId];
  return [edge.id, Math.hypot(source.x - target.x, source.y - target.y)];
}));
const ADJACENCY_BAND_PENALTY = 500;

function adjacencyMetrics(positions) {
  const rows = graph.edges.map((edge) => {
    const source = positions[edge.sourceId]; const target = positions[edge.targetId];
    const distance = Math.hypot(source.x - target.x, source.y - target.y);
    const baseline = baselineAdjacency.get(edge.id);
    const lower = Math.max(INITIAL_ENTITY_CLEARANCE, baseline * 0.8);
    const upper = baseline * 1.1;
    return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, distance, baseline, lower, upper };
  });
  const outsideBand = rows.filter((row) => row.distance < row.lower || row.distance > row.upper);
  const stretch = rows.filter((row) => row.distance > row.upper);
  const penalty = rows.reduce((total, row) => {
    const excess = row.distance < row.lower ? row.lower - row.distance : Math.max(0, row.distance - row.upper);
    return total + (excess / 24) ** 2 * (row.distance > row.upper ? 2.5 : 1.5) * ADJACENCY_BAND_PENALTY;
  }, 0);
  const distances = rows.map((row) => row.distance).sort((a, b) => a - b);
  return {
    rows,
    outsideBand: outsideBand.length,
    stretched: stretch.length,
    median: distances[Math.floor(distances.length / 2)],
    minimum: Math.min(...distances),
    maximum: Math.max(...distances),
    penalty,
  };
}

function topologyScore(metrics, positions) {
  return metrics.score + adjacencyMetrics(positions).penalty;
}

function improve(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [24, 12, 6];
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (const node of graph.nodes) {
      for (const step of steps) for (const direction of directions) {
        const candidate = clonePositions(current);
        candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
        const feasibility = nodeFeasibility(candidate);
        if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
        const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
        if (candidateMetrics.score < metrics.score) { current = candidate; metrics = candidateMetrics; accepted += 1; }
      }
    }
  }
  return { positions: current, metrics, evaluations, rejectedInfeasible, accepted, sweeps: 2, steps, directionCount: directions.length };
}

function improveTopology(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [24, 12, 6];
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (const node of graph.nodes) {
      for (const step of steps) for (const direction of directions) {
        const candidate = clonePositions(current);
        candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
        const feasibility = nodeFeasibility(candidate);
        if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
        const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
        if (topologyScore(candidateMetrics, candidate) < topologyScore(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
      }
    }
  }
  return { positions: current, metrics, adjacency: adjacencyMetrics(current), evaluations, rejectedInfeasible, accepted, sweeps: 2, steps, directionCount: directions.length };
}

function improveFactor(startPositions, objective, targetIds) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let rejectedBound = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [18, 9, 6];
  for (let sweep = 0; sweep < 1; sweep += 1) {
    for (const id of targetIds) for (const step of steps) for (const direction of directions) {
      const candidate = clonePositions(current);
      candidate[id] = { x: candidate[id].x + direction.x * step, y: candidate[id].y + direction.y * step };
      const displacement = Math.hypot(candidate[id].x - startPositions[id].x, candidate[id].y - startPositions[id].y);
      if (displacement > 96) { rejectedBound += 1; continue; }
      const feasibility = nodeFeasibility(candidate);
      if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
      const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
      if (objective(candidateMetrics, candidate) < objective(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
    }
  }
  return { positions: current, metrics, evaluations, rejectedInfeasible, rejectedBound, accepted, sweeps: 1, steps, directionCount: directions.length, maxNodeDisplacement: 96 };
}

function relativeAdjacencyPenalty(positions, referencePositions) {
  return graph.edges.reduce((total, edge) => {
    const referenceSource = referencePositions[edge.sourceId];
    const referenceTarget = referencePositions[edge.targetId];
    const source = positions[edge.sourceId];
    const target = positions[edge.targetId];
    const referenceDistance = Math.hypot(referenceSource.x - referenceTarget.x, referenceSource.y - referenceTarget.y);
    const distance = Math.hypot(source.x - target.x, source.y - target.y);
    const lower = Math.max(INITIAL_ENTITY_CLEARANCE, referenceDistance * 0.8);
    const upper = referenceDistance * 1.12;
    const excess = distance < lower ? lower - distance : Math.max(0, distance - upper);
    return total + (excess / 24) ** 2 * 700;
  }, 0);
}

function improveVerticalCompaction(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  let evaluations = 1; let rejectedInfeasible = 0; let rejectedBound = 0; let accepted = 0;
  const reference = clonePositions(startPositions);
  const steps = [18, 9, 6];
  for (const node of graph.nodes) for (const step of steps) for (const sign of [-1, 1]) {
    const candidate = clonePositions(current);
    candidate[node.id] = { x: candidate[node.id].x, y: candidate[node.id].y + sign * step };
    const displacement = Math.abs(candidate[node.id].y - startPositions[node.id].y);
    if (displacement > 72) { rejectedBound += 1; continue; }
    const feasibility = nodeFeasibility(candidate);
    if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
    const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
    const topologyPenalty = relativeAdjacencyPenalty(candidate, reference);
    const currentTopologyPenalty = relativeAdjacencyPenalty(current, reference);
    const candidateObjective = candidateMetrics.score + candidateMetrics.usableSpanPenalty * 1.2 + topologyPenalty * 1.5;
    const currentObjective = metrics.score + metrics.usableSpanPenalty * 1.2 + currentTopologyPenalty * 1.5;
    if (candidateObjective < currentObjective) { current = candidate; metrics = candidateMetrics; accepted += 1; }
  }
  return { positions: current, metrics, evaluations, rejectedInfeasible, rejectedBound, accepted, sweeps: 1, steps, axis: "y-only", maxNodeDisplacement: 72 };
}

function improveCrossingAfterCompaction(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  const reference = clonePositions(startPositions);
  const initialUsableSpanPenalty = metrics.usableSpanPenalty;
  let evaluations = 1; let rejectedInfeasible = 0; let rejectedConstraint = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [12, 6];
  const objective = (candidateMetrics, candidate) => candidateMetrics.crossings * 9000
    + candidateMetrics.labelRouteHits * 6000
    + candidateMetrics.labelOverlap * 3000
    + candidateMetrics.labelNear20 * 700
    + candidateMetrics.usableSpanPenalty * 1.2
    + relativeAdjacencyPenalty(candidate, reference) * 1.5
    + candidateMetrics.routeMedian * 1.5 + candidateMetrics.routeMax * 0.5
    + (candidateMetrics.extent[0] + candidateMetrics.extent[1]) * 0.35;
  for (const node of graph.nodes) for (const step of steps) for (const direction of directions) {
    const candidate = clonePositions(current);
    candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
    if (Math.hypot(candidate[node.id].x - startPositions[node.id].x, candidate[node.id].y - startPositions[node.id].y) > 48) { rejectedConstraint += 1; continue; }
    const feasibility = nodeFeasibility(candidate);
    if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
    const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
    if (candidateMetrics.labelRouteHits > 0 || candidateMetrics.labelOverlap > 0
      || candidateMetrics.usableSpanPenalty > initialUsableSpanPenalty * 1.25 + 64) { rejectedConstraint += 1; continue; }
    if (objective(candidateMetrics, candidate) < objective(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
  }
  return { positions: current, metrics, evaluations, rejectedInfeasible, rejectedConstraint, accepted, sweeps: 1, steps, maxNodeDisplacement: 48 };
}

function principalAxisHorizontalRecomposition(startPositions) {
  const points = Object.values(startPositions);
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  centroid.x /= points.length;
  centroid.y /= points.length;
  const covariance = points.reduce((sum, point) => {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    return { xx: sum.xx + dx * dx, xy: sum.xy + dx * dy, yy: sum.yy + dy * dy };
  }, { xx: 0, xy: 0, yy: 0 });
  const axisAngle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
  const cos = Math.cos(-axisAngle);
  const sin = Math.sin(-axisAngle);
  const positions = Object.fromEntries(Object.entries(startPositions).map(([id, point]) => {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    return [id, { x: centroid.x + dx * cos - dy * sin, y: centroid.y + dx * sin + dy * cos }];
  }));
  return {
    positions,
    metrics: presentationMetrics(positions),
    transform: "centroid-preserving principal-axis rotation",
    axisAngleRadians: axisAngle,
    source: "crossing-after-compaction-v1",
  };
}

function improveGlobalLabelAccommodation(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  const reference = clonePositions(startPositions);
  let evaluations = 1; let rejectedInfeasible = 0; let rejectedConstraint = 0; let accepted = 0;
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 },
  ];
  const steps = [12, 6];
  const objective = (candidateMetrics, candidate) => candidateMetrics.crossings * 9000
    + candidateMetrics.labelRouteHits * 6000
    + candidateMetrics.labelOverlap * 3000
    + candidateMetrics.labelNear20 * 700
    + candidateMetrics.usableSpanPenalty * 2
    + relativeAdjacencyPenalty(candidate, reference) * 2
    + candidateMetrics.routeMedian * 1.5 + candidateMetrics.routeMax * 0.5
    + (candidateMetrics.extent[0] + candidateMetrics.extent[1]) * 0.25;
  for (const node of graph.nodes) for (const step of steps) for (const direction of directions) {
    const candidate = clonePositions(current);
    candidate[node.id] = { x: candidate[node.id].x + direction.x * step, y: candidate[node.id].y + direction.y * step };
    if (Math.hypot(candidate[node.id].x - startPositions[node.id].x, candidate[node.id].y - startPositions[node.id].y) > 48) { rejectedConstraint += 1; continue; }
    const feasibility = nodeFeasibility(candidate);
    if (feasibility.overlapPairs > 0) { rejectedInfeasible += 1; continue; }
    const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
    if (candidateMetrics.labelRouteHits > 0 || candidateMetrics.labelOverlap > 0) { rejectedConstraint += 1; continue; }
    if (objective(candidateMetrics, candidate) < objective(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
  }
  return {
    positions: current,
    metrics,
    source: "global-horizontal-topology-v1",
    evaluations,
    rejectedInfeasible,
    rejectedConstraint,
    accepted,
    steps,
    maxNodeDisplacement: 48,
  };
}

function referenceAdjacencyMetrics(positions, referencePositions) {
  const rows = graph.edges.map((edge) => {
    const referenceSource = referencePositions[edge.sourceId];
    const referenceTarget = referencePositions[edge.targetId];
    const source = positions[edge.sourceId];
    const target = positions[edge.targetId];
    const referenceDistance = Math.hypot(referenceSource.x - referenceTarget.x, referenceSource.y - referenceTarget.y);
    const distance = Math.hypot(source.x - target.x, source.y - target.y);
    return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, referenceDistance, distance, ratio: distance / Math.max(1, referenceDistance) };
  });
  return {
    rows,
    minimumRatio: Math.min(...rows.map((row) => row.ratio)),
    maximumRatio: Math.max(...rows.map((row) => row.ratio)),
    outsideBroadBand: rows.filter((row) => row.ratio < 0.7 || row.ratio > 1.35).length,
  };
}

function improveCrossingByAssignment(startPositions) {
  let current = clonePositions(startPositions);
  let metrics = presentationMetrics(current);
  const reference = clonePositions(startPositions);
  const initialUsableSpanPenalty = metrics.usableSpanPenalty;
  let evaluations = 1; let rejectedConstraint = 0; let accepted = 0;
  const objective = (candidateMetrics, candidate) => candidateMetrics.crossings * 100000
    + candidateMetrics.labelRouteHits * 20000
    + candidateMetrics.labelOverlap * 10000
    + candidateMetrics.labelNear20 * 3000
    + candidateMetrics.usableSpanPenalty * 3
    + relativeAdjacencyPenalty(candidate, reference) * 4
    + candidateMetrics.routeMedian * 2 + candidateMetrics.routeMax
    + (candidateMetrics.extent[0] + candidateMetrics.extent[1]) * 0.1;
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (let left = 0; left < graph.nodes.length; left += 1) for (let right = left + 1; right < graph.nodes.length; right += 1) {
      const firstId = graph.nodes[left].id; const secondId = graph.nodes[right].id;
      const candidate = clonePositions(current);
      [candidate[firstId], candidate[secondId]] = [candidate[secondId], candidate[firstId]];
      const candidateMetrics = presentationMetrics(candidate); evaluations += 1;
      const adjacency = referenceAdjacencyMetrics(candidate, reference);
      if (candidateMetrics.labelRouteHits > 0 || candidateMetrics.labelOverlap > 0 || candidateMetrics.labelNear20 > 0
        || candidateMetrics.usableSpanPenalty > initialUsableSpanPenalty * 2 + 64
        || adjacency.outsideBroadBand > 0) { rejectedConstraint += 1; continue; }
      if (objective(candidateMetrics, candidate) < objective(metrics, current)) { current = candidate; metrics = candidateMetrics; accepted += 1; }
    }
  }
  return {
    positions: current,
    metrics,
    source: "safe-vertical-compaction-v1",
    structuralVariable: "Node-to-position assignment on a fixed coordinate scaffold",
    adjacency: referenceAdjacencyMetrics(current, reference),
    evaluations,
    rejectedConstraint,
    accepted,
    sweeps: 2,
    preservedScaffold: true,
  };
}

function rebalanceVerticalSpaceWithoutHorizontalCompression(startPositions) {
  const yValues = Object.values(startPositions).map((point) => point.y);
  const centerY = yValues.reduce((total, value) => total + value, 0) / yValues.length;
  const initialMetrics = presentationMetrics(startPositions);
  const reference = clonePositions(startPositions);
  const attempts = [];
  for (const factor of [0.9, 0.85, 0.8, 0.75]) {
    const positions = Object.fromEntries(Object.entries(startPositions).map(([id, point]) => [id, {
      x: point.x,
      y: centerY + (point.y - centerY) * factor,
    }]));
    const metrics = presentationMetrics(positions);
    const adjacency = referenceAdjacencyMetrics(positions, reference);
    const eligible = metrics.overlapPairs === 0
      && metrics.labelRouteHits === 0
      && metrics.labelOverlap === 0
      && metrics.labelNear20 === 0
      && metrics.usableSpanPenalty <= initialMetrics.usableSpanPenalty * 2 + 64
      && adjacency.outsideBroadBand === 0;
    attempts.push({ factor, positions, metrics, adjacency, eligible });
  }
  const selected = attempts.filter((attempt) => attempt.eligible).at(-1) ?? attempts[0];
  return {
    ...selected,
    source: "safe-vertical-compaction-v1",
    structuralVariable: "uniform vertical-space rebalance around graph centroid; x coordinates fixed",
    attempts: attempts.map(({ factor, metrics, adjacency, eligible }) => ({ factor, metrics, adjacency, eligible })),
    preservedHorizontalCoordinates: true,
  };
}

const baseline = presentationMetrics(start);
const baselineWithAdjacency = { metrics: baseline, adjacency: adjacencyMetrics(start) };
const baselineRouteSupports = new Map(baseline.routeSupports.map((route) => [route.id, route]));
function balancedLengthPenalty(metrics) {
  return metrics.routeSupports.reduce((total, route) => {
    const baselineRoute = baselineRouteSupports.get(route.id) ?? route;
    if (!route.shallowAngleTarget || !baselineRoute.shallowAngleTarget) return total;
    const preferredLower = Math.max(route.minimumUsableSpan, baselineRoute.usableSpan * 0.76);
    const preferredUpper = Math.max(route.minimumUsableSpan, baselineRoute.usableSpan * 1.18);
    const shortfall = Math.max(0, preferredLower - route.usableSpan);
    const excess = Math.max(0, route.usableSpan - preferredUpper);
    return total + (shortfall / 18) ** 2 * 160 + (excess / 32) ** 2 * 60;
  }, 0);
}
const result = improve(start);
const topologyAware = improveTopology(start);
const labelLengthAware = improveFactor(start, (metrics) => metrics.score + metrics.usableSpanPenalty * 2, graph.nodes.map(({ id }) => id));
const horizontalCanvasAware = improveFactor(start, (metrics) => metrics.score + metrics.aspectPenalty, graph.nodes.map(({ id }) => id));
const balancedEdgeLength = improveFactor(start, (metrics) => metrics.score + metrics.aspectPenalty + balancedLengthPenalty(metrics), graph.nodes.map(({ id }) => id));
const safeVerticalCompaction = improveVerticalCompaction(balancedEdgeLength.positions);
const crossingAfterCompaction = improveCrossingAfterCompaction(safeVerticalCompaction.positions);
const globalHorizontalTopology = principalAxisHorizontalRecomposition(crossingAfterCompaction.positions);
const topologyAwareHorizontalRecomposition = improveGlobalLabelAccommodation(globalHorizontalTopology.positions);
const crossingAwareReassignment = improveCrossingByAssignment(safeVerticalCompaction.positions);
const verticalSpaceRebalance = rebalanceVerticalSpaceWithoutHorizontalCompression(safeVerticalCompaction.positions);
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-PRESENTATION-TOPOLOGY-RELAXATION-v1",
  diagnosticOnly: true,
  hardBoundary: { rule: "INITIAL_ENTITY_CLEARANCE", value: INITIAL_ENTITY_CLEARANCE, overlapRejected: true },
  adjacencyRegularization: {
    reference: "local-search-v1-plus",
    preferredBand: { lowerRatio: 0.8, upperRatio: 1.1, minimumAbsolute: INITIAL_ENTITY_CLEARANCE },
    penaltyWeight: ADJACENCY_BAND_PENALTY,
    purpose: "diagnostic bounded stretch control; not a Product threshold",
  },
  baseline: { positions: start, ...baselineWithAdjacency },
  presentationAware: result,
  topologyAware,
  labelLengthAware,
  horizontalCanvasAware,
  balancedEdgeLength,
  safeVerticalCompaction,
  crossingAfterCompaction,
  globalHorizontalTopology,
  topologyAwareHorizontalRecomposition,
  crossingAwareReassignment,
  verticalSpaceRebalance,
}, null, 2));
