import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { buildEntityGraph } from "../src/dataset.ts";
import { settleInitialPlacement } from "../src/auto-layout.ts";
import {
  deriveAutomaticNodeLabels,
  deriveAutomaticRelationLabels,
  deriveAutomaticRoutes,
} from "../src/graph-presentation.ts";
import {
  fitGraphView,
  minimumPathToLabelRectDistance,
  placeNodeLabel,
  routeGraphEdge,
} from "../src/viewport.ts";

const OUTPUT = "experimental/self-loop-local-capacity-allocation/audit.json";
const EXAMPLES = "../e2r-spec/examples";
const ANGLE_COUNT = 36;
const ANGLE_STEP = Math.PI / 18;
const GROUP_TOP_K = 6;
const HARD_ORDINARY_CLEARANCE = 8;
const HARD_PEER_CLEARANCE = 8;
const HARD_LABEL_CLEARANCE = 4;
const VIEWPORT_MARGIN = 12;
const RADIUS_DELTA = 14;
const AUTHORITATIVE_TOP_K = 6;
const GROUP_AUTHORITATIVE_LIMIT = 24;
const RUNTIME_MEASURED_RUNS = 3;

const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const angleDistance = (left, right) => Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
const minDistance = (left, right) => left.length && right.length
  ? Math.min(...left.flatMap((a) => right.map((b) => distance(a, b))) )
  : Infinity;
const minPointDistance = (point, path) => path.length ? Math.min(...path.map((candidate) => distance(point, candidate))) : Infinity;
const rectOverlap = (left, right) => Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2) - Math.max(left.x - left.width / 2, right.x - right.width / 2))
  * Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2) - Math.max(left.y - left.height / 2, right.y - right.height / 2));
const finiteOrNull = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function createTiming() {
  return { scopes: {} };
}

const RECALL_OUTPUT = "experimental/self-loop-owner-local-recall-reuse/audit.json";
const RECALL_TOP_K = GROUP_AUTHORITATIVE_LIMIT;

function candidateKey(candidate) {
  return `${candidate.orientation.toFixed(8)}:${candidate.radius}`;
}

function entriesKey(entries) {
  return entries.map(({ id, candidate }) => `${id}:${candidateKey(candidate)}`).join("|");
}

function isFeasible(metricsValue) {
  return metricsValue.failures.length === 1 && metricsValue.failures[0] === "feasible";
}

function qualityVector(metricsValue) {
  const minMetric = (field, fallback = 0) => metricsValue.rows.length
    ? Math.min(...metricsValue.rows.map((row) => Number.isFinite(row[field]) ? row[field] : fallback))
    : fallback;
  const maxMetric = (field, fallback = 0) => metricsValue.rows.length
    ? Math.max(...metricsValue.rows.map((row) => Number.isFinite(row[field]) ? row[field] : fallback))
    : fallback;
  return [
    isFeasible(metricsValue) ? 1 : 0,
    -metricsValue.failures.length,
    metricsValue.viewport.outsideCount === 0 ? 1 : 0,
    -metricsValue.viewport.outsideCount,
    -metricsValue.ordinaryChurn,
    minMetric("ordinaryClearance", -Infinity),
    minMetric("peerLoopClearance", -Infinity),
    minMetric("ownerNodeLabelClearance", -Infinity),
    minMetric("relationLabelOrdinaryClearance", -Infinity),
    minMetric("relationLabelOtherGap", -Infinity),
    -Math.max(0, maxMetric("relationLabelNodeOverlap", 0)),
  ];
}

function dominates(left, right) {
  const leftVector = qualityVector(left.metrics);
  const rightVector = qualityVector(right.metrics);
  const atLeast = leftVector.every((value, index) => value >= rightVector[index]);
  const strictly = leftVector.some((value, index) => value > rightVector[index]);
  return atLeast && strictly;
}

function paretoFront(entries) {
  return entries.filter((candidate, index) => !entries.some((other, otherIndex) => otherIndex !== index && dominates(other, candidate)));
}

function mapHasKeys(map, entries) {
  return entries.filter((entry) => map.has(entriesKey(entry.entries ?? entry))).length;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameMap(left, right) {
  return sameJson([...left.entries()], [...right.entries()]);
}

function projectOwnerLocalReuse(baseline, value, ownerId, loopIds) {
  const routedEdges = baseline.routedEdges.map((edge) => loopIds.has(edge.id)
    ? value.routedEdges.find((candidate) => candidate.id === edge.id)
    : edge);
  const relationLabels = new Map([...baseline.relationLabels].map(([id, label]) => [
    id,
    loopIds.has(id) ? value.relationLabels.get(id) : label,
  ]));
  const nodeLabels = new Map([...baseline.nodeLabels].map(([id, label]) => [
    id,
    id === ownerId ? value.nodeLabels.get(id) : label,
  ]));
  return { ...value, routedEdges, relationLabels, nodeLabels };
}

function dependencyReuseResult(baseline, value, ownerId, edges) {
  const loopIds = new Set(edges.map((edge) => edge.id));
  const projected = projectOwnerLocalReuse(baseline, value, ownerId, loopIds);
  const ordinaryBaseline = baseline.routedEdges.filter((edge) => edge.sourceId !== edge.targetId);
  const ordinaryCandidate = value.routedEdges.filter((edge) => edge.sourceId !== edge.targetId);
  const ordinaryRoutesUnchanged = sameJson(
    ordinaryBaseline.map((edge) => [edge.id, edge.path]),
    ordinaryCandidate.map((edge) => [edge.id, edge.path]),
  );
  const unaffectedRelationLabelsUnchanged = [...baseline.relationLabels.entries()]
    .filter(([id]) => !loopIds.has(id))
    .every(([id, label]) => sameJson(label, value.relationLabels.get(id)));
  const unaffectedNodeLabelsUnchanged = [...baseline.nodeLabels.entries()]
    .filter(([id]) => id !== ownerId)
    .every(([id, label]) => sameJson(label, value.nodeLabels.get(id)));
  return {
    eligible: sameJson(projected.routedEdges, value.routedEdges)
      && sameMap(projected.relationLabels, value.relationLabels)
      && sameMap(projected.nodeLabels, value.nodeLabels),
    ordinaryRoutesUnchanged,
    unaffectedRelationLabelsUnchanged,
    unaffectedNodeLabelsUnchanged,
    viewportInputsInvariant: sameJson(baseline.positions, value.positions),
  };
}

function evaluateAuthoritativeEntry(input, baseline, entries) {
  const startedAt = performance.now();
  const value = render(input, overrideMap(entries), undefined, "recall-authoritative");
  const valueMetrics = metrics(value, baseline);
  return {
    entries,
    key: entriesKey(entries),
    value,
    metrics: valueMetrics,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function recallSummary(authoritative, screened, topK) {
  const screenedTop = screened.slice(0, topK);
  const screenedKeys = new Set(screenedTop.map((entry) => entriesKey(entry.entries)));
  const authoritativeKeys = new Set(authoritative.map((entry) => entry.key));
  const feasible = authoritative.filter((entry) => isFeasible(entry.metrics));
  const pareto = paretoFront(authoritative);
  const authoritativeTop = authoritative.slice(0, topK);
  const countCaptured = (entries) => entries.filter((entry) => screenedKeys.has(entry.key)).length;
  const allFalseNegatives = feasible.filter((entry) => !screenedKeys.has(entry.key));
  const falseNegatives = allFalseNegatives.slice(0, 12).map((entry) => ({
    key: entry.key,
    failures: entry.metrics.failures,
  }));
  return {
    screenedFinalistCount: screenedTop.length,
    authoritativeCandidateCount: authoritative.length,
    feasiblePlanCount: feasible.length,
    feasiblePlanRecall: feasible.length ? Number((countCaptured(feasible) / feasible.length).toFixed(4)) : null,
    bestAuthoritativePlanRecall: authoritative.length ? screenedKeys.has(authoritative[0].key) : null,
    paretoPlanCount: pareto.length,
    paretoFrontRecall: pareto.length ? Number((countCaptured(pareto) / pareto.length).toFixed(4)) : null,
    topNAuthoritativeQualityRecall: authoritativeTop.length ? Number((countCaptured(authoritativeTop) / authoritativeTop.length).toFixed(4)) : null,
    falseNegativeCount: allFalseNegatives.length,
    displayedFalseNegativeExampleCount: falseNegatives.length,
    falseNegatives,
    screenFalseConfidenceCount: screened.filter((entry) => screenPass(entry.metrics) && !isFeasible(authoritative.find((candidate) => candidate.key === entriesKey(entry.entries))?.metrics ?? { failures: ["missing"] })).length,
    screenFalseRejectionCount: screened.filter((entry) => !screenPass(entry.metrics) && isFeasible(authoritative.find((candidate) => candidate.key === entriesKey(entry.entries))?.metrics ?? { failures: [] })).length,
  };
}

function runSingleLoopRecall(input, baseline, edge) {
  const startedAt = performance.now();
  const screenStartedAt = performance.now();
  const { candidates, screened } = screenCandidates(input, baseline, edge, "small-portfolio");
  const screenElapsedMs = performance.now() - screenStartedAt;
  const retained = screened.slice(0, GROUP_TOP_K);
  const authoritativeStartedAt = performance.now();
  const authoritative = candidates.map((candidate) => evaluateAuthoritativeEntry(input, baseline, [{ id: edge.id, candidate }]));
  const authoritativeElapsedMs = performance.now() - authoritativeStartedAt;
  authoritative.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.key.localeCompare(right.key));
  const retainedKeys = new Set(retained.map(({ candidate }) => candidateKey(candidate)));
  const feasible = authoritative.filter((entry) => isFeasible(entry.metrics));
  const retainedAuthoritative = authoritative.filter((entry) => retainedKeys.has(entry.entries[0].candidate && candidateKey(entry.entries[0].candidate)));
  const screenByKey = new Map(screened.map((entry) => [candidateKey(entry.candidate), entry]));
  const falseConfidence = authoritative.filter((entry) => screenPass(screenByKey.get(candidateKey(entry.entries[0].candidate))?.metrics ?? { failures: [] }) && !isFeasible(entry.metrics)).length;
  const falseRejection = authoritative.filter((entry) => !screenPass(screenByKey.get(candidateKey(entry.entries[0].candidate))?.metrics ?? { failures: [] }) && isFeasible(entry.metrics)).length;
  const allFalseNegativeFeasiblePlans = feasible.filter((entry) => !retainedKeys.has(candidateKey(entry.entries[0].candidate)));
  return {
    edgeId: edge.id,
    candidateCount: candidates.length,
    retainedCandidateCount: retained.length,
    authoritativeEvaluationCount: authoritative.length,
    screenFeasibleCandidateCount: screened.filter(({ metrics: valueMetrics }) => screenPass(valueMetrics)).length,
    feasiblePlanCount: feasible.length,
    feasiblePlanRecall: feasible.length ? Number((feasible.filter((entry) => retainedKeys.has(candidateKey(entry.entries[0].candidate))).length / feasible.length).toFixed(4)) : null,
    bestAuthoritativePlanRecall: authoritative.length ? retainedAuthoritative[0]?.key === authoritative[0].key : null,
    topNAuthoritativeQualityRecall: authoritative.length ? Number((authoritative.slice(0, GROUP_TOP_K).filter((entry) => retainedKeys.has(candidateKey(entry.entries[0].candidate))).length / Math.min(GROUP_TOP_K, authoritative.length)).toFixed(4)) : null,
    falseConfidenceCount: falseConfidence,
    falseRejectionCount: falseRejection,
    falseNegativeFeasiblePlanCount: allFalseNegativeFeasiblePlans.length,
    falseNegativeFeasiblePlans: allFalseNegativeFeasiblePlans.slice(0, 12).map((entry) => ({ key: entry.key, failures: entry.metrics.failures })),
    displayedFalseNegativeExampleCount: Math.min(12, allFalseNegativeFeasiblePlans.length),
    runtime: {
      totalMs: Number((performance.now() - startedAt).toFixed(2)),
      cheapScreenMs: Number(screenElapsedMs.toFixed(2)),
      authoritativeEvaluationMs: Number(authoritativeElapsedMs.toFixed(2)),
    },
  };
}

function runOwnerGroupRecall(input, baseline, edges) {
  const startedAt = performance.now();
  const screenStartedAt = performance.now();
  const local = edges.map((edge) => screenCandidates(input, baseline, edge, "small-portfolio").screened.slice(0, GROUP_TOP_K));
  const products = combinations(local);
  const screened = products.map((entries) => ({
    entries: entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate })),
    metrics: metrics(screenRender(input, baseline, entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))), baseline),
  }));
  screened.sort((left, right) => compareMetrics(left.metrics, right.metrics) || entriesKey(left.entries).localeCompare(entriesKey(right.entries)));
  const screenElapsedMs = performance.now() - screenStartedAt;
  const authoritativeStartedAt = performance.now();
  const authoritative = products.map((entries) => evaluateAuthoritativeEntry(input, baseline, entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))));
  authoritative.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.key.localeCompare(right.key));
  const authoritativeElapsedMs = performance.now() - authoritativeStartedAt;
  const screenRecall = recallSummary(authoritative, screened, RECALL_TOP_K);
  const reuseStartedAt = performance.now();
  const reuse = authoritative.map((entry) => dependencyReuseResult(baseline, entry.value, edges[0].sourceId, edges));
  const reuseElapsedMs = performance.now() - reuseStartedAt;
  const screenMap = new Map(screened.map((entry) => [entriesKey(entry.entries), entry.metrics]));
  const falseConfidence = authoritative.filter((entry) => screenPass(screenMap.get(entry.key) ?? { failures: [] }) && !isFeasible(entry.metrics)).length;
  const falseRejection = authoritative.filter((entry) => !screenPass(screenMap.get(entry.key) ?? { failures: [] }) && isFeasible(entry.metrics)).length;
  return {
    ownerId: edges[0].sourceId,
    loopCount: edges.length,
    fullRetainedProductCount: products.length,
    retainedPerLoopCount: GROUP_TOP_K,
    currentAuthoritativeFinalistCount: Math.min(RECALL_TOP_K, products.length),
    screenFeasibleCombinationCount: screened.filter(({ metrics: valueMetrics }) => screenPass(valueMetrics)).length,
    recall: screenRecall,
    screenFalseConfidenceCount: falseConfidence,
    screenFalseRejectionCount: falseRejection,
    dependencyReuse: {
      evaluatedCount: reuse.length,
      eligibleCount: reuse.filter((value) => value.eligible).length,
      eligibleRate: reuse.length ? Number((reuse.filter((value) => value.eligible).length / reuse.length).toFixed(4)) : null,
      ordinaryRoutesUnchangedCount: reuse.filter((value) => value.ordinaryRoutesUnchanged).length,
      unaffectedRelationLabelsUnchangedCount: reuse.filter((value) => value.unaffectedRelationLabelsUnchanged).length,
      unaffectedNodeLabelsUnchangedCount: reuse.filter((value) => value.unaffectedNodeLabelsUnchanged).length,
      semanticMismatchCount: reuse.filter((value) => !value.eligible).length,
    },
    runtime: {
      totalMs: Number((performance.now() - startedAt).toFixed(2)),
      cheapScreenMs: Number(screenElapsedMs.toFixed(2)),
      authoritativeEvaluationMs: Number(authoritativeElapsedMs.toFixed(2)),
      dependencyReuseProjectionMs: Number(reuseElapsedMs.toFixed(2)),
    },
  };
}

async function runRecallReuseStudy() {
  const results = [];
  const makeCase = async (name, locale, dataset, ownerId) => {
    const positions = positionsFor(dataset);
    const input = makeInput(dataset, positions);
    const baseline = render(input, {});
    const baselineMetrics = metrics(baseline, null);
    baselineMetrics.ordinaryChurn = 0;
    const loopsByOwner = new Map();
    for (const edge of input.graph.edges.filter((candidate) => candidate.sourceId === candidate.targetId)) {
      const group = loopsByOwner.get(edge.sourceId) ?? [];
      group.push(edge);
      loopsByOwner.set(edge.sourceId, group);
    }
    const singleLoop = [];
    const groups = [];
    for (const edges of loopsByOwner.values()) {
      for (const edge of edges) singleLoop.push(runSingleLoopRecall(input, baseline, edge));
      groups.push(runOwnerGroupRecall(input, baseline, edges));
    }
    results.push({
      name,
      locale,
      ownerId,
      graph: { nodes: input.graph.nodes.length, edges: input.graph.edges.length, loops: input.graph.edges.filter((edge) => edge.sourceId === edge.targetId).length, ordinary: input.graph.edges.filter((edge) => edge.sourceId !== edge.targetId).length },
      baseline: { failures: baselineMetrics.failures, ordinaryRouteChurn: baselineMetrics.ordinaryChurn },
      singleLoop,
      groups,
      fullGroupReference: {
        boundary: "all 6^loop-count retained combinations are Product-authoritatively evaluated; the 72^loop-count full candidate-domain product is not evaluated",
        maxFullCandidateDomainProduct: 72 ** input.graph.edges.filter((edge) => edge.sourceId === edge.targetId).length,
      },
    });
  };
  for (const [fixture, locale] of [["lighthouse", "en"], ["lighthouse", "ja"], ["titanic", "en"], ["titanic", "ja"]]) {
    const filename = fixture === "lighthouse" ? "lighthouse-restoration-demo" : "titanic-final-voyage";
    const original = JSON.parse(await readFile(`${EXAMPLES}/${filename}.${locale}.e2r.json`, "utf8"));
    const degree = new Map();
    for (const relation of original.relations) {
      degree.set(relation.sourceId, (degree.get(relation.sourceId) ?? 0) + 1);
      degree.set(relation.targetId, (degree.get(relation.targetId) ?? 0) + 1);
    }
    const ownerId = [...degree.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? original.entities[0].id;
    await makeCase(`canonical-${fixture}`, locale, datasetWithLoops(original, fixture, locale, ownerId, 2), ownerId);
  }
  for (const locale of ["en", "ja"]) for (const kind of ["isolated", "symmetric", "perturbed", "fanout"]) await makeCase(`synthetic-${kind}`, locale, syntheticDataset(kind, locale), "center");
  const allGroups = results.flatMap((result) => result.groups);
  const allSingle = results.flatMap((result) => result.singleLoop);
  const output = {
    contract: "SELF-LOOP-OWNER-LOCAL-FINALIST-RECALL-DEPENDENCY-REUSE-v1",
    diagnosticOnly: true,
    authority: {
      groundTruth: "current Product-authoritative render, final Relation-label placement, final Node-label placement, viewport guard, and ordinary-route churn",
      selfLoop: "Product-owned routeGraphEdge self-loop branch",
      noAuthorityTransfer: "Structural Placement, ordinary routing, final labels, endpoint plan, and Parallel / Incident architecture remain unchanged",
    },
    referenceBoundary: {
      singleLoop: "all 72 angle/radius candidates for each loop are evaluated authoritatively",
      ownerGroup: "all 6^loop-count combinations retained by the current per-loop cheap screen are evaluated authoritatively",
      excluded: "full 72^loop-count owner-group Cartesian product; it is recorded but not silently treated as ground truth",
    },
    recallDefinitions: {
      feasiblePlanRecall: "authoritative feasible plans captured by the current retained finalist set",
      bestAuthoritativePlanRecall: "authoritative rank-1 plan captured by the retained finalist set using the existing deterministic comparison",
      paretoFrontRecall: "authoritative non-dominated plans captured across feasibility, failure count, viewport, churn, clearance, and label-overlap dimensions",
      topNAuthoritativeQualityRecall: `authoritative top-${RECALL_TOP_K} plans captured by the retained finalist set`,
      falseNegative: "authoritative feasible or recall-target plan omitted from the current cheap-screen finalist set",
    },
    dependencyReuseDefinition: "A diagnostic owner-local projection reuses baseline ordinary routes, non-owner Self-loop routes, unaffected Relation labels, and non-owner Node labels, while replacing only owner-loop outputs and the owner Node label; eligibility requires exact equality with the full authoritative result.",
    method: {
      cases: "same 12 Lighthouse/Titanic EN/JA plus isolated, symmetric, perturbed, and four-loop fan-out controls",
      unchangedContract: { ordinaryClearancePx: HARD_ORDINARY_CLEARANCE, peerLoopClearancePx: HARD_PEER_CLEARANCE, labelClearancePx: HARD_LABEL_CLEARANCE, viewportMargin: VIEWPORT_MARGIN, ordinaryChurn: "candidate must not exceed current baseline churn" },
      currentScreen: `per-loop top-${GROUP_TOP_K} retained candidates followed by owner-local Cartesian screen and top-${RECALL_TOP_K} authoritative finalists`,
      fullReference: "all retained owner-local combinations are authoritatively evaluated; all single-loop domain candidates are authoritatively evaluated",
    },
    results,
    summary: {
      resultCount: results.length,
      singleLoopReferenceCount: allSingle.length,
      groupReferenceCount: allGroups.length,
      groupAuthoritativeReferenceProductCount: allGroups.reduce((sum, group) => sum + group.fullRetainedProductCount, 0),
      groupDependencyReuseEligibleCount: allGroups.reduce((sum, group) => sum + group.dependencyReuse.eligibleCount, 0),
      groupDependencyReuseEvaluatedCount: allGroups.reduce((sum, group) => sum + group.dependencyReuse.evaluatedCount, 0),
      groupFalseNegativeCount: allGroups.reduce((sum, group) => sum + group.recall.falseNegativeCount, 0),
      singleLoopFalseNegativeCount: allSingle.reduce((sum, loop) => sum + loop.falseNegativeFeasiblePlanCount, 0),
    },
  };
  await mkdir("experimental/self-loop-owner-local-recall-reuse", { recursive: true });
  await writeFile(RECALL_OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: RECALL_OUTPUT, summary: output.summary }, null, 2));
}

function failureClassKey(metricsValue) {
  return metricsValue.failures.join("+");
}

function selectRoundRobin(entries, bucketFor, limit) {
  const buckets = new Map();
  for (const entry of entries) {
    const key = bucketFor(entry);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort((left, right) => compareMetrics(left.metrics, right.metrics) || entriesKey(left.entries).localeCompare(entriesKey(right.entries)));
  const selected = [];
  while (selected.length < limit && [...buckets.values()].some((bucket) => bucket.length)) {
    for (const bucket of buckets.values()) {
      if (selected.length >= limit) break;
      const entry = bucket.shift();
      if (entry) selected.push(entry);
    }
  }
  return selected;
}

function pairwiseConflictSet(input, baseline, edges, local) {
  const conflicts = new Set();
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      for (const left of local[leftIndex]) for (const right of local[rightIndex]) {
        const entries = [
          { id: edges[leftIndex].id, candidate: left.candidate },
          { id: edges[rightIndex].id, candidate: right.candidate },
        ];
        const valueMetrics = metrics(screenRender(input, baseline, entries), baseline);
        if (!screenPass(valueMetrics)) conflicts.add(`${leftIndex}:${candidateKey(left.candidate)}|${rightIndex}:${candidateKey(right.candidate)}`);
      }
    }
  }
  return conflicts;
}

function pairwisePruningKeeps(entry, edges, conflicts) {
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      const key = `${leftIndex}:${candidateKey(entry.entries[leftIndex].candidate)}|${rightIndex}:${candidateKey(entry.entries[rightIndex].candidate)}`;
      if (conflicts.has(key)) return false;
    }
  }
  return true;
}

function incrementalPruningKeeps(input, baseline, entry) {
  for (let length = 1; length <= entry.entries.length; length += 1) {
    const valueMetrics = metrics(screenRender(input, baseline, entry.entries.slice(0, length)), baseline);
    if (!screenPass(valueMetrics)) return false;
  }
  return true;
}

function referenceClassRecall(selected, authoritative) {
  const selectedKeys = new Set(selected.map((entry) => entriesKey(entry.entries)));
  const classes = new Map();
  for (const entry of authoritative) {
    const key = failureClassKey(entry.metrics);
    if (!classes.has(key)) classes.set(key, entry);
  }
  const representatives = [...classes.values()];
  return {
    classCount: representatives.length,
    capturedCount: representatives.filter((entry) => selectedKeys.has(entriesKey(entry.entries))).length,
    recall: representatives.length ? Number((representatives.filter((entry) => selectedKeys.has(entriesKey(entry.entries))).length / representatives.length).toFixed(4)) : null,
  };
}

function summarizePruningSelection(name, selected, authoritative, reuseByKey) {
  const selectedKeys = new Set(selected.map((entry) => entry.key ?? entriesKey(entry.entries)));
  const feasible = authoritative.filter((entry) => isFeasible(entry.metrics));
  const pareto = paretoFront(authoritative);
  const topN = authoritative.slice(0, RECALL_TOP_K);
  const falseNegativeFeasible = feasible.filter((entry) => !selectedKeys.has(entry.key));
  const selectedReuse = selected.map((entry) => reuseByKey.get(entry.key ?? entriesKey(entry.entries))).filter(Boolean);
  const classRecall = referenceClassRecall(selected, authoritative);
  const recall = {
    feasiblePlanCount: feasible.length,
    feasiblePlanRecall: feasible.length ? Number((feasible.filter((entry) => selectedKeys.has(entry.key)).length / feasible.length).toFixed(4)) : null,
    bestAuthoritativePlanRecall: authoritative.length ? selectedKeys.has(authoritative[0].key) : null,
    paretoPlanCount: pareto.length,
    paretoFrontRecall: pareto.length ? Number((pareto.filter((entry) => selectedKeys.has(entry.key)).length / pareto.length).toFixed(4)) : null,
    topNAuthoritativeQualityRecall: topN.length ? Number((topN.filter((entry) => selectedKeys.has(entry.key)).length / topN.length).toFixed(4)) : null,
    failureClassRecall: classRecall.recall,
  };
  return {
    strategy: name,
    candidateCountBeforePruning: authoritative.length,
    retainedCandidateCount: selected.length,
    prunedCandidateCount: authoritative.length - selected.length,
    falseNegativeFeasiblePlanCount: falseNegativeFeasible.length,
    recall,
    falseNegativeGatePass: falseNegativeFeasible.length === 0 && recall.bestAuthoritativePlanRecall === true && recall.paretoFrontRecall === 1 && recall.failureClassRecall === 1,
    dependencyReuse: {
      evaluatedCount: selectedReuse.length,
      eligibleCount: selectedReuse.filter((value) => value.eligible).length,
      eligibleRate: selectedReuse.length ? Number((selectedReuse.filter((value) => value.eligible).length / selectedReuse.length).toFixed(4)) : null,
    },
  };
}

function evaluateFullDomainEntry(input, baseline, entries) {
  const value = render(input, overrideMap(entries));
  return { entries, key: entriesKey(entries), metrics: metrics(value, baseline) };
}

function runFullDomainReference(input, baseline, edges, currentFinalists) {
  const candidateCount = 72 ** edges.length;
  if (candidateCount > 5184) return {
    status: "not-evaluated-bounded-domain-too-large",
    candidateCount,
    reason: "72^loop-count exceeds the 5,184 authoritative reference budget; retained-product reference remains the applicable boundary",
  };
  const local = edges.map((edge) => candidatesFor(edge, "small-portfolio").map((candidate) => ({ id: edge.id, candidate })));
  const products = combinations(local);
  const startedAt = performance.now();
  const screened = products.map((entries) => ({ entries, metrics: metrics(screenRender(input, baseline, entries), baseline) }));
  screened.sort((left, right) => compareMetrics(left.metrics, right.metrics) || entriesKey(left.entries).localeCompare(entriesKey(right.entries)));
  const authoritative = products.map((entries) => evaluateFullDomainEntry(input, baseline, entries));
  authoritative.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.key.localeCompare(right.key));
  const selectedKeys = new Set(currentFinalists.map((entry) => entriesKey(entry.entries)));
  const feasible = authoritative.filter((entry) => isFeasible(entry.metrics));
  const pareto = paretoFront(authoritative);
  const topN = authoritative.slice(0, RECALL_TOP_K);
  return {
    status: "evaluated",
    candidateCount,
    currentFinalistCount: currentFinalists.length,
    authoritativeEvaluationCount: authoritative.length,
    feasiblePlanCount: feasible.length,
    currentFinalistFeasibleRecall: feasible.length ? Number((feasible.filter((entry) => selectedKeys.has(entry.key)).length / feasible.length).toFixed(4)) : null,
    currentFinalistBestRecall: authoritative.length ? selectedKeys.has(authoritative[0].key) : null,
    paretoPlanCount: pareto.length,
    currentFinalistParetoRecall: pareto.length ? Number((pareto.filter((entry) => selectedKeys.has(entry.key)).length / pareto.length).toFixed(4)) : null,
    currentFinalistTopNRecall: topN.length ? Number((topN.filter((entry) => selectedKeys.has(entry.key)).length / topN.length).toFixed(4)) : null,
    falseNegativeFeasiblePlanCount: feasible.filter((entry) => !selectedKeys.has(entry.key)).length,
    runtimeMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function runPruningGroup(input, baseline, edges) {
  const local = edges.map((edge) => screenCandidates(input, baseline, edge, "small-portfolio").screened.slice(0, GROUP_TOP_K));
  const products = combinations(local);
  const screened = products.map((entries) => ({
    entries: entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate })),
    metrics: metrics(screenRender(input, baseline, entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))), baseline),
  }));
  screened.sort((left, right) => compareMetrics(left.metrics, right.metrics) || entriesKey(left.entries).localeCompare(entriesKey(right.entries)));
  const authoritative = products.map((entries) => evaluateAuthoritativeEntry(input, baseline, entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))));
  authoritative.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.key.localeCompare(right.key));
  const reuseByKey = new Map(authoritative.map((entry) => [entry.key, dependencyReuseResult(baseline, entry.value, edges[0].sourceId, edges)]));
  const conflicts = pairwiseConflictSet(input, baseline, edges, local);
  const strategies = new Map();
  strategies.set("current-top24", screened.slice(0, RECALL_TOP_K));
  strategies.set("screen-pass-all", screened.filter((entry) => screenPass(entry.metrics)));
  strategies.set("pairwise-hard-conflict-pruned", screened.filter((entry) => pairwisePruningKeeps(entry, edges, conflicts)));
  strategies.set("incremental-hard-screen-pruned", screened.filter((entry) => incrementalPruningKeeps(input, baseline, entry)));
  strategies.set("cheap-pareto-top24", paretoFront(screened).sort((left, right) => compareMetrics(left.metrics, right.metrics) || entriesKey(left.entries).localeCompare(entriesKey(right.entries))).slice(0, RECALL_TOP_K));
  strategies.set("failure-class-diverse-top24", selectRoundRobin(screened, (entry) => failureClassKey(entry.metrics), RECALL_TOP_K));
  strategies.set("orientation-radius-diverse-top24", selectRoundRobin(screened, (entry) => entry.entries.map(({ candidate }) => `${Math.round(candidate.orientation / (Math.PI / 4))}:${candidate.radius}`).join("|"), RECALL_TOP_K));
  const currentFinalists = strategies.get("current-top24");
  return {
    ownerId: edges[0].sourceId,
    loopCount: edges.length,
    retainedProductCount: products.length,
    fullDomainProductCount: 72 ** edges.length,
    reference: {
      authoritativeEvaluationCount: authoritative.length,
      feasiblePlanCount: authoritative.filter((entry) => isFeasible(entry.metrics)).length,
      paretoPlanCount: paretoFront(authoritative).length,
    },
    strategies: [...strategies.entries()].map(([name, selected]) => summarizePruningSelection(name, selected, authoritative, reuseByKey)),
    fullDomainReference: runFullDomainReference(input, baseline, edges, currentFinalists),
    pairwiseConflictCount: conflicts.size,
    fingerprint: {
      routing: "owner-local projection requires unchanged ordinary and non-owner Self-loop route geometry plus occupied-path arbitration semantics",
      relationLabels: "unaffected Relation-label geometry and obstacle ordering must remain equal",
      nodeLabels: "non-owner Node-label geometry and occupied Relation-label inputs must remain equal",
      viewport: "positions and fit inputs must remain equal",
      semanticGuard: "full routedEdges, Relation-label map, Node-label map, viewport result, feasibility class, and ordinary churn must match",
    },
  };
}

async function runPruningFingerprintStudy() {
  const results = [];
  const makeCase = async (name, locale, dataset, ownerId) => {
    const positions = positionsFor(dataset);
    const input = makeInput(dataset, positions);
    const baseline = render(input, {});
    const loopGroups = new Map();
    for (const edge of input.graph.edges.filter((candidate) => candidate.sourceId === candidate.targetId)) {
      const group = loopGroups.get(edge.sourceId) ?? [];
      group.push(edge);
      loopGroups.set(edge.sourceId, group);
    }
    results.push({ name, locale, ownerId, graph: { nodes: input.graph.nodes.length, edges: input.graph.edges.length, loops: input.graph.edges.filter((edge) => edge.sourceId === edge.targetId).length }, groups: [...loopGroups.values()].map((edges) => runPruningGroup(input, baseline, edges)) });
  };
  for (const [fixture, locale] of [["lighthouse", "en"], ["lighthouse", "ja"], ["titanic", "en"], ["titanic", "ja"]]) {
    const filename = fixture === "lighthouse" ? "lighthouse-restoration-demo" : "titanic-final-voyage";
    const original = JSON.parse(await readFile(`${EXAMPLES}/${filename}.${locale}.e2r.json`, "utf8"));
    const degree = new Map();
    for (const relation of original.relations) {
      degree.set(relation.sourceId, (degree.get(relation.sourceId) ?? 0) + 1);
      degree.set(relation.targetId, (degree.get(relation.targetId) ?? 0) + 1);
    }
    const ownerId = [...degree.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? original.entities[0].id;
    await makeCase(`canonical-${fixture}`, locale, datasetWithLoops(original, fixture, locale, ownerId, 2), ownerId);
  }
  for (const locale of ["en", "ja"]) for (const kind of ["isolated", "symmetric", "perturbed", "fanout"]) await makeCase(`synthetic-${kind}`, locale, syntheticDataset(kind, locale), "center");
  const strategies = results.flatMap((result) => result.groups.flatMap((group) => group.strategies));
  const output = {
    contract: "SELF-LOOP-OWNER-LOCAL-RECALL-AWARE-PRUNING-DEPENDENCY-FINGERPRINT-v1",
    diagnosticOnly: true,
    correction: {
      previousDisplayedSingleLoopFalseNegativeCount: 24,
      correctedSingleLoopFalseNegativeCount: 30,
      reason: "previous artifact stored only up to 12 displayed false-negative examples per loop and aggregated example-array length rather than total count",
      displayedExamplesRemainCapped: 12,
    },
    referenceBoundary: {
      retainedProduct: "all 6^loop-count current retained combinations are authoritative ground truth for pruning comparison",
      fullDomain: "72^loop-count full owner-group reference is evaluated only when it is <= 5,184; larger cases are explicitly not evaluated",
      singleLoop: "all 72 angle/radius candidates remain the single-loop reference",
    },
    pruningStrategies: [
      "current-top24",
      "screen-pass-all",
      "pairwise-hard-conflict-pruned",
      "incremental-hard-screen-pruned",
      "cheap-pareto-top24",
      "failure-class-diverse-top24",
      "orientation-radius-diverse-top24",
    ],
    falseNegativeGate: "PASS only when all authoritative feasible plans, the best plan, the full authoritative Pareto front, and one representative of every failure class are retained within the stated reference boundary",
    dependencyFingerprint: "stage-specific routing, Relation-label, Node-label, viewport, and semantic-equivalence dependencies; no single opaque global cache key",
    results,
    summary: {
      resultCount: results.length,
      groupCount: results.reduce((sum, result) => sum + result.groups.length, 0),
      retainedReferenceAuthoritativeEvaluations: results.reduce((sum, result) => sum + result.groups.reduce((groupSum, group) => groupSum + group.reference.authoritativeEvaluationCount, 0), 0),
      strategiesPassingFalseNegativeGate: strategies.filter((strategy) => strategy.falseNegativeGatePass).length,
      strategiesEvaluated: strategies.length,
      fullDomainEvaluatedGroupCount: results.reduce((sum, result) => sum + result.groups.filter((group) => group.fullDomainReference.status === "evaluated").length, 0),
      fullDomainSkippedGroupCount: results.reduce((sum, result) => sum + result.groups.filter((group) => group.fullDomainReference.status !== "evaluated").length, 0),
    },
  };
  await mkdir("experimental/self-loop-owner-local-pruning-fingerprint", { recursive: true });
  await writeFile("experimental/self-loop-owner-local-pruning-fingerprint/audit.json", `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: "experimental/self-loop-owner-local-pruning-fingerprint/audit.json", summary: output.summary }, null, 2));
}

if (process.argv.includes("--prune-fingerprint")) await runPruningFingerprintStudy();
else if (process.argv.includes("--recall-reuse")) await runRecallReuseStudy();
else await runCapacityAudit();

function recordPhase(timing, scope, phase, elapsedMs) {
  if (!timing) return;
  const scopeRecord = timing.scopes[scope] ??= {};
  const phaseRecord = scopeRecord[phase] ??= { calls: 0, totalMs: 0 };
  phaseRecord.calls += 1;
  phaseRecord.totalMs += elapsedMs;
}

function timed(timing, scope, phase, callback) {
  const startedAt = performance.now();
  try {
    return callback();
  } finally {
    recordPhase(timing, scope, phase, performance.now() - startedAt);
  }
}

function timingSnapshot(timing) {
  return Object.fromEntries(Object.entries(timing?.scopes ?? {}).map(([scope, phases]) => [
    scope,
    Object.fromEntries(Object.entries(phases).map(([phase, value]) => [phase, {
      calls: value.calls,
      totalMs: Number(value.totalMs.toFixed(2)),
    }])),
  ]));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function flattenTiming(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).flatMap(([scope, phases]) => Object.entries(phases).map(([phase, value]) => [
    `${scope}.${phase}`,
    value,
  ])));
}

function summarizeRuntime(warmupMs, measuredRuns) {
  const elapsed = measuredRuns.map((run) => run.elapsedMs);
  const phaseValues = new Map();
  for (const run of measuredRuns) {
    for (const [key, value] of Object.entries(flattenTiming(run.timing))) {
      const values = phaseValues.get(key) ?? [];
      values.push(value.totalMs);
      phaseValues.set(key, values);
    }
  }
  const phaseMedianMs = Object.fromEntries([...phaseValues.entries()].map(([key, values]) => [key, Number(median(values).toFixed(2))]));
  const phaseP95Ms = Object.fromEntries([...phaseValues.entries()].map(([key, values]) => [key, Number(percentile(values, 0.95).toFixed(2))]));
  const phaseCalls = measuredRuns[0]?.timing ? Object.fromEntries(Object.entries(flattenTiming(measuredRuns[0].timing)).map(([key, value]) => [key, value.calls])) : {};
  return {
    warmupMs: Number(warmupMs.toFixed(2)),
    measuredRuns: elapsed.map((value) => Number(value.toFixed(2))),
    medianMs: Number(median(elapsed).toFixed(2)),
    p95Ms: Number(percentile(elapsed, 0.95).toFixed(2)),
    phaseMedianMs,
    phaseP95Ms,
    phaseCalls,
  };
}

function measureRuntime(execute) {
  const warmupTiming = createTiming();
  const warmupStartedAt = performance.now();
  const result = execute(warmupTiming);
  const warmupMs = performance.now() - warmupStartedAt;
  const measuredRuns = Array.from({ length: RUNTIME_MEASURED_RUNS }, () => {
    const timing = createTiming();
    const startedAt = performance.now();
    execute(timing);
    return { elapsedMs: performance.now() - startedAt, timing: timingSnapshot(timing) };
  });
  return { result, runtime: summarizeRuntime(warmupMs, measuredRuns) };
}

function baseRadius(edge) {
  return 38 + Math.floor(edge.parallelIndex / 3) * 14;
}

function preferredAngle(edge) {
  return -Math.PI / 2 + edge.parallelIndex % 3 * Math.PI * 2 / 3;
}

function candidatesFor(edge, radiusMode) {
  const radii = radiusMode === "small-portfolio" ? [baseRadius(edge), baseRadius(edge) + RADIUS_DELTA] : [baseRadius(edge)];
  return radii.flatMap((radius) => Array.from({ length: ANGLE_COUNT }, (_, index) => ({
    orientation: preferredAngle(edge) + (index <= 18 ? index : index - 36) * ANGLE_STEP,
    radius,
  })));
}

function datasetWithLoops(dataset, name, locale, ownerId, count) {
  const labels = locale === "ja"
    ? ["自己関係を確認する長い日本語ラベル", "自己関係を調整する長い日本語ラベル", "自己関係の履歴を表示する長い日本語ラベル", "自己関係の状態を同期する長い日本語ラベル"]
    : ["self monitors the long restoration relationship", "self calibrates the long restoration relationship", "self records the long restoration relationship", "self synchronizes the long restoration relationship"];
  return {
    ...dataset,
    entities: dataset.entities.map((entity) => ({ ...entity })),
    relations: [...dataset.relations, ...Array.from({ length: count }, (_, index) => ({
      id: `${name}-capacity-self-${index + 1}`,
      sourceId: ownerId,
      targetId: ownerId,
      name: labels[index % labels.length],
    }))],
  };
}

function syntheticDataset(kind, locale) {
  const long = locale === "ja" ? "自己関係を確認する長い日本語ラベル" : "self relation with a deliberately long English label";
  const neighbors = kind === "isolated"
    ? []
    : kind === "symmetric"
      ? [{ id: "north", x: 0, y: -180 }, { id: "east", x: 180, y: 0 }, { id: "south", x: 0, y: 180 }, { id: "west", x: -180, y: 0 }]
      : kind === "perturbed"
        ? [{ id: "north", x: 20, y: -170 }, { id: "east", x: 220, y: 30 }, { id: "south", x: -20, y: 190 }, { id: "obstacle", x: 12, y: -92 }]
        : [{ id: "north", x: 0, y: -170 }, { id: "east", x: 220, y: 24 }, { id: "south", x: 0, y: 190 }, { id: "west", x: -170, y: 48 }];
  return {
    version: "1.0",
    entities: [{ id: "center", name: locale === "ja" ? "中心ノード" : "Center", description: locale === "ja" ? "長い中心ノードの説明" : "A central node with long presentation text", x: 0, y: 0 }, ...neighbors.map((node) => ({ id: node.id, name: node.id, x: node.x, y: node.y }))],
    events: [],
    relations: [
      ...neighbors.filter(({ id }) => id !== "obstacle").map(({ id }) => ({ id: `edge-center-${id}`, sourceId: "center", targetId: id, name: id === "east" ? long : `to ${id}` })),
      { id: "loop-1", sourceId: "center", targetId: "center", name: long },
      { id: "loop-2", sourceId: "center", targetId: "center", name: locale === "ja" ? "自己関係の状態を同期する日本語ラベル" : "self relation calibrates another long label" },
      ...(kind === "fanout" ? [
        { id: "loop-3", sourceId: "center", targetId: "center", name: "third self relation" },
        { id: "loop-4", sourceId: "center", targetId: "center", name: "fourth self relation" },
      ] : []),
    ],
  };
}

function positionsFor(dataset) {
  const explicit = Object.fromEntries(dataset.entities.filter((entity) => Number.isFinite(entity.x) && Number.isFinite(entity.y)).map((entity) => [entity.id, { x: entity.x, y: entity.y }]));
  if (Object.keys(explicit).length === dataset.entities.length) return explicit;
  return settleInitialPlacement({
    entities: dataset.entities.map(({ id }) => ({ id })),
    relations: dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
  });
}

function makeInput(dataset, positions) {
  const graph = buildEntityGraph(dataset);
  const nodes = graph.nodes.map((node) => ({ ...node, ...positions[node.id] }));
  const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const points = Object.values(positions);
  const provisionalNodeLabels = nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], points.filter((point) => point !== positions[node.id]), [],
  ));
  return { graph: { nodes, edges }, positions, provisionalNodeLabels };
}

function render(input, overrides, timing, scope = "authoritative") {
  const { graph, positions, provisionalNodeLabels } = input;
  const startedAt = performance.now();
  const routedEdges = timed(timing, scope, "routingOccupiedPathArbitration", () => deriveAutomaticRoutes({
    graph, positions, edgeCurveOffsets: {}, selfLoopOverrides: overrides,
    provisionalNodeLabels,
  }));
  const relationLabels = timed(timing, scope, "finalRelationLabelRecomputation", () => deriveAutomaticRelationLabels({
    routedEdges, nodes: Object.values(positions), previousPlacements: new Map(), manualAnchors: new Map(),
  }));
  const nodeLabels = timed(timing, scope, "finalNodeLabelRecomputation", () => deriveAutomaticNodeLabels({
    nodes: graph.nodes, positions, routedEdges, occupiedRelationLabels: relationLabels,
    previousPlacements: new Map(), manualOffsets: new Map(),
  }));
  recordPhase(timing, scope, "productRenderEvaluation", performance.now() - startedAt);
  return { ...input, routedEdges, relationLabels, nodeLabels };
}

function screenRender(input, baseline, entries) {
  const selected = new Map(entries.map(({ id, candidate }) => [id, candidate]));
  const routedEdges = baseline.routedEdges.map((edge) => {
    const candidate = selected.get(edge.id);
    if (!candidate || edge.sourceId !== edge.targetId) return edge;
    const owner = input.positions[edge.sourceId];
    return {
      ...edge,
      ...routeGraphEdge(owner, owner, edge.parallelIndex, edge.parallelCount, [], [], true, 0, undefined, candidate),
    };
  });
  return { ...baseline, routedEdges };
}

function viewportMetrics(value, timing, scope) {
  const startedAt = performance.now();
  const fit = fitGraphView(Object.values(value.positions), 960, 640);
  const points = [];
  for (const edge of value.routedEdges) points.push(...edge.samples);
  for (const label of value.relationLabels.values()) points.push({ x: label.x - label.width / 2, y: label.y - label.height / 2 }, { x: label.x + label.width / 2, y: label.y + label.height / 2 });
  for (const label of value.nodeLabels.values()) points.push({ x: label.x - label.width / 2, y: label.y - label.height / 2 }, { x: label.x + label.width / 2, y: label.y + label.height / 2 });
  const transformed = points.map((point) => ({ x: point.x * fit.scale + fit.pan.x, y: point.y * fit.scale + fit.pan.y }));
  const result = {
    outsideCount: transformed.filter(({ x, y }) => x < VIEWPORT_MARGIN || x > 960 - VIEWPORT_MARGIN || y < VIEWPORT_MARGIN || y > 640 - VIEWPORT_MARGIN).length,
    fitScale: finiteOrNull(fit.scale, 4),
  };
  recordPhase(timing, scope, "viewportFitEvaluation", performance.now() - startedAt);
  return result;
}

function metrics(value, baseline, timing, scope = "authoritative") {
  const startedAt = performance.now();
  const loops = value.graph.edges.filter((edge) => edge.sourceId === edge.targetId);
  const ordinary = value.routedEdges.filter((edge) => edge.sourceId !== edge.targetId);
  const loopRoutes = value.routedEdges.filter((edge) => edge.sourceId === edge.targetId);
  const rows = loops.map((edge) => {
    const route = value.routedEdges.find((candidate) => candidate.id === edge.id);
    const owner = value.positions[edge.sourceId];
    const inner = route.samples.slice(4, -4);
    const ordinarySamples = ordinary.flatMap((candidate) => candidate.samples);
    const peerSamples = loopRoutes.filter((candidate) => candidate.id !== edge.id).flatMap((candidate) => candidate.samples);
    const label = value.relationLabels.get(edge.id);
    const ownerLabel = value.nodeLabels.get(edge.sourceId);
    const otherRelationLabels = [...value.relationLabels.entries()].filter(([id]) => id !== edge.id).map(([, candidate]) => candidate);
    const labelToOther = otherRelationLabels.length && label ? Math.min(...otherRelationLabels.map((candidate) => Math.hypot(label.x - candidate.x, label.y - candidate.y) - (label.width + candidate.width) / 2)) : Infinity;
    const incidentAngles = value.graph.edges.filter((candidate) => candidate.sourceId !== candidate.targetId && (candidate.sourceId === edge.sourceId || candidate.targetId === edge.sourceId)).map((candidate) => {
      const otherId = candidate.sourceId === edge.sourceId ? candidate.targetId : candidate.sourceId;
      const other = value.positions[otherId];
      return Math.atan2(other.y - owner.y, other.x - owner.x);
    });
    const orientation = Math.atan2(route.controlPoint.y - owner.y, route.controlPoint.x - owner.x);
    const ordinaryClearance = minDistance(inner, ordinarySamples);
    const peerClearance = minDistance(inner, peerSamples);
    const labelOrdinaryClearance = label ? minimumPathToLabelRectDistance(ordinarySamples, label) : Infinity;
    const ownerNodeLabelClearance = ownerLabel ? minimumPathToLabelRectDistance(inner, ownerLabel) : Infinity;
    const labelNodeOverlap = label && ownerLabel ? rectOverlap(label, ownerLabel) : 0;
    const incidentGap = incidentAngles.length ? Math.min(...incidentAngles.map((angle) => angleDistance(angle, orientation))) : Math.PI;
    const path = route.path.match(/\sA\s([0-9.]+)/u);
    return {
      id: edge.id,
      orientationDeg: finiteOrNull(orientation * 180 / Math.PI),
      radius: finiteOrNull(Number.parseFloat(path?.[1] ?? "")),
      ordinaryClearance: finiteOrNull(ordinaryClearance),
      peerLoopClearance: finiteOrNull(peerClearance),
      incidentAngularGapDeg: finiteOrNull(incidentGap * 180 / Math.PI),
      ownerNodeLabelClearance: finiteOrNull(ownerNodeLabelClearance),
      relationLabelOrdinaryClearance: finiteOrNull(labelOrdinaryClearance),
      relationLabelOtherGap: finiteOrNull(labelToOther),
      relationLabelNodeOverlap: finiteOrNull(labelNodeOverlap),
    };
  });
  const ordinaryChurn = baseline ? ordinary.filter((edge) => edge.path !== baseline.routedEdges.find((candidate) => candidate.id === edge.id)?.path).length : 0;
  const viewport = viewportMetrics(value, timing, scope);
  const failures = new Set();
  for (const row of rows) {
    if ((row.ordinaryClearance ?? Infinity) < HARD_ORDINARY_CLEARANCE) failures.add("ordinary-corridor-conflict");
    if ((row.peerLoopClearance ?? Infinity) < HARD_PEER_CLEARANCE) failures.add("peer-loop-conflict");
    if ((row.ownerNodeLabelClearance ?? Infinity) < HARD_LABEL_CLEARANCE || (row.relationLabelOrdinaryClearance ?? Infinity) < HARD_LABEL_CLEARANCE || (row.relationLabelOtherGap ?? Infinity) < HARD_LABEL_CLEARANCE || (row.relationLabelNodeOverlap ?? 0) > 0) failures.add("label-envelope-conflict");
  }
  if (viewport.outsideCount > 0) failures.add("viewport-capacity-shortage");
  if (baseline && ordinaryChurn > baseline.ordinaryChurn) failures.add("ordinary-route-churn");
  if (!failures.size) failures.add("feasible");
  const result = { rows, ordinaryChurn, viewport, failures: [...failures].sort() };
  recordPhase(timing, scope, "metricEvaluation", performance.now() - startedAt);
  return result;
}

function rank(metricsValue) {
  const severity = metricsValue.failures.filter((failure) => failure !== "feasible").length;
  const values = metricsValue.rows.flatMap((row) => [row.ordinaryClearance ?? -Infinity, row.peerLoopClearance ?? -Infinity, row.ownerNodeLabelClearance ?? -Infinity, row.relationLabelOrdinaryClearance ?? -Infinity]);
  return [severity, metricsValue.ordinaryChurn, ...values.map((value) => -value)];
}

function compareMetrics(left, right) {
  const a = rank(left);
  const b = rank(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return JSON.stringify(left.rows).localeCompare(JSON.stringify(right.rows));
}

function screenPass(metricsValue) {
  return !metricsValue.failures.includes("ordinary-corridor-conflict")
    && !metricsValue.failures.includes("peer-loop-conflict")
    && !metricsValue.failures.includes("viewport-capacity-shortage");
}

function overrideMap(entries) {
  return Object.fromEntries(entries.map(({ id, candidate }) => [id, { orientation: candidate.orientation, radius: candidate.radius }]));
}

function screenCandidates(input, baseline, edge, radiusMode, timing) {
  const candidates = timed(timing, "candidate-generation", "candidateGeneration", () => candidatesFor(edge, radiusMode));
  const screenStartedAt = performance.now();
  const screened = candidates.map((candidate) => ({
    candidate,
    metrics: metrics(screenRender(input, baseline, [{ id: edge.id, candidate }]), baseline, timing, "cheap-screen"),
  }));
  screened.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.candidate.orientation - right.candidate.orientation || left.candidate.radius - right.candidate.radius);
  recordPhase(timing, "cheap-screen", "cheapScreening", performance.now() - screenStartedAt);
  return { candidates, screened };
}

function evaluateCandidates(input, baseline, edge, radiusMode, timing) {
  const { candidates, screened } = screenCandidates(input, baseline, edge, radiusMode, timing);
  const retained = screened.slice(0, AUTHORITATIVE_TOP_K);
  const evaluated = timed(timing, "authoritative", "productAuthoritativeFinalistEvaluation", () => retained.map(({ candidate }) => {
    const value = render(input, { [edge.id]: candidate }, timing, "authoritative");
    return { candidate, metrics: metrics(value, baseline, timing, "authoritative") };
  }));
  evaluated.sort((left, right) => compareMetrics(left.metrics, right.metrics) || left.candidate.orientation - right.candidate.orientation || left.candidate.radius - right.candidate.radius);
  return {
    evaluated,
    selected: evaluated[0],
    candidateCount: candidates.length,
    screenFeasibleCandidateCount: screened.filter(({ metrics: candidateMetrics }) => screenPass(candidateMetrics)).length,
    authoritativeEvaluationCount: retained.length,
  };
}

function chooseIndependent(input, baseline, radiusMode, timing) {
  const loops = input.graph.edges.filter((edge) => edge.sourceId === edge.targetId);
  const selected = [];
  let candidateCount = 0;
  let feasibleCandidateCount = 0;
  let screenFeasibleCandidateCount = 0;
  let authoritativeEvaluationCount = 0;
  const loopStats = [];
  for (const edge of loops) {
    const result = evaluateCandidates(input, baseline, edge, radiusMode, timing);
    candidateCount += result.candidateCount;
    feasibleCandidateCount += result.evaluated.filter(({ metrics: candidateMetrics }) => candidateMetrics.failures.length === 1 && candidateMetrics.failures[0] === "feasible").length;
    screenFeasibleCandidateCount += result.screenFeasibleCandidateCount;
    authoritativeEvaluationCount += result.authoritativeEvaluationCount;
    loopStats.push({ id: edge.id, candidateCount: result.candidateCount, screenFeasibleCandidateCount: result.screenFeasibleCandidateCount, authoritativeEvaluationCount: result.authoritativeEvaluationCount, feasibleCandidateCount: result.evaluated.filter(({ metrics: candidateMetrics }) => candidateMetrics.failures.length === 1 && candidateMetrics.failures[0] === "feasible").length, selectedFailures: result.selected.metrics.failures });
    selected.push({ id: edge.id, candidate: result.selected.candidate });
  }
  const value = render(input, overrideMap(selected), timing, "selected-final");
  const selectedMetrics = metrics(value, baseline, timing, "selected-final");
  return { value, metrics: selectedMetrics, candidateCount, feasibleCandidateCount, screenFeasibleCandidateCount, authoritativeEvaluationCount, loopStats, fallback: selected.length > 0 && !selectedMetrics.failures.includes("feasible") ? "diagnostic-best-non-feasible" : null };
}

function combinations(items) {
  if (!items.length) return [[]];
  const [first, ...rest] = items;
  return first.flatMap((item) => combinations(rest).map((tail) => [item, ...tail]));
}

function chooseOwnerGroup(input, baseline, edges, radiusMode, timing) {
  if (edges.length <= 1) return chooseIndependent(input, baseline, radiusMode, timing);
  const local = edges.map((edge) => screenCandidates(input, baseline, edge, radiusMode, timing).screened.slice(0, GROUP_TOP_K));
  const products = timed(timing, "owner-local", "ownerLocalCombinationEnumeration", () => combinations(local));
  const groupScreenStartedAt = performance.now();
  const screened = products.map((entries) => ({
    entries,
    metrics: metrics(screenRender(input, baseline, entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))), baseline, timing, "cheap-screen"),
  }));
  screened.sort((left, right) => compareMetrics(left.metrics, right.metrics) || JSON.stringify(left.entries).localeCompare(JSON.stringify(right.entries)));
  recordPhase(timing, "cheap-screen", "ownerGroupCheapScreening", performance.now() - groupScreenStartedAt);
  const evaluated = timed(timing, "authoritative", "productAuthoritativeFinalistEvaluation", () => screened.slice(0, GROUP_AUTHORITATIVE_LIMIT).map(({ entries }) => {
    const value = render(input, overrideMap(entries.map(({ candidate }, index) => ({ id: edges[index].id, candidate }))), timing, "authoritative");
    return { entries, value, metrics: metrics(value, baseline, timing, "authoritative") };
  }));
  evaluated.sort((left, right) => compareMetrics(left.metrics, right.metrics) || JSON.stringify(left.entries).localeCompare(JSON.stringify(right.entries)));
  const selected = evaluated[0];
  return { value: selected.value, metrics: selected.metrics, candidateCount: products.length, screenFeasibleCandidateCount: screened.filter(({ metrics: candidateMetrics }) => screenPass(candidateMetrics)).length, authoritativeEvaluationCount: evaluated.length, feasibleCandidateCount: evaluated.filter(({ metrics: candidateMetrics }) => candidateMetrics.failures.length === 1 && candidateMetrics.failures[0] === "feasible").length, groupTopK: GROUP_TOP_K, fallback: selected.metrics.failures.includes("feasible") ? null : "diagnostic-best-non-feasible", loopStats: edges.map((edge) => ({ id: edge.id, candidateCount: ANGLE_COUNT * (radiusMode === "small-portfolio" ? 2 : 1), feasibleCandidateCount: null, selectedFailures: selected.metrics.failures })) };
}

function chooseGroupAllocation(input, baseline, timing) {
  const loopGroups = new Map();
  for (const edge of input.graph.edges.filter((candidate) => candidate.sourceId === candidate.targetId)) {
    const group = loopGroups.get(edge.sourceId) ?? [];
    group.push(edge);
    loopGroups.set(edge.sourceId, group);
  }
  const selections = [];
  let candidateCount = 0;
  let feasibleCandidateCount = 0;
  let screenFeasibleCandidateCount = 0;
  let authoritativeEvaluationCount = 0;
  const groups = [];
  for (const edges of loopGroups.values()) {
    const result = chooseOwnerGroup(input, baseline, edges, "small-portfolio", timing);
    const overrides = Object.entries(result.value.graph.edges.length ? Object.fromEntries(edges.map((edge) => [edge.id, result.value.routedEdges.find((route) => route.id === edge.id)])) : {}).map(([id, route]) => ({ id, candidate: { orientation: Math.atan2(route.controlPoint.y - input.positions[edges.find((edge) => edge.id === id).sourceId].y, route.controlPoint.x - input.positions[edges.find((edge) => edge.id === id).sourceId].x), radius: Number.parseFloat(route.path.match(/\sA\s([0-9.]+)/u)?.[1] ?? "0") } }));
    selections.push(...overrides);
    candidateCount += result.candidateCount;
    feasibleCandidateCount += result.feasibleCandidateCount ?? 0;
    screenFeasibleCandidateCount += result.screenFeasibleCandidateCount ?? 0;
    authoritativeEvaluationCount += result.authoritativeEvaluationCount ?? 0;
    groups.push({ ownerId: edges[0].sourceId, loopCount: edges.length, candidateCount: result.candidateCount, screenFeasibleCandidateCount: result.screenFeasibleCandidateCount, authoritativeEvaluationCount: result.authoritativeEvaluationCount, feasibleCandidateCount: result.feasibleCandidateCount, fallback: result.fallback });
  }
  const value = render(input, overrideMap(selections), timing, "selected-final");
  const selectedMetrics = metrics(value, baseline, timing, "selected-final");
  return { value, metrics: selectedMetrics, candidateCount, feasibleCandidateCount, screenFeasibleCandidateCount, authoritativeEvaluationCount, groups, fallback: selectedMetrics.failures.includes("feasible") ? null : "diagnostic-best-non-feasible" };
}

function summarizeArm(name, result, runtime) {
  return {
    arm: name,
    classification: result.metrics.failures.length === 1 && result.metrics.failures[0] === "feasible" ? "feasible" : result.metrics.failures,
    acceptedAllocation: result.metrics.failures.length === 1 && result.metrics.failures[0] === "feasible",
    diagnosticFallback: result.fallback ?? null,
    candidateCount: result.candidateCount,
    feasibleCandidateCount: result.feasibleCandidateCount,
    screenFeasibleCandidateCount: result.screenFeasibleCandidateCount,
    authoritativeEvaluationCount: result.authoritativeEvaluationCount,
    elapsedMs: runtime.medianMs,
    runtime,
    ordinaryRouteChurn: result.metrics.ordinaryChurn,
    viewport: result.metrics.viewport,
    loops: result.metrics.rows,
    loopStats: result.loopStats,
    groups: result.groups,
  };
}

function runCase(name, locale, dataset) {
  const positions = positionsFor(dataset);
  const input = makeInput(dataset, positions);
  const baselineMeasurement = measureRuntime((timing) => {
    const value = render(input, {}, timing, "baseline");
    const baselineMetrics = metrics(value, null, timing, "baseline");
    baselineMetrics.ordinaryChurn = 0;
    return { value, metrics: baselineMetrics };
  });
  const baseline = baselineMeasurement.result.value;
  const baselineMetrics = baselineMeasurement.result.metrics;
  const angleMeasurement = measureRuntime((timing) => chooseIndependent(input, baseline, "base-only", timing));
  const radiusMeasurement = measureRuntime((timing) => chooseIndependent(input, baseline, "small-portfolio", timing));
  const groupMeasurement = measureRuntime((timing) => chooseGroupAllocation(input, baseline, timing));
  const angle = angleMeasurement.result;
  const angleRadius = radiusMeasurement.result;
  const group = groupMeasurement.result;
  const repeat = render(input, {});
  return {
    name,
    locale,
    graph: { nodes: input.graph.nodes.length, edges: input.graph.edges.length, loops: input.graph.edges.filter((edge) => edge.sourceId === edge.targetId).length, ordinary: input.graph.edges.filter((edge) => edge.sourceId !== edge.targetId).length },
    baseline: {
      ordinaryRouteChurn: baselineMetrics.ordinaryChurn,
      loops: baselineMetrics.rows,
      failures: baselineMetrics.failures,
      elapsedMs: baselineMeasurement.runtime.medianMs,
      runtime: baselineMeasurement.runtime,
    },
    arms: [
      summarizeArm("angle-only-independent", angle, angleMeasurement.runtime),
      summarizeArm("angle-plus-small-radius-independent", angleRadius, radiusMeasurement.runtime),
      summarizeArm("owner-group-bounded-allocation", group, groupMeasurement.runtime),
    ],
    deterministicBaseline: JSON.stringify(baseline.routedEdges) === JSON.stringify(repeat.routedEdges) && JSON.stringify([...baseline.relationLabels]) === JSON.stringify([...repeat.relationLabels]),
  };
}

async function runCapacityAudit() {
const results = [];
for (const [fixture, locale] of [["lighthouse", "en"], ["lighthouse", "ja"], ["titanic", "en"], ["titanic", "ja"]]) {
  const filename = fixture === "lighthouse" ? "lighthouse-restoration-demo" : "titanic-final-voyage";
  const original = JSON.parse(await readFile(`${EXAMPLES}/${filename}.${locale}.e2r.json`, "utf8"));
  const degree = new Map();
  for (const relation of original.relations) {
    degree.set(relation.sourceId, (degree.get(relation.sourceId) ?? 0) + 1);
    degree.set(relation.targetId, (degree.get(relation.targetId) ?? 0) + 1);
  }
  const ownerId = [...degree.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? original.entities[0].id;
  results.push(runCase(`canonical-${fixture}`, locale, datasetWithLoops(original, fixture, locale, ownerId, 2)));
}
for (const locale of ["en", "ja"]) for (const kind of ["isolated", "symmetric", "perturbed", "fanout"]) results.push(runCase(`synthetic-${kind}`, locale, syntheticDataset(kind, locale)));

const allArms = results.flatMap((result) => result.arms);
const output = {
  contract: "SELF-LOOP-LOCAL-CAPACITY-ALLOCATION-v1",
  diagnosticOnly: true,
  authority: {
    candidateProbe: "diagnostic only; no production selector change",
    selfLoop: "Product-owned routeGraphEdge self-loop branch",
    ordinaryRouting: "Product-owned deriveAutomaticRoutes / occupied-path arbitration",
    relationLabels: "Product-owned deriveAutomaticRelationLabels",
    nodeLabels: "Product-owned deriveAutomaticNodeLabels",
    structuralPlacement: "fixed positions or production seed only",
  },
  hardContract: {
    ordinaryClearancePx: HARD_ORDINARY_CLEARANCE,
    peerLoopClearancePx: HARD_PEER_CLEARANCE,
    labelClearancePx: HARD_LABEL_CLEARANCE,
    viewportMarginPx: VIEWPORT_MARGIN,
    ordinaryChurn: "candidate must not exceed current baseline churn",
    fallback: "diagnostic-best-non-feasible; never accepted allocation",
  },
  boundedPolicy: {
    angleCandidatesPerRadius: ANGLE_COUNT,
    angleStepDegrees: 10,
    radiusModes: { "base-only": 1, "small-portfolio": 2 },
    ownerGroupTopK: GROUP_TOP_K,
    groupSearch: "Cartesian product of retained per-loop candidates per owner; no global graph solver",
  },
  method: {
    cases: "Lighthouse/Titanic EN/JA plus isolated, symmetric, perturbed, and four-loop fan-out controls",
    runtime: {
      warmupRuns: 1,
      measuredRuns: RUNTIME_MEASURED_RUNS,
      statistics: "median and p95 over measured runs; Node process startup/module load excluded",
      phaseTiming: "baseline, candidate generation, cheap screening, owner-local enumeration, authoritative route/label evaluation, final label recomputation, routing arbitration, and viewport fit are instrumented separately",
    },
    arms: [
      "angle-only-independent: one loop at a time, current radius family",
      "angle-plus-small-radius-independent: one loop at a time, base and base+14 radius portfolio",
      "owner-group-bounded-allocation: owner-local retained portfolio with peer-loop constraints",
    ],
    evaluation: "every candidate is rendered through current Product routes, final Relation-label placement, final Node-label placement, viewport guard, and ordinary-route churn comparison",
  },
  results,
  summary: {
    resultCount: results.length,
    deterministicBaselineCount: results.filter((result) => result.deterministicBaseline).length,
    feasibleArmCount: allArms.filter((arm) => arm.acceptedAllocation).length,
    totalArmCount: allArms.length,
  },
};
await mkdir("experimental/self-loop-local-capacity-allocation", { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, summary: output.summary }, null, 2));
}
