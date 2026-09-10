import fs from "node:fs";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { dependencyFingerprint } from "../src/presentation-dependency.ts";
import { placeNodeLabel } from "../src/viewport.ts";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:").replaceAll("/", "\\");
const repo = root.endsWith("\\") ? root.slice(0, -1) : root;
const fixtures = [
  { name: "Apollo 11", fixture: `${repo}\\experimental\\product-evaluation-seam\\actual-inspection\\fixtures\\apollo-11-spacing-220.en.e2r.json`, positions: `${process.env.TEMP}\\e2r-generic-search-apollo-v2.json` },
  { name: "Regional Care", fixture: `${repo}\\..\\e2r-spec\\examples\\visual-fixtures\\regional-care-coordination.en.e2r.json`, positions: `${process.env.TEMP}\\e2r-audit-regional-care-pair-standard-corridor.json` },
];

function readJson(path) {
  const bytes = fs.readFileSync(path);
  const utf8 = bytes.toString("utf8").replace(/^\uFEFF/, "");
  try { return JSON.parse(utf8); } catch { return JSON.parse(bytes.toString("utf16le").replace(/^\uFEFF/, "")); }
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function selectedPositions(path) {
  const value = readJson(path);
  return clone(value.selected?.positions ?? value.positions ?? value);
}
function mapSignature(values) { return JSON.stringify([...values.entries()]); }
function routeSignature(routes) { return JSON.stringify(routes.map(({ id, samples, path, labelPoint, controlPoint }) => ({ id, samples, path, labelPoint, controlPoint }))); }
function snapshotSignature(snapshots) {
  return JSON.stringify(snapshots.map(({ route, relationLabel, nodeLabel }) => ({
    pass: route.pass,
    routes: routeSignature(route.routes),
    relationLabels: mapSignature(relationLabel.labels),
    nodeLabels: mapSignature(nodeLabel.labels),
    yieldingRoutes: nodeLabel.yieldingRoutes,
  })));
}

function makeProvisionalLabels(graph, positions) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id],
    node.label,
    node.description,
    [],
    graph.nodes.filter((other) => other.id !== node.id).map((other) => positions[other.id]),
    [],
  ));
}

function deriveCase(dataset, basePositions, mutation) {
  const graph = buildEntityGraph(dataset);
  const edges = graph.edges.map((edge) => ({ ...edge, label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "" }));
  const positions = clone(basePositions);
  const provisionalNodeLabels = makeProvisionalLabels(graph, positions);
  const manualRelationLabelAnchors = new Map();
  let feedbackEnabled = true;
  if (mutation === "position") {
    const id = graph.nodes[0]?.id;
    if (id) positions[id].x += 24;
  } else if (mutation === "manual-relation-anchor") {
    const id = edges[0]?.id;
    if (id) manualRelationLabelAnchors.set(id, { fraction: 0.2, tangentOffset: 8, normalOffset: 64 });
  } else if (mutation === "provisional-label") {
    if (provisionalNodeLabels[0]) provisionalNodeLabels[0] = { ...provisionalNodeLabels[0], x: provisionalNodeLabels[0].x + 8 };
  } else if (mutation === "feedback-disabled") {
    feedbackEnabled = false;
  }
  const dependencyTraces = [];
  const snapshots = [];
  const startedAt = performance.now();
  const presentation = deriveBoundedAutomaticPresentation({
    graph: { nodes: graph.nodes, edges },
    positions,
    edgeCurveOffsets: {},
    selfLoopOverrides: {},
    provisionalNodeLabels,
    previousNodeLabelPlacements: new Map(),
    previousRelationLabelPlacements: new Map(),
    manualNodeLabelOffsets: new Map(),
    manualRelationLabelAnchors,
    feedbackEnabled,
    presentationDependencySink: (trace) => dependencyTraces.push(trace),
    presentationPassSink: (snapshot) => snapshots.push(snapshot),
  });
  return {
    mutation,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    traces: dependencyTraces,
    snapshotSignature: snapshotSignature(snapshots),
    outputSignature: JSON.stringify({
      routes: routeSignature(presentation.routedEdges),
      relationLabels: mapSignature(presentation.relationLabels),
      nodeLabels: mapSignature(presentation.nodeLabels),
      feedbackApplied: presentation.feedbackApplied,
    }),
  };
}

function traceKey(trace) { return `${trace.stage}:${trace.pass}`; }
function compareCase(baseline, current) {
  const baselineByKey = new Map(baseline.traces.map((trace) => [traceKey(trace), trace]));
  const currentByKey = new Map(current.traces.map((trace) => [traceKey(trace), trace]));
  const keys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort();
  const stages = keys.map((key) => {
    const before = baselineByKey.get(key);
    const after = currentByKey.get(key);
    return {
      key,
      presentBefore: Boolean(before),
      presentAfter: Boolean(after),
      inputChanged: Boolean(before && after && before.input.serialized !== after.input.serialized),
      outputChanged: Boolean(before && after && before.output.serialized !== after.output.serialized),
      inputLength: after?.input.characterLength ?? before?.input.characterLength ?? 0,
      outputLength: after?.output.characterLength ?? before?.output.characterLength ?? 0,
      fingerprintBuildMs: Number(((after?.input.buildMs ?? 0) + (after?.output.buildMs ?? 0)).toFixed(4)),
    };
  });
  const inputChanged = stages.filter(({ inputChanged: changed }) => changed).map(({ key }) => key);
  const outputChanged = stages.filter(({ outputChanged: changed }) => changed).map(({ key }) => key);
  return {
    stages,
    inputChanged,
    outputChanged,
    snapshotOutputChanged: baseline.snapshotSignature !== current.snapshotSignature,
    finalOutputChanged: baseline.outputSignature !== current.outputSignature,
    traceFingerprintBuildMs: Number(stages.reduce((sum, stage) => sum + stage.fingerprintBuildMs, 0).toFixed(4)),
  };
}

function runFixture({ name, fixture, positions: positionsPath }) {
  const dataset = readJson(fixture).dataset ?? readJson(fixture);
  const positions = selectedPositions(positionsPath);
  const mutations = ["baseline", "no-op", "position", "manual-relation-anchor", "provisional-label", "feedback-disabled"];
  const cases = mutations.map((mutation) => deriveCase(dataset, positions, mutation));
  const baseline = cases[0];
  return {
    fixture: name,
    graph: { nodes: buildEntityGraph(dataset).nodes.length, edges: buildEntityGraph(dataset).edges.length },
    baseline: {
      elapsedMs: baseline.elapsedMs,
      traceCount: baseline.traces.length,
      fingerprintBuildMs: Number(baseline.traces.reduce((sum, trace) => sum + trace.input.buildMs + trace.output.buildMs, 0).toFixed(4)),
    },
    cases: cases.slice(1).map((current) => ({ mutation: current.mutation, elapsedMs: current.elapsedMs, comparison: compareCase(baseline, current) })),
  };
}

const results = fixtures.map(runFixture);
console.log(JSON.stringify({
  contract: "LIAISONSCAPE-PRESENTATION-DEPENDENCY-INVALIDATION-DIAGNOSTIC-v1",
  diagnosticOnly: true,
  exactComparison: "Full canonical serialized fingerprints are compared; compact digests are reported by the source contract but are not used as the sole authority.",
  results,
  state: { productSemanticsChanged: false, historicalEvidenceChanged: false, governedFreshLineageStarted: false, publication: false },
}, null, 2));
