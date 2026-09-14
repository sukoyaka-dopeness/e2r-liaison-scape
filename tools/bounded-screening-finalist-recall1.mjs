import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";

const root = process.cwd();
const outputDir = path.join(root, "experimental", "bounded-screening-finalist-recall1");
const OPERATION_TIMEOUT_MS = 20_000;
const budgets = [2, 3, 4, 6];
const arms = ["direct-current", "structural-native-v3", "frontier-adaptive-12", "structural-native-discrete"];
const discreteFixtureIds = new Set(["lighthouse-en", "apollo-en", "dense-k7-7"]);
const fixtures = [
  { id: "lighthouse-en", family: "canonical-mixed-self-loop", path: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json" },
  { id: "lighthouse-ja", family: "canonical-mixed-self-loop-label", path: "../e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json" },
  { id: "apollo-en", family: "canonical-mixed", path: "../e2r-spec/examples/apollo-11-mission.en.e2r.json" },
  { id: "apollo-ja", family: "canonical-label-sensitive", path: "../e2r-spec/examples/apollo-11-mission.ja.e2r.json" },
  { id: "titanic-en", family: "canonical-mixed-parallel", path: "../e2r-spec/examples/titanic-final-voyage.en.e2r.json" },
  { id: "titanic-ja", family: "canonical-label-sensitive-parallel", path: "../e2r-spec/examples/titanic-final-voyage.ja.e2r.json" },
  { id: "dense-k7-7", family: "dense", path: "synthetic:k7-7" },
  { id: "dense-k6-8", family: "dense-rectangular", path: "synthetic:k6-8" },
  { id: "dense-k8-8", family: "dense-large", path: "synthetic:k8-8" },
  { id: "dense-k5-9", family: "dense-imbalanced", path: "synthetic:k5-9" },
  { id: "dense-k7-7-minus-one", family: "dense-perturbed", path: "synthetic:k7-7-minus-one" },
  { id: "apollo-spacing-control", family: "dense-product-control", path: "experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-control.en.e2r.json" },
];

const weightProfiles = [
  { id: "balanced", crossing: 5, separation: 2, labelSpan: 2, corridor: 1.5, angular: 1, extent: 1, edge: 0.5 },
  { id: "label-aware", crossing: 4, separation: 2, labelSpan: 3, corridor: 2, angular: 1, extent: 1, edge: 0.5 },
  { id: "capacity-aware", crossing: 4, separation: 2, labelSpan: 2, corridor: 2, angular: 2, extent: 1, edge: 0.5 },
  { id: "fit-aware", crossing: 4, separation: 2, labelSpan: 2, corridor: 1, angular: 1, extent: 2.5, edge: 1 },
  { id: "topology-first", crossing: 8, separation: 2, labelSpan: 1, corridor: 1, angular: 0.5, extent: 0.5, edge: 0.5 },
  { id: "presentation-risk", crossing: 3, separation: 2, labelSpan: 3, corridor: 2.5, angular: 2, extent: 1.5, edge: 1 },
];

function compareId(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function median(values) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil((ordered.length - 1) * fraction))];
}
function hashPositions(positions) {
  return createHash("sha256").update(JSON.stringify(Object.entries(positions ?? {}).sort(([a], [b]) => compareId(a, b)))).digest("hex").slice(0, 16);
}
function syntheticBipartiteDataset(leftSize, rightSize) {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return {
    version: "1.0",
    entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })),
    events: [],
    relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))),
  };
}
function loadDataset(fixture) {
  const match = /^synthetic:k(\d+)-(\d+)(-minus-one)?$/.exec(fixture.path);
  if (match) {
    const dataset = syntheticBipartiteDataset(Number(match[1]), Number(match[2]));
    if (match[3]) dataset.relations = dataset.relations.slice(1);
    return dataset;
  }
  return JSON.parse(fs.readFileSync(path.resolve(root, fixture.path), "utf8"));
}
function fixtureGraph(fixture) {
  const dataset = loadDataset(fixture);
  const graph = buildEntityGraph(dataset);
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" })),
  };
}
function textWidth(value) {
  return Array.from(String(value ?? "")).reduce((width, character) => width + (/^[\u0000-\u00ff]$/.test(character) ? 7 : 13), 0) + 20;
}
function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (denominator <= 1e-9) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator, 0, 1);
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}
function familyClass(value) {
  if (/circular|ring/i.test(value)) return "circular";
  if (/grid|cell|discrete/i.test(value)) return "grid-discrete";
  if (/stress|spoke/i.test(value)) return "stress-spoke";
  if (/current/i.test(value)) return "current";
  return value.replace(/^structural-(?:adaptive-)?frontier-\d+-/, "").replace(/-v\d+.*$/, "");
}
function angularGapPressure(graph, positions) {
  const anglesByNode = new Map(graph.nodes.map(({ id }) => [id, []]));
  const multiplicityByPair = new Map();
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const key = [edge.sourceId, edge.targetId].sort(compareId).join("\u0000");
    multiplicityByPair.set(key, (multiplicityByPair.get(key) ?? 0) + 1);
  }
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const source = positions[edge.sourceId]; const target = positions[edge.targetId];
    if (!source || !target) continue;
    const weight = multiplicityByPair.get([edge.sourceId, edge.targetId].sort(compareId).join("\u0000")) ?? 1;
    anglesByNode.get(edge.sourceId)?.push({ angle: Math.atan2(target.y - source.y, target.x - source.x), weight });
    anglesByNode.get(edge.targetId)?.push({ angle: Math.atan2(source.y - target.y, source.x - target.x), weight });
  }
  let angularPressure = 0; let minimumGapDegrees = 360;
  for (const angles of anglesByNode.values()) {
    if (angles.length < 2) continue;
    const ordered = angles.slice().sort((left, right) => left.angle - right.angle);
    for (let index = 0; index < ordered.length; index += 1) {
      const next = ordered[(index + 1) % ordered.length];
      const gap = ((next.angle - ordered[index].angle + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI;
      minimumGapDegrees = Math.min(minimumGapDegrees, gap);
      const demand = 14 + Math.min(32, (ordered[index].weight + next.weight - 2) * 6);
      angularPressure += Math.max(0, demand - gap);
    }
  }
  return { angularPressure, minimumGapDegrees };
}
function featureVector(graph, candidate) {
  const positions = candidate.positions;
  const points = Object.values(positions);
  const xs = points.map(({ x }) => x); const ys = points.map(({ y }) => y);
  const width = points.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const height = points.length ? Math.max(...ys) - Math.min(...ys) : 0;
  let minimumSeparation = Infinity;
  for (let left = 0; left < points.length; left += 1) for (let right = left + 1; right < points.length; right += 1) {
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y));
  }
  if (!Number.isFinite(minimumSeparation)) minimumSeparation = 0;
  const edgeLengths = []; let labelSpanDeficit = 0; let coarseCorridorPressure = 0;
  let parallelPressure = 0; const pairCounts = new Map(); const selfLoopOwners = new Map();
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) {
      selfLoopOwners.set(edge.sourceId, (selfLoopOwners.get(edge.sourceId) ?? 0) + 1);
      continue;
    }
    const start = positions[edge.sourceId]; const end = positions[edge.targetId];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    edgeLengths.push(length);
    const demand = textWidth(edge.label);
    labelSpanDeficit += Math.max(0, demand + 64 - length);
    for (const node of graph.nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      coarseCorridorPressure += Math.max(0, Math.min(80, demand * 0.22 + 34) - pointSegmentDistance(positions[node.id], start, end));
    }
    const pairKey = [edge.sourceId, edge.targetId].sort(compareId).join("\u0000");
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
  }
  for (const [key, count] of pairCounts) if (count > 1) {
    const [sourceId, targetId] = key.split("\u0000");
    const chord = Math.hypot(positions[sourceId].x - positions[targetId].x, positions[sourceId].y - positions[targetId].y);
    parallelPressure += (count - 1) * Math.max(0, 180 + count * 22 - chord);
  }
  const angular = angularGapPressure(graph, positions);
  let selfLoopPressure = 0;
  for (const [ownerId, count] of selfLoopOwners) {
    const owner = positions[ownerId];
    const nearby = graph.nodes.filter(({ id }) => id !== ownerId && Math.hypot(positions[id].x - owner.x, positions[id].y - owner.y) < 190).length;
    selfLoopPressure += count * (nearby * 30 + Math.max(0, 80 - angular.minimumGapDegrees));
  }
  const maximumEdge = edgeLengths.length ? Math.max(...edgeLengths) : 0;
  const medianEdge = median(edgeLengths);
  const extentDiagonal = Math.hypot(width, height);
  const fitPressure = Math.max(width / 1000, height / 700);
  return {
    crossings: finite(candidate.structuralCrossings, 999),
    separationDeficit: Math.max(0, 145 - minimumSeparation),
    minimumSeparation,
    labelSpanDeficit,
    coarseCorridorPressure,
    angularPressure: angular.angularPressure,
    minimumAngularGapDegrees: angular.minimumGapDegrees,
    parallelPressure,
    selfLoopPressure,
    width,
    height,
    extentDiagonal,
    fitPressure,
    medianEdge,
    maximumEdge,
    edgeSpread: Math.max(0, maximumEdge - medianEdge),
    sourceCheapScore: finite(candidate.cheapScore, 0),
    sourceCorridorDeficit: finite(candidate.cheap?.coarseCorridorDeficit, 0),
  };
}
function compactProductMetrics(metrics) {
  return {
    score: finite(metrics?.score, Number.POSITIVE_INFINITY),
    crossings: finite(metrics?.crossings, Number.POSITIVE_INFINITY),
    labelRouteHits: finite(metrics?.labelRouteHits, Number.POSITIVE_INFINITY),
    labelNear20: finite(metrics?.labelNear20, Number.POSITIVE_INFINITY),
    labelOverlap: finite(metrics?.labelOverlap, Number.POSITIVE_INFINITY),
    overlapPairs: finite(metrics?.overlapPairs, Number.POSITIVE_INFINITY),
    labelCorridorDeficit: finite(metrics?.labelCorridorDeficit, Number.POSITIVE_INFINITY),
    routeMedian: finite(metrics?.routeMedian, Number.POSITIVE_INFINITY),
    routeMax: finite(metrics?.routeMax, Number.POSITIVE_INFINITY),
    fitScale: finite(metrics?.fitScale, 0),
    extent: metrics?.extent ?? null,
  };
}
function productComparator(left, right) {
  return left.product.score - right.product.score || left.product.crossings - right.product.crossings || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
}
function currentCheapScore(candidate) {
  return candidate.features.crossings * 1_000_000
    + Math.max(0, 145 - finite(candidate.legacyMinNodeSeparation, 0)) * 1_000
    + candidate.features.sourceCorridorDeficit * 100
    + candidate.features.sourceCheapScore / 1_000_000;
}
function normalizeCandidates(candidates) {
  const keys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"];
  const ranges = Object.fromEntries(keys.map((key) => {
    const values = candidates.map((candidate) => candidate.features[key]);
    return [key, { minimum: Math.min(...values), maximum: Math.max(...values) }];
  }));
  return candidates.map((candidate) => ({
    ...candidate,
    normalized: Object.fromEntries(keys.map((key) => {
      const range = ranges[key];
      return [key, range.maximum === range.minimum ? 0 : (candidate.features[key] - range.minimum) / (range.maximum - range.minimum)];
    })),
  }));
}
function scalarScore(candidate, weights) {
  return candidate.normalized.crossings * weights.crossing
    + candidate.normalized.separationDeficit * weights.separation
    + candidate.normalized.labelSpanDeficit * weights.labelSpan
    + candidate.normalized.coarseCorridorPressure * weights.corridor
    + candidate.normalized.angularPressure * weights.angular
    + candidate.normalized.extentDiagonal * weights.extent
    + candidate.normalized.edgeSpread * weights.edge;
}
function cheapComparator(name, weights) {
  if (name === "current-scalar") return (left, right) => currentCheapScore(left) - currentCheapScore(right) || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
  if (name === "lexicographic") return (left, right) => left.features.crossings - right.features.crossings
    || left.features.separationDeficit - right.features.separationDeficit
    || left.features.labelSpanDeficit - right.features.labelSpanDeficit
    || left.features.coarseCorridorPressure - right.features.coarseCorridorPressure
    || left.features.angularPressure - right.features.angularPressure
    || left.features.extentDiagonal - right.features.extentDiagonal
    || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
  return (left, right) => scalarScore(left, weights) - scalarScore(right, weights) || compareId(left.family, right.family) || compareId(left.fingerprint, right.fingerprint);
}
function dominates(left, right) {
  const keys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal"];
  return keys.every((key) => left.features[key] <= right.features[key]) && keys.some((key) => left.features[key] < right.features[key]);
}
function featureDistance(left, right) {
  const keys = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "extentDiagonal", "edgeSpread"];
  return Math.sqrt(sum(keys.map((key) => (left.normalized[key] - right.normalized[key]) ** 2)));
}
function paretoOrder(candidates, weights) {
  const frontier = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => index !== otherIndex && dominates(other, candidate)));
  const scalar = cheapComparator("scalar", weights);
  const selected = [];
  const pool = frontier.slice().sort(scalar);
  if (pool[0]) selected.push(pool[0]);
  while (selected.length < pool.length) {
    const available = pool.filter((candidate) => !selected.includes(candidate));
    available.sort((left, right) => {
      const leftDistance = Math.min(...selected.map((chosen) => featureDistance(left, chosen)));
      const rightDistance = Math.min(...selected.map((chosen) => featureDistance(right, chosen)));
      return rightDistance - leftDistance || scalar(left, right);
    });
    selected.push(available[0]);
  }
  return [...selected, ...candidates.filter((candidate) => !frontier.includes(candidate)).sort(scalar)];
}
function hybridOrder(candidates, weights) {
  const scalar = cheapComparator("scalar", weights);
  const ordered = candidates.slice().sort(scalar);
  const anchors = [];
  const add = (candidate) => { if (candidate && !anchors.includes(candidate)) anchors.push(candidate); };
  add(ordered[0]);
  add(candidates.slice().sort((left, right) => left.features.labelSpanDeficit + left.features.coarseCorridorPressure - right.features.labelSpanDeficit - right.features.coarseCorridorPressure || scalar(left, right))[0]);
  add(candidates.slice().sort((left, right) => left.features.angularPressure + left.features.parallelPressure + left.features.selfLoopPressure - right.features.angularPressure - right.features.parallelPressure - right.features.selfLoopPressure || scalar(left, right))[0]);
  add(candidates.slice().sort((left, right) => left.features.extentDiagonal - right.features.extentDiagonal || scalar(left, right))[0]);
  const classes = [...new Set(candidates.map((candidate) => candidate.familyClass))].sort(compareId);
  for (const family of classes) add(ordered.find((candidate) => candidate.familyClass === family));
  const pareto = paretoOrder(candidates, weights);
  return [...anchors, ...pareto.filter((candidate) => !anchors.includes(candidate)), ...ordered.filter((candidate) => !anchors.includes(candidate) && !pareto.includes(candidate))];
}
function rankCandidates(candidates, formulation, weights = weightProfiles[0]) {
  if (formulation === "pareto-diverse") return paretoOrder(candidates, weights);
  if (formulation === "hybrid-risk-diverse") return hybridOrder(candidates, weights);
  return candidates.slice().sort(cheapComparator(formulation, weights));
}
function runArm(fixture, arm) {
  const env = {
    ...process.env,
    E2R_GLOBAL_PLACEMENT_ABLATION: arm,
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_PRESENTATION_FINALIST_LIMIT: "4",
    E2R_PRESENTATION_COST_PROFILE: "1",
  };
  const startedAt = performance.now();
  const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixture.path], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: OPERATION_TIMEOUT_MS,
    killSignal: "SIGTERM",
    env,
  });
  if (run.error?.code === "ETIMEDOUT") return { fixture: fixture.id, fixtureFamily: fixture.family, arm, status: "budget-exhausted", wallMs: performance.now() - startedAt, candidates: [], graph: fixtureGraph(fixture), profile: null };
  if (run.status !== 0) throw new Error(`${fixture.id}/${arm}: ${run.stderr || run.error || `exit ${run.status}`}`);
  const output = JSON.parse(run.stdout);
  const graph = fixtureGraph(fixture);
  const featureStartedAt = performance.now();
  const candidates = normalizeCandidates((output.candidates ?? []).map((candidate, index) => {
    const base = {
      index,
      family: candidate.family,
      familyClass: familyClass(candidate.family),
      fingerprint: hashPositions(candidate.positions),
      positions: candidate.positions,
      cheap: candidate.cheap ?? null,
      cheapScore: candidate.cheapScore ?? null,
      legacyMinNodeSeparation: candidate.minNodeSeparation ?? candidate.cheap?.minimumSeparation ?? null,
      structuralCrossings: candidate.structuralCrossings ?? null,
      product: compactProductMetrics(candidate.metrics),
    };
    return { ...base, features: featureVector(graph, base) };
  }));
  const featureExtractionMs = performance.now() - featureStartedAt;
  return {
    fixture: fixture.id,
    fixtureFamily: fixture.family,
    arm,
    status: "completed",
    wallMs: Number((performance.now() - startedAt).toFixed(3)),
    candidates,
    graph,
    featureExtractionMs,
    profile: {
      productEvaluations: output.profile?.fullPresentationEvaluations ?? candidates.length,
      presentationMs: output.profile?.presentationMs ?? 0,
    },
  };
}
function selectionResult(row, formulation, budget, weights = weightProfiles[0]) {
  const rankingStartedAt = performance.now();
  let ranking = null;
  for (let repeat = 0; repeat < 100; repeat += 1) ranking = rankCandidates(row.candidates, formulation, weights);
  const rankingMs = (performance.now() - rankingStartedAt) / 100;
  const screeningMs = row.featureExtractionMs + rankingMs;
  const finalists = ranking.slice(0, budget);
  const productRanked = row.candidates.slice().sort(productComparator);
  const oracle = productRanked[0];
  const finalistBest = finalists.slice().sort(productComparator)[0];
  const productTop3 = productRanked.slice(0, Math.min(3, productRanked.length));
  const baseline = baselineByFixture.get(row.fixture)?.product ?? null;
  const regret = finalistBest.product.score - oracle.product.score;
  const relativeRegret = regret / Math.max(1, Math.abs(oracle.product.score));
  const exactBest = finalists.some((candidate) => candidate.fingerprint === oracle.fingerprint);
  const top3Hit = finalists.some((candidate) => productTop3.some((top) => top.fingerprint === candidate.fingerprint));
  const top3Coverage = productTop3.filter((top) => finalists.some((candidate) => candidate.fingerprint === top.fingerprint)).length / Math.max(1, productTop3.length);
  const oracleImprovesBaseline = baseline ? oracle.product.score < baseline.score : false;
  const finalistImprovesBaseline = baseline ? finalistBest.product.score < baseline.score : false;
  const criticalRegression = finalistBest.product.crossings > oracle.product.crossings
    || finalistBest.product.overlapPairs > oracle.product.overlapPairs
    || finalistBest.product.labelRouteHits > oracle.product.labelRouteHits
    || finalistBest.product.labelOverlap > oracle.product.labelOverlap;
  const meaningfulFalseNegative = !exactBest && (relativeRegret > 0.02 || regret > 2_000 || criticalRegression || (oracleImprovesBaseline && !finalistImprovesBaseline));
  return {
    exactBest,
    top3Hit,
    top3Coverage,
    regret,
    relativeRegret,
    baselineImprovementRetained: !oracleImprovesBaseline || finalistImprovesBaseline,
    oracleImprovesBaseline,
    meaningfulFalseNegative,
    screeningMs,
    featureExtractionMs: row.featureExtractionMs,
    rankingMs,
    finalistCount: finalists.length,
    oracleEvaluations: row.candidates.length,
    savedEvaluations: row.candidates.length - finalists.length,
    oraclePresentationMs: row.profile.presentationMs,
    estimatedFinalistPresentationMs: row.profile.presentationMs * finalists.length / Math.max(1, row.candidates.length),
    oracle: { family: oracle.family, familyClass: oracle.familyClass, fingerprint: oracle.fingerprint, product: oracle.product, features: oracle.features },
    finalistBest: { family: finalistBest.family, familyClass: finalistBest.familyClass, fingerprint: finalistBest.fingerprint, product: finalistBest.product, features: finalistBest.features },
    finalists: finalists.map(({ family, familyClass, fingerprint, features }) => ({ family, familyClass, fingerprint, features })),
    deterministic: JSON.stringify(ranking.map(({ fingerprint }) => fingerprint)) === JSON.stringify(rankCandidates(row.candidates, formulation, weights).map(({ fingerprint }) => fingerprint)),
  };
}
function aggregateResults(results) {
  const count = results.length;
  return {
    operationCount: count,
    exactBestRecall: count ? results.filter((result) => result.exactBest).length / count : 0,
    exactBestHits: results.filter((result) => result.exactBest).length,
    top3AnyRecall: count ? results.filter((result) => result.top3Hit).length / count : 0,
    meanTop3Coverage: count ? sum(results.map((result) => result.top3Coverage)) / count : 0,
    falseNegativeCount: results.filter((result) => !result.exactBest).length,
    meaningfulFalseNegativeCount: results.filter((result) => result.meaningfulFalseNegative).length,
    baselineImprovementRetention: count ? results.filter((result) => result.baselineImprovementRetained).length / count : 0,
    oracleImprovementOperations: results.filter((result) => result.oracleImprovesBaseline).length,
    retainedOracleImprovementOperations: results.filter((result) => result.oracleImprovesBaseline && result.baselineImprovementRetained).length,
    totalRegret: sum(results.map((result) => result.regret)),
    meanRegret: count ? sum(results.map((result) => result.regret)) / count : 0,
    medianRegret: median(results.map((result) => result.regret)),
    p95Regret: percentile(results.map((result) => result.regret), 0.95),
    maxRegret: Math.max(0, ...results.map((result) => result.regret)),
    meanRelativeRegret: count ? sum(results.map((result) => result.relativeRegret)) / count : 0,
    maxRelativeRegret: Math.max(0, ...results.map((result) => result.relativeRegret)),
    totalOracleEvaluations: sum(results.map((result) => result.oracleEvaluations)),
    totalFinalistEvaluations: sum(results.map((result) => result.finalistCount)),
    maxOracleEvaluations: Math.max(0, ...results.map((result) => result.oracleEvaluations)),
    maxFinalistEvaluations: Math.max(0, ...results.map((result) => result.finalistCount)),
    savedEvaluations: sum(results.map((result) => result.savedEvaluations)),
    evaluationReduction: 1 - sum(results.map((result) => result.finalistCount)) / Math.max(1, sum(results.map((result) => result.oracleEvaluations))),
    totalOraclePresentationMs: sum(results.map((result) => result.oraclePresentationMs)),
    estimatedFinalistPresentationMs: sum(results.map((result) => result.estimatedFinalistPresentationMs)),
    maxOraclePresentationMs: Math.max(0, ...results.map((result) => result.oraclePresentationMs)),
    maxEstimatedFinalistPresentationMs: Math.max(0, ...results.map((result) => result.estimatedFinalistPresentationMs)),
    estimatedPresentationReduction: 1 - sum(results.map((result) => result.estimatedFinalistPresentationMs)) / Math.max(1, sum(results.map((result) => result.oraclePresentationMs))),
    medianScreeningMs: median(results.map((result) => result.screeningMs)),
    maxScreeningMs: Math.max(0, ...results.map((result) => result.screeningMs)),
    deterministic: results.every((result) => result.deterministic),
  };
}
function evaluateFormulation(formulation, budget, weights = weightProfiles[0], rows = candidateRows) {
  return rows.map((row) => ({ fixture: row.fixture, fixtureFamily: row.fixtureFamily, arm: row.arm, ...selectionResult(row, formulation, budget, weights) }));
}
function scoreProfile(profile, rows) {
  const aggregate = aggregateResults(rows.flatMap((row) => evaluateFormulation("scalar-profile", 4, profile, [row])));
  return [aggregate.exactBestHits, -aggregate.meaningfulFalseNegativeCount, -aggregate.totalRegret, -aggregate.maxRegret];
}
function compareScoreVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return right[index] - left[index];
  return 0;
}
function bestProfile(rows) {
  return weightProfiles.map((profile) => ({ profile, score: scoreProfile(profile, rows) }))
    .sort((left, right) => compareScoreVectors(left.score, right.score) || compareId(left.profile.id, right.profile.id))[0].profile;
}
function holdoutAudit() {
  const fixtureIds = [...new Set(candidateRows.map(({ fixture }) => fixture))].sort(compareId);
  const rows = fixtureIds.map((heldOut) => {
    const training = candidateRows.filter(({ fixture }) => fixture !== heldOut);
    const test = candidateRows.filter(({ fixture }) => fixture === heldOut);
    const profile = bestProfile(training);
    const aggregate = aggregateResults(evaluateFormulation("scalar-profile", 4, profile, test));
    return { heldOut, selectedProfile: profile.id, ...aggregate };
  });
  const combined = {
    operationCount: sum(rows.map((row) => row.operationCount)),
    exactBestHits: sum(rows.map((row) => row.exactBestHits)),
    meaningfulFalseNegativeCount: sum(rows.map((row) => row.meaningfulFalseNegativeCount)),
    totalRegret: sum(rows.map((row) => row.totalRegret)),
    profileSelectionCounts: Object.fromEntries(weightProfiles.map(({ id }) => [id, rows.filter((row) => row.selectedProfile === id).length])),
  };
  combined.exactBestRecall = combined.exactBestHits / Math.max(1, combined.operationCount);
  return { method: "leave-one-fixture-out profile selection from six predefined interpretable weight profiles", rows, combined };
}
function subsetAggregate(results, predicate) { return aggregateResults(results.filter(predicate)); }
function rootCauseAudit(currentResults) {
  return currentResults.filter((result) => !result.exactBest).map((result) => {
    const row = candidateRows.find((candidateRow) => candidateRow.fixture === result.fixture && candidateRow.arm === result.arm);
    const currentRanking = rankCandidates(row.candidates, "current-scalar");
    const cheapRank = currentRanking.findIndex(({ fingerprint }) => fingerprint === result.oracle.fingerprint) + 1;
    const retainedBest = result.finalistBest;
    const productDelta = {
      score: retainedBest.product.score - result.oracle.product.score,
      crossings: retainedBest.product.crossings - result.oracle.product.crossings,
      labelRouteHits: retainedBest.product.labelRouteHits - result.oracle.product.labelRouteHits,
      labelNear20: retainedBest.product.labelNear20 - result.oracle.product.labelNear20,
      labelOverlap: retainedBest.product.labelOverlap - result.oracle.product.labelOverlap,
      fitScale: retainedBest.product.fitScale - result.oracle.product.fitScale,
    };
    const featureDelta = Object.fromEntries(Object.keys(result.oracle.features).filter((key) => typeof result.oracle.features[key] === "number").map((key) => [key, retainedBest.features[key] - result.oracle.features[key]]));
    const causes = [];
    if (productDelta.labelRouteHits > 0 || productDelta.labelNear20 > 0 || productDelta.labelOverlap > 0) causes.push("label-presentation proxy omission");
    if (result.oracle.features.labelSpanDeficit < retainedBest.features.labelSpanDeficit || result.oracle.features.coarseCorridorPressure < retainedBest.features.coarseCorridorPressure) causes.push("label-demand/corridor discrimination missing");
    if (result.oracle.features.extentDiagonal < retainedBest.features.extentDiagonal || productDelta.fitScale < 0) causes.push("extent/fit discrimination missing");
    if (result.oracle.features.angularPressure < retainedBest.features.angularPressure) causes.push("endpoint angular pressure omitted");
    if (result.oracle.features.parallelPressure < retainedBest.features.parallelPressure) causes.push("Parallel capacity pressure omitted");
    if (result.oracle.features.selfLoopPressure < retainedBest.features.selfLoopPressure) causes.push("Self-loop neighborhood pressure omitted");
    if (result.oracle.features.crossings > retainedBest.features.crossings && result.oracle.product.crossings < retainedBest.product.crossings) causes.push("structural/Product crossing inversion");
    if (!causes.length) causes.push("cheap geometry indistinguishable from Product outcome");
    return { fixture: result.fixture, arm: result.arm, productBestCheapRank: cheapRank, causes, productDelta, featureDelta, meaningful: result.meaningfulFalseNegative };
  });
}
function proposedMissAudit(results) {
  const cheapFeatureNames = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "parallelPressure", "selfLoopPressure", "extentDiagonal", "edgeSpread"];
  return results.filter((result) => !result.exactBest).map((result) => {
    const deltas = Object.fromEntries(cheapFeatureNames.map((name) => [name, result.finalistBest.features[name] - result.oracle.features[name]]));
    const maximumNormalizedDelta = Math.max(...cheapFeatureNames.map((name) => Math.abs(deltas[name]) / Math.max(1, Math.abs(result.oracle.features[name]))));
    return {
      fixture: result.fixture,
      arm: result.arm,
      regret: result.regret,
      relativeRegret: result.relativeRegret,
      productCrossingDelta: result.finalistBest.product.crossings - result.oracle.product.crossings,
      cheapFeatureDeltas: deltas,
      cheapFeatureEquivalent: maximumNormalizedDelta < 1e-9,
      conclusion: maximumNormalizedDelta < 1e-9
        ? "candidate geometry summaries are indistinguishable while Product routing/presentation differs"
        : "remaining cheap-feature ordering disagrees with Product authority",
    };
  });
}

const rows = [];
for (const fixture of fixtures) for (const arm of arms) {
  if (arm === "structural-native-discrete" && !discreteFixtureIds.has(fixture.id)) continue;
  rows.push(runArm(fixture, arm));
}
const baselineRows = rows.filter((row) => row.arm === "direct-current" && row.candidates.length);
const baselineByFixture = new Map(baselineRows.map((row) => [row.fixture, row.candidates[0]]));
const candidateRows = rows.filter((row) => row.arm !== "direct-current" && row.status === "completed" && row.candidates.length);
const globalProfile = bestProfile(candidateRows);
const formulations = [
  { id: "current-scalar", weights: null },
  { id: "lexicographic", weights: null },
  { id: `scalar-${globalProfile.id}`, formulation: "scalar-profile", weights: globalProfile },
  { id: "pareto-diverse", weights: globalProfile },
  { id: "hybrid-risk-diverse", weights: globalProfile },
];
const comparisons = formulations.map((definition) => ({
  formulation: definition.id,
  implementation: definition.formulation ?? definition.id,
  weights: definition.weights,
  budgets: Object.fromEntries(budgets.map((budget) => {
    const results = evaluateFormulation(definition.formulation ?? definition.id, budget, definition.weights ?? globalProfile);
    return [budget, { aggregate: aggregateResults(results), results }];
  })),
}));
const proposed = comparisons.slice().sort((left, right) => {
  const a = left.budgets[4].aggregate; const b = right.budgets[4].aggregate;
  return b.exactBestHits - a.exactBestHits
    || a.meaningfulFalseNegativeCount - b.meaningfulFalseNegativeCount
    || a.totalRegret - b.totalRegret
    || a.maxRegret - b.maxRegret
    || compareId(left.formulation, right.formulation);
})[0];
const proposedResults = proposed.budgets[4].results;
const current = comparisons.find(({ formulation }) => formulation === "current-scalar");
const currentResults = current.budgets[4].results;
const comparisonSummaries = comparisons.map(({ formulation, implementation, weights, budgets: budgetResults }) => ({
  formulation,
  implementation,
  weights,
  budgets: Object.fromEntries(budgets.map((budget) => [budget, budgetResults[budget].aggregate])),
}));
const falseNegativeAudit = rootCauseAudit(currentResults);
const remainingFalseNegativeAudit = proposedMissAudit(proposedResults);
const holdout = holdoutAudit();
const featureNames = ["crossings", "separationDeficit", "labelSpanDeficit", "coarseCorridorPressure", "angularPressure", "parallelPressure", "selfLoopPressure", "extentDiagonal", "edgeSpread"];
const featureAudit = featureNames.map((name) => {
  const pairs = candidateRows.flatMap((row) => row.candidates.map((candidate) => ({ feature: candidate.features[name], product: candidate.product.score })));
  const meanFeature = sum(pairs.map(({ feature }) => feature)) / Math.max(1, pairs.length);
  const meanProduct = sum(pairs.map(({ product }) => product)) / Math.max(1, pairs.length);
  const covariance = sum(pairs.map(({ feature, product }) => (feature - meanFeature) * (product - meanProduct)));
  const denominator = Math.sqrt(sum(pairs.map(({ feature }) => (feature - meanFeature) ** 2)) * sum(pairs.map(({ product }) => (product - meanProduct) ** 2)));
  const currentFalseNegativesImproved = falseNegativeAudit.filter(({ featureDelta }) => finite(featureDelta[name], 0) > 0).length;
  return {
    name,
    availability: "candidate geometry + Dataset graph only",
    deterministic: true,
    pearsonProductScoreCorrelation: denominator ? covariance / denominator : 0,
    currentFalseNegativesWhereOracleImprovesFeature: currentFalseNegativesImproved,
    computation: name === "crossings" ? "existing structural O(E^2) signal"
      : name === "separationDeficit" ? "O(V^2) point-distance scan"
      : name === "coarseCorridorPressure" ? "O(E*V) segment-distance scan"
      : name === "angularPressure" ? "O(E + sum(degree log degree))"
      : name === "labelSpanDeficit" || name === "parallelPressure" || name === "selfLoopPressure" ? "O(E + V) graph-demand scan"
      : "O(V + E) geometry summary",
    redundancy: name === "extentDiagonal" ? "partly overlaps edgeSpread but directly guards extent escape"
      : name === "parallelPressure" || name === "selfLoopPressure" ? "fixture-specific; weak global correlation and no independent recall gain"
      : name === "crossings" ? "dominant non-redundant topology signal"
      : "partly correlated with other geometric congestion signals",
    notes: name === "parallelPressure" || name === "selfLoopPressure" ? "diagnostic pressure only; final Product authority is not reproduced" : "cheap geometry-derived signal",
  };
});
const classification = proposed.budgets[4].aggregate.meaningfulFalseNegativeCount === 0
  && proposed.budgets[4].aggregate.exactBestRecall >= 0.9
  && holdout.combined.exactBestRecall >= 0.85
  ? "A. SCREENING FORMULATION PROMISING"
  : proposed.budgets[4].aggregate.meaningfulFalseNegativeCount < current.budgets[4].aggregate.meaningfulFalseNegativeCount
    ? "B. RECALL IMPROVED BUT NOT CLOSED"
    : "D. CHEAP PROXY LIMIT CONFIRMED";
const artifact = {
  contract: "LIAISONSCAPE-BOUNDED-SCREENING-FINALIST-RECALL1-v1",
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  sourceBoundary: "Existing candidate families only. Cheap features use candidate Node geometry and Dataset graph/label demand. Product metrics are oracle outputs used only after ranking for evaluation and root-cause diagnosis.",
  campaign: {
    fixtures,
    arms,
    operationCount: rows.length,
    successfulCandidateOperations: candidateRows.length,
    budgets,
    formulations: formulations.map(({ id }) => id),
    operationTimeoutMs: OPERATION_TIMEOUT_MS,
    oracleAllCandidateProductEvaluation: true,
    productionShapedSimulation: "candidate generation -> cheap feature extraction/ranking -> K finalists -> oracle lookup of Product-authoritative results",
    meaningfulFalseNegativeDefinition: "exact best missing and >2% or >2000 score regret, critical Product metric regression, or loss of an oracle baseline improvement",
  },
  exactness: {
    currentTop4Expected: { hits: 20, operations: 26 },
    currentTop4Observed: { hits: current.budgets[4].aggregate.exactBestHits, operations: current.budgets[4].aggregate.operationCount },
    currentBaselineReproduced: current.budgets[4].aggregate.exactBestHits === 20 && current.budgets[4].aggregate.operationCount === 26,
    deterministic: comparisons.every((comparison) => budgets.every((budget) => comparison.budgets[budget].aggregate.deterministic)),
  },
  candidateGeneration: rows.map((row) => ({ fixture: row.fixture, fixtureFamily: row.fixtureFamily, arm: row.arm, status: row.status, candidateCount: row.candidates.length, wallMs: row.wallMs, productEvaluations: row.profile?.productEvaluations ?? 0, presentationMs: row.profile?.presentationMs ?? 0 })),
  featureAudit,
  falseNegativeAudit,
  remainingFalseNegativeAudit,
  comparisons: comparisonSummaries,
  selectedDiagnosticFormulation: { formulation: proposed.formulation, weights: proposed.weights, top4: proposed.budgets[4].aggregate },
  subgroupAudit: {
    canonical: subsetAggregate(proposedResults, ({ fixture }) => /^(lighthouse|apollo|titanic)-/.test(fixture)),
    english: subsetAggregate(proposedResults, ({ fixture }) => /-en$/.test(fixture)),
    japanese: subsetAggregate(proposedResults, ({ fixture }) => /-ja$/.test(fixture)),
    dense: subsetAggregate(proposedResults, ({ fixture }) => fixture.startsWith("dense-")),
    parallel: subsetAggregate(proposedResults, ({ fixture }) => fixture.startsWith("titanic-")),
    selfLoop: subsetAggregate(proposedResults, ({ fixture }) => fixture.startsWith("lighthouse-")),
    labelSensitive: subsetAggregate(proposedResults, ({ fixtureFamily }) => fixtureFamily.includes("label")),
  },
  holdout,
  disposition: {
    classification,
    cheapOnlyScreening: classification === "A. SCREENING FORMULATION PROMISING" ? "PROMISING / REQUIRES INDEPENDENT PRODUCTION-SHAPED CONFIRMATION" : "NOT ESTABLISHED",
    productionShapedPreScreenBenchmark: classification === "A. SCREENING FORMULATION PROMISING" ? "READY" : "HOLD",
    multiStageProductProbing: classification === "A. SCREENING FORMULATION PROMISING" ? "DEFER" : "NEXT BOUNDED ARCHITECTURE CANDIDATE",
    qualitySolver: "HOLD / NOT ESTABLISHED",
    productIntegration: "HOLD",
    productionProvider: "NOT ESTABLISHED",
    adaptiveCascade: "INACTIVE",
    actualProductVisualEvaluation: "NOT READY",
    humanReview: "NOT READY",
    initialLayoutReleaseBlocker: "OPEN",
  },
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "benchmark-result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  output: path.relative(root, path.join(outputDir, "benchmark-result-summary.json")),
  classification,
  currentTop4: current.budgets[4].aggregate,
  proposed: artifact.selectedDiagnosticFormulation,
  holdout: holdout.combined,
}, null, 2));
