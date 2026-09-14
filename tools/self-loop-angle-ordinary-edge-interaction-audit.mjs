import { readFile, mkdir, writeFile } from "node:fs/promises";
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
  placeEdgeLabel,
  placeNodeLabel,
  routeGraphEdge,
} from "../src/viewport.ts";

const OUTPUT = "experimental/self-loop-angle-ordinary-edge-interaction/audit.json";
const EXAMPLES = "../e2r-spec/examples";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const normalizeAngle = (value) => {
  const result = value % (Math.PI * 2);
  return result < 0 ? result + Math.PI * 2 : result;
};
const minDistance = (points, other) => points.length && other.length
  ? Math.min(...points.flatMap((point) => other.map((candidate) => distance(point, candidate))))
  : Infinity;
const minPointToPath = (point, samples) => samples.length ? Math.min(...samples.map((sample) => distance(point, sample))) : Infinity;
const rectOverlap = (left, right) => Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2) - Math.max(left.x - left.width / 2, right.x - right.width / 2))
  * Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2) - Math.max(left.y - left.height / 2, right.y - right.height / 2));

function datasetFromFixture(dataset, name, locale, ownerId, loopCount, labelMode = "short") {
  const owner = dataset.entities.find((entity) => entity.id === ownerId) ?? dataset.entities[0];
  const labels = labelMode === "long"
    ? locale === "ja"
      ? ["自己関係を確認する長い日本語ラベル", "自己関係を調整する長い日本語ラベル", "自己関係の履歴を表示する長い日本語ラベル", "自己関係の状態を同期する長い日本語ラベル"]
      : ["self monitors the long restoration relationship", "self calibrates the long restoration relationship", "self records the long restoration relationship", "self synchronizes the long restoration relationship"]
    : ["self monitors", "self calibrates", "self records", "self synchronizes"];
  return {
    ...dataset,
    entities: dataset.entities.map((entity) => ({ ...entity })),
    relations: [...dataset.relations, ...Array.from({ length: loopCount }, (_, index) => ({
      id: `${name}-self-${index + 1}`,
      sourceId: owner.id,
      targetId: owner.id,
      name: labels[index % labels.length],
    }))],
  };
}

function syntheticDataset(kind, locale = "en") {
  const long = locale === "ja"
    ? "自己関係を確認する長い日本語ラベル"
    : "self relation with a deliberately long English label";
  const central = { id: "center", name: locale === "ja" ? "中心ノード" : "Center", x: 0, y: 0 };
  const neighbors = kind === "isolated"
    ? []
    : kind === "symmetric"
    ? [
      { id: "north", x: 0, y: -180 }, { id: "east", x: 180, y: 0 },
      { id: "south", x: 0, y: 180 }, { id: "west", x: -180, y: 0 },
    ]
    : kind === "perturbed"
      ? [
        { id: "north", x: 20, y: -170 }, { id: "east", x: 220, y: 30 },
        { id: "south", x: -20, y: 190 }, { id: "obstacle", x: 12, y: -92 },
      ]
      : [
        { id: "north", x: 0, y: -170 }, { id: "east", x: 220, y: 24 },
        { id: "south", x: 0, y: 190 }, { id: "west", x: -170, y: 48 },
      ];
  const entities = [central, ...neighbors].map(({ id, x, y, name }) => ({
    id,
    name: name ?? id,
    description: id === "center" ? (locale === "ja" ? "長い中心ノードの説明" : "A central node with long presentation text") : "",
    ...(x === undefined ? {} : { x, y }),
  }));
  const ordinary = neighbors.filter(({ id }) => id !== "obstacle").map(({ id }) => ({
    id: `edge-center-${id}`, sourceId: "center", targetId: id, name: id === "east" ? long : `to ${id}`,
  }));
  return {
    version: "1.0",
    entities,
    events: [],
    relations: [
      ...ordinary,
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
  const seed = settleInitialPlacement({ entities: dataset.entities.map(({ id }) => ({ id })), relations: dataset.relations.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) });
  return seed;
}

function presentation(dataset, positions) {
  const graph = buildEntityGraph(dataset);
  const edges = graph.edges.map((edge) => ({
    ...edge,
    label: dataset.relations.find((relation) => relation.id === edge.id)?.name ?? "",
  }));
  const nodes = graph.nodes.map((node) => ({ ...node, ...positions[node.id] }));
  const points = Object.values(positions);
  const provisionalNodeLabels = nodes.map((node) => placeNodeLabel(
    positions[node.id], node.label, node.description, [], points.filter((point) => point !== positions[node.id]), [],
  ));
  const routedEdges = deriveAutomaticRoutes({
    graph: { nodes, edges }, positions, edgeCurveOffsets: {}, selfLoopOverrides: {}, provisionalNodeLabels,
  });
  const relationLabels = deriveAutomaticRelationLabels({ routedEdges, nodes: points, previousPlacements: new Map(), manualAnchors: new Map() });
  const nodeLabels = deriveAutomaticNodeLabels({
    nodes, positions, routedEdges, occupiedRelationLabels: relationLabels,
    previousPlacements: new Map(), manualOffsets: new Map(),
  });
  return { graph: { nodes, edges }, positions, routedEdges, relationLabels, nodeLabels };
}

function currentAndOrdinaryFirstRoutes(value) {
  const { graph, positions } = value;
  const ordinary = graph.edges.filter((edge) => edge.sourceId !== edge.targetId).sort((a, b) => a.id.localeCompare(b.id));
  const loops = graph.edges.filter((edge) => edge.sourceId === edge.targetId).sort((a, b) => a.id.localeCompare(b.id));
  const routeOne = (edge, occupiedPaths) => {
    const source = positions[edge.sourceId];
    const target = positions[edge.targetId];
    const obstacles = Object.entries(positions).filter(([id]) => id !== edge.sourceId && id !== edge.targetId).map(([, point]) => point);
    return routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, obstacles, occupiedPaths, edge.sourceId === edge.targetId);
  };
  const ordinaryPaths = [];
  const ordinaryFirst = new Map();
  for (const edge of ordinary) {
    const route = routeOne(edge, ordinaryPaths);
    ordinaryPaths.push(route.samples);
    ordinaryFirst.set(edge.id, route);
  }
  const loopPaths = [];
  for (const edge of loops) {
    const route = routeOne(edge, ordinaryPaths.concat(loopPaths));
    loopPaths.push(route.samples);
    ordinaryFirst.set(edge.id, route);
  }
  return ordinaryFirst;
}

function loopMetrics(value, ordinaryFirstRoutes) {
  const { graph, positions, routedEdges, relationLabels, nodeLabels } = value;
  const ordinaryEdges = graph.edges.filter((edge) => edge.sourceId !== edge.targetId);
  const loops = graph.edges.filter((edge) => edge.sourceId === edge.targetId);
  const ordinaryRoutes = routedEdges.filter((edge) => edge.sourceId !== edge.targetId);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rows = loops.map((edge) => {
    const route = routedEdges.find((candidate) => candidate.id === edge.id);
    const label = relationLabels.get(edge.id);
    const owner = positions[edge.sourceId];
    const inner = route.samples.slice(4, -4);
    const foreignNodes = Object.entries(positions).filter(([id]) => id !== edge.sourceId).map(([, point]) => point);
    const foreignRoutes = ordinaryRoutes.filter((candidate) => candidate.id !== edge.id).map((candidate) => candidate.samples);
    const peerRoutes = loops.filter((candidate) => candidate.id !== edge.id).map((candidate) => routedEdges.find((routeCandidate) => routeCandidate.id === candidate.id)?.samples ?? []);
    const ownerNodeLabel = nodeLabels.get(edge.sourceId);
    const incidentAngles = ordinaryEdges.filter((candidate) => candidate.sourceId === edge.sourceId || candidate.targetId === edge.sourceId).map((candidate) => {
      const otherId = candidate.sourceId === edge.sourceId ? candidate.targetId : candidate.sourceId;
      const other = positions[otherId];
      return Math.atan2(other.y - owner.y, other.x - owner.x);
    });
    const orientation = Math.atan2(route.controlPoint.y - owner.y, route.controlPoint.x - owner.x);
    const labelForeignRouteClearance = label ? Math.min(...foreignRoutes.map((path) => minimumPathToLabelRectDistance(path, label)), Infinity) : Infinity;
    const ownerMargin = label ? minPointToPath({ x: label.x, y: label.y }, foreignRoutes) - minPointToPath({ x: label.x, y: label.y }, route.samples) : null;
    const labelNodeOverlap = label && ownerNodeLabel ? rectOverlap(label, ownerNodeLabel) : 0;
    const incidentGap = incidentAngles.length ? Math.min(...incidentAngles.map((angle) => angleDistance(orientation, angle))) : Math.PI;
    const basePreferred = -Math.PI / 2 + edge.parallelIndex % 3 * Math.PI * 2 / 3;
    const ordinaryFirst = ordinaryFirstRoutes.get(edge.id);
    return {
      id: edge.id,
      label: edge.label,
      orientationDeg: Number((orientation * 180 / Math.PI).toFixed(2)),
      preferredDeltaDeg: Number((angleDistance(orientation, basePreferred) * 180 / Math.PI).toFixed(2)),
      radius: Number((Number.parseFloat(route.path.match(/\sA\s([0-9.]+)/u)?.[1] ?? "") || distance(owner, route.controlPoint)).toFixed(2)),
      foreignNodeClearance: Number((minDistance(inner, foreignNodes) - 32).toFixed(2)),
      ordinaryPathClearance: Number(minDistance(inner, foreignRoutes.flat()).toFixed(2)),
      peerLoopClearance: Number(minDistance(inner, peerRoutes.flat()).toFixed(2)),
      incidentAngularGapDeg: Number((incidentGap * 180 / Math.PI).toFixed(2)),
      labelToOwnRoute: Number(minPointToPath({ x: label?.x ?? 0, y: label?.y ?? 0 }, route.samples).toFixed(2)),
      labelToOrdinaryRoute: Number(labelForeignRouteClearance.toFixed(2)),
      labelOwnershipMargin: ownerMargin === null ? null : Number(ownerMargin.toFixed(2)),
      labelNodeOverlap: Number(labelNodeOverlap.toFixed(2)),
      ownerNodeLabelClearance: ownerNodeLabel ? Number(minimumPathToLabelRectDistance(inner, ownerNodeLabel).toFixed(2)) : null,
      ordinaryFirstSameGeometry: ordinaryFirst ? ordinaryFirst.path === route.path : false,
      routeSamples: route.samples.length,
    };
  });
  return rows;
}

function angleProbe(value, loopRow) {
  const { graph, positions, routedEdges, relationLabels, nodeLabels } = value;
  const edge = graph.edges.find((candidate) => candidate.id === loopRow.id);
  const owner = positions[edge.sourceId];
  const ordinaryRoutes = routedEdges.filter((candidate) => candidate.sourceId !== candidate.targetId);
  const radius = loopRow.radius;
  const preferred = -Math.PI / 2 + edge.parallelIndex % 3 * Math.PI * 2 / 3;
  const candidates = Array.from({ length: 36 }, (_, index) => preferred + (index <= 18 ? index : index - 36) * Math.PI / 18);
  const scored = candidates.map((orientation) => {
    const route = routeGraphEdge(owner, owner, edge.parallelIndex, edge.parallelCount, [], [], true, 0, undefined, { orientation, radius });
    const label = placeEdgeLabel(route.samples, edge.label, [], Object.values(positions), ordinaryRoutes.map((candidate) => candidate.samples));
    const ordinarySamples = ordinaryRoutes.flatMap((candidate) => candidate.samples);
    const ordinaryClearance = minDistance(route.samples.slice(4, -4), ordinarySamples);
    const nodeClearance = minDistance(route.samples.slice(4, -4), Object.entries(positions).filter(([id]) => id !== edge.sourceId).map(([, point]) => point));
    const labelClearance = minimumPathToLabelRectDistance(ordinarySamples, label);
    const nodeLabelClearance = nodeLabels.get(edge.sourceId) ? minimumPathToLabelRectDistance(route.samples.slice(4, -4), nodeLabels.get(edge.sourceId)) : Infinity;
    const score = (ordinaryClearance < 12 ? 10000 + (12 - ordinaryClearance) * 100 : 0)
      + (labelClearance < 4 ? 5000 + (4 - labelClearance) * 100 : 0)
      + (nodeLabelClearance < 4 ? 5000 + (4 - nodeLabelClearance) * 100 : 0)
      + (nodeClearance < 24 ? 2000 + (24 - nodeClearance) * 10 : 0)
      + angleDistance(orientation, preferred) * 0.05;
    return { orientationDeg: Number((orientation * 180 / Math.PI).toFixed(2)), score: Number(score.toFixed(2)), ordinaryClearance: Number(ordinaryClearance.toFixed(2)), labelClearance: Number(labelClearance.toFixed(2)), nodeLabelClearance: Number(nodeLabelClearance.toFixed(2)), nodeClearance: Number(nodeClearance.toFixed(2)) };
  });
  const current = scored.find((candidate) => Math.abs(angleDistance(candidate.orientationDeg * Math.PI / 180, Math.atan2(value.routedEdges.find((route) => route.id === edge.id).controlPoint.y - owner.y, value.routedEdges.find((route) => route.id === edge.id).controlPoint.x - owner.x))) < 0.0001) ?? scored[0];
  const best = [...scored].sort((a, b) => a.score - b.score || a.orientationDeg - b.orientationDeg)[0];
  return { candidateCount: candidates.length, current, best, bestIsDifferent: best.orientationDeg !== current.orientationDeg };
}

function summarize(name, locale, dataset, extra = {}) {
  const positions = positionsFor(dataset);
  const value = presentation(dataset, positions);
  const repeat = presentation(dataset, positions);
  const ordinaryFirstRoutes = currentAndOrdinaryFirstRoutes(value);
  const loops = loopMetrics(value, ordinaryFirstRoutes);
  const angleProbes = loops.map((row) => ({ id: row.id, ...angleProbe(value, row) }));
  const routePoints = value.routedEdges.flatMap((edge) => edge.samples);
  const allPoints = [...Object.values(positions), ...routePoints, ...[...value.relationLabels.values()]];
  const bounds = { minX: Math.min(...allPoints.map((point) => point.x)), maxX: Math.max(...allPoints.map((point) => point.x)), minY: Math.min(...allPoints.map((point) => point.y)), maxY: Math.max(...allPoints.map((point) => point.y)) };
  return {
    name, locale, graph: { nodes: value.graph.nodes.length, edges: value.graph.edges.length, loops: loops.length, ordinary: value.graph.edges.length - loops.length },
    deterministic: JSON.stringify(value.routedEdges) === JSON.stringify(repeat.routedEdges) && JSON.stringify([...value.relationLabels]) === JSON.stringify([...repeat.relationLabels]),
    routeBounds: Object.fromEntries(Object.entries(bounds).map(([key, number]) => [key, Number(number.toFixed(2))])),
    fit: fitGraphView(Object.values(positions), 960, 640),
    loops,
    angleProbes,
    ordinaryRouteChurnFromLoops: value.routedEdges.filter((edge) => edge.sourceId !== edge.targetId).filter((edge) => edge.path !== ordinaryFirstRoutes.get(edge.id)?.path).length,
    control: extra,
  };
}

const files = [
  ["lighthouse", "en"], ["lighthouse", "ja"], ["titanic", "en"], ["titanic", "ja"],
];
const results = [];
for (const [fixture, locale] of files) {
  const original = JSON.parse(await readFile(`${EXAMPLES}/${fixture === "lighthouse" ? "lighthouse-restoration-demo" : "titanic-final-voyage"}.${locale}.e2r.json`, "utf8"));
  const counts = new Map();
  for (const relation of original.relations) {
    counts.set(relation.sourceId, (counts.get(relation.sourceId) ?? 0) + 1);
    counts.set(relation.targetId, (counts.get(relation.targetId) ?? 0) + 1);
  }
  const ownerId = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? original.entities[0].id;
  results.push(summarize(`canonical-${fixture}`, locale, datasetFromFixture(original, fixture, locale, ownerId, 2, "long"), { ownerId, placement: "production-seed" }));
}
for (const locale of ["en", "ja"]) {
  for (const kind of ["isolated", "symmetric", "perturbed", "fanout"]) {
    results.push(summarize(`synthetic-${kind}`, locale, syntheticDataset(kind, locale), { placement: "explicit-control" }));
  }
}

const output = {
  contract: "SELF-LOOP-ANGLE-ORDINARY-EDGE-INTERACTION-v1",
  diagnosticOnly: true,
  authority: {
    selfLoop: "Product-owned routeGraphEdge self-loop branch",
    ordinaryRouting: "Product-owned deriveAutomaticRoutes / routeGraphEdge",
    relationLabels: "Product-owned deriveAutomaticRelationLabels",
    structuralPlacement: "fixed positions or production seed only; no placement mutation",
  },
  currentRule: {
    angularStepDegrees: 10,
    angularCandidateCount: 36,
    nodeInfluenceRadius: 60,
    preferredOrientationWeight: 0.05,
    radiusFormula: "38 + floor(parallelIndex / 3) * 14",
    candidateInputs: ["other Node pressure", "preferred orientation"],
    excludedInputs: ["ordinary occupied paths", "Relation labels", "Node labels", "peer Self-loop paths", "viewport bounds"],
  },
  method: {
    canonical: "Lighthouse and Titanic EN/JA with two added Self-loops on the highest-degree Entity; stored Dataset content unchanged",
    synthetic: "isolated, symmetric, perturbed, four-loop fanout; EN/JA long-label variants",
    controls: ["ordinary-first route order with current self-loop selector", "36 manual-angle diagnostic enumeration at the current radius", "exact repeated Product pipeline"],
    metrics: ["angle/radius", "foreign Node clearance", "ordinary path clearance", "peer-loop clearance", "incident angular gap", "Relation-label route/foreign-route/ownership metrics", "owner Node-label clearance", "ordinary-route churn", "determinism", "route bounds / viewport seed fit"],
  },
  results,
};
await mkdir("experimental/self-loop-angle-ordinary-edge-interaction", { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, resultCount: results.length, deterministic: results.every((result) => result.deterministic) }, null, 2));
