import fs from "node:fs";
import path from "node:path";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveBoundedAutomaticPresentation, type BoundedAutomaticPresentation } from "../src/graph-presentation.ts";
import { getNodeLabelTextGeometry, placeNodeLabel, type LabelRect, type Point } from "../src/viewport.ts";

type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { fixture: string; family: string; dataset: Dataset; positions: Record<string, Point> };
type Candidate = any;
type Arm = "current-fresh" | "current-previous" | "hysteresis-ablation" | "bounded-recovery" | "drag-active" | "drag-finalized";

const sourceArtifactPath = path.join(process.cwd(), "experimental", "product-node-label-relation-presentation-first-angular-escape1", "result-summary.json");
const sourceArtifact = JSON.parse(fs.readFileSync(sourceArtifactPath, "utf8")) as { rows: Fixture[] };
const FIXTURE_IDS = [
  "horizontal-label-capacity",
  "vertical-label-capacity",
  "diagonal-label-capacity",
  "high-degree-angular-capacity",
  "dense-angular-capacity",
  "parallel-self-loop-control",
  "lighthouse-en",
  "lighthouse-ja",
];

function graphFor(fixture: Fixture) {
  const graph = buildEntityGraph(fixture.dataset as never);
  const labels = new Map(fixture.dataset.relations.map((relation) => [relation.id, relation.name ?? ""]));
  return { nodes: graph.nodes, edges: graph.edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? "" })) };
}

function provisionalLabels(graph: ReturnType<typeof buildEntityGraph>, positions: Record<string, Point>) {
  return graph.nodes.map((node) => placeNodeLabel(
    positions[node.id]!, node.label, node.description, [],
    graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!), [],
  ));
}

function baselineFor(fixture: Fixture): { graph: ReturnType<typeof graphFor>; presentation: BoundedAutomaticPresentation } {
  const graph = graphFor(fixture);
  const built = buildEntityGraph(fixture.dataset as never);
  return {
    graph,
    presentation: deriveBoundedAutomaticPresentation({
      graph,
      positions: fixture.positions,
      edgeCurveOffsets: {},
      selfLoopOverrides: {},
      provisionalNodeLabels: provisionalLabels(built, fixture.positions),
      previousNodeLabelPlacements: new Map(),
      previousRelationLabelPlacements: new Map(),
      manualNodeLabelOffsets: new Map(),
      manualRelationLabelAnchors: new Map(),
      feedbackEnabled: false,
    }),
  };
}

function perturbedRelationLabels(presentation: BoundedAutomaticPresentation): ReadonlyMap<string, LabelRect> {
  const result = new Map(presentation.relationLabels);
  const first = result.entries().next().value as [string, LabelRect] | undefined;
  if (first) {
    const [id, label] = first;
    result.set(id, { ...label, x: label.x + 18, y: label.y + 28 });
  }
  return result;
}

function candidateIdentity(candidate: Candidate | undefined) {
  if (!candidate) return null;
  return { angleDegrees: candidate.angle * 180 / Math.PI, x: candidate.candidate.x, y: candidate.candidate.y, freshRank: candidate.freshRank, continuityRank: candidate.continuityRank };
}

function recoveryDecision(trace: { candidates: readonly Candidate[] }, hasPrevious: boolean) {
  const fresh = trace.candidates.find((candidate) => candidate.freshBest)!;
  const selected = trace.candidates.find((candidate) => candidate.selected)!;
  const previous = trace.candidates.find((candidate) => candidate.previousCandidate);
  const freshQualityGain = selected.freshScore - fresh.freshScore;
  if (!hasPrevious) return { triggered: false, reason: "no-previous-placement", fresh, selected, previous, freshQualityGain };
  if (!selected.hardSafe && fresh.hardSafe) return { triggered: true, reason: "previous-selected-hard-conflict", fresh, selected, previous, freshQualityGain };
  if (selected.hardSafe && fresh.hardSafe && fresh.freshScore < selected.freshScore) return { triggered: true, reason: "fresh-strict-presentation-gain", fresh, selected, previous, freshQualityGain };
  if (!fresh.hardSafe) return { triggered: false, reason: "fresh-best-not-hard-safe", fresh, selected, previous, freshQualityGain };
  if (fresh.freshScore >= selected.freshScore) return { triggered: false, reason: "continuity-retained", fresh, selected, previous, freshQualityGain };
  return { triggered: false, reason: "continuity-tie-or-unknown", fresh, selected, previous, freshQualityGain };
}

function deriveDiagnosticNodeLabels(
  fixture: Fixture,
  graph: ReturnType<typeof graphFor>,
  presentation: BoundedAutomaticPresentation,
  previousPlacements: ReadonlyMap<string, LabelRect>,
  options: { ignoreMovementCost?: boolean; recovery?: boolean; activelyDraggedNodeId?: string } = {},
) {
  const positions = fixture.positions;
  const occupiedLabels = [...presentation.relationLabels.values()];
  const edgePaths = presentation.routedEdges.map(({ samples }) => samples);
  const labels = new Map<string, LabelRect>();
  const traces: Array<{ nodeId: string; candidates: readonly Candidate[] }> = [];
  const decisions: any[] = [];
  for (const node of graph.nodes) {
    const position = positions[node.id]!;
    const otherNodes = graph.nodes.filter(({ id }) => id !== node.id).map(({ id }) => positions[id]!);
    const previous = options.ignoreMovementCost || options.activelyDraggedNodeId === node.id ? undefined : previousPlacements.get(node.id);
    let candidates: readonly Candidate[] = [];
    placeNodeLabel(
      position,
      node.label,
      node.description,
      occupiedLabels,
      otherNodes,
      edgePaths,
      previous,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      (nextCandidates) => { candidates = nextCandidates; },
    );
    const priorNodeLabels = [...labels.values()];
    const splitCandidates = candidates.map((candidate) => ({
      ...candidate,
      occupiedRelationLabelOverlap: [...presentation.relationLabels.values()]
        .reduce((sum, relationLabel) => sum + rectOverlap(candidate.candidate, relationLabel), 0),
      occupiedNodeLabelOverlap: priorNodeLabels
        .reduce((sum, nodeLabel) => sum + rectOverlap(candidate.candidate, nodeLabel), 0),
    }));
    const trace = { nodeId: node.id, candidates: splitCandidates };
    traces.push(trace);
    const decision = recoveryDecision(trace, previous !== undefined);
    const chosen = options.recovery && decision.triggered ? decision.fresh.candidate : decision.selected.candidate;
    labels.set(node.id, chosen);
    occupiedLabels.push(chosen);
    decisions.push({
      nodeId: node.id,
      previousInput: previous !== undefined,
      activelyDragged: options.activelyDraggedNodeId === node.id,
      candidateCount: candidates.length,
      freshBest: candidateIdentity(decision.fresh),
      previousCandidate: candidateIdentity(decision.previous),
      continuitySelected: candidateIdentity(decision.selected),
      selectedCandidate: candidateIdentity(options.recovery && decision.triggered ? decision.fresh : decision.selected),
      recoveryTriggered: options.recovery ? decision.triggered : false,
      recoveryReason: options.recovery ? decision.reason : "not-evaluated",
      freshQualityGain: decision.freshQualityGain,
      movementCost: decision.selected.movementCost,
      selectedScore: decision.selected.score,
      freshScore: decision.fresh.freshScore,
      selectedHardSafe: decision.selected.hardSafe,
      freshHardSafe: decision.fresh.hardSafe,
      routeHardPressure: decision.selected.routeHardPressure,
      routeHaloPressure: decision.selected.routeHaloPressure,
      yieldingRoutePressure: decision.selected.yieldingRoutePressure,
      occupiedRelationLabelOverlap: decision.selected.occupiedRelationLabelOverlap,
      occupiedNodeLabelOverlap: decision.selected.occupiedNodeLabelOverlap,
      otherNodePressure: decision.selected.otherNodePressure,
      candidates: splitCandidates,
    });
  }
  return { labels, traces, decisions };
}

function rectOverlap(left: LabelRect, right: LabelRect) {
  return Math.max(0, Math.min(left.x + left.width / 2, right.x + right.width / 2) - Math.max(left.x - left.width / 2, right.x - right.width / 2))
    * Math.max(0, Math.min(left.y + left.height / 2, right.y + right.height / 2) - Math.max(left.y - left.height / 2, right.y - right.height / 2));
}

function metrics(fixture: Fixture, graph: ReturnType<typeof graphFor>, presentation: BoundedAutomaticPresentation, labels: ReadonlyMap<string, LabelRect>) {
  const nodeLabels = [...labels.entries()];
  const relationLabels = [...presentation.relationLabels.entries()];
  const relationOverlap = nodeLabels.reduce((sum, [, nodeLabel]) => sum + relationLabels.reduce((inner, [, relationLabel]) => inner + Number(rectOverlap(nodeLabel, relationLabel) > 0), 0), 0);
  const nodeLabelOverlap = nodeLabels.reduce((sum, [, left], index) => sum + nodeLabels.slice(index + 1).reduce((inner, [, right]) => inner + Number(rectOverlap(left, right) > 0), 0), 0);
  const foreignRouteCollision = nodeLabels.reduce((sum, [nodeId, label]) => sum + presentation.routedEdges.reduce((inner, route) => inner + Number(route.sourceId !== nodeId && route.targetId !== nodeId && route.samples.some((point) => Math.abs(point.x - label.x) <= label.width / 2 && Math.abs(point.y - label.y) <= label.height / 2)), 0), 0);
  const connectorLengths = graph.nodes.map((node) => {
    const label = labels.get(node.id)!;
    const point = fixture.positions[node.id]!;
    return Math.hypot(label.x - point.x, label.y - point.y);
  });
  return {
    relationOverlap,
    nodeLabelOverlap,
    foreignRouteCollision,
    meanConnectorLength: connectorLengths.reduce((sum, value) => sum + value, 0) / Math.max(1, connectorLengths.length),
    maxConnectorLength: Math.max(0, ...connectorLengths),
    routeCount: presentation.routedEdges.length,
    relationLabelCount: presentation.relationLabels.size,
  };
}

function equalLabels(left: ReadonlyMap<string, LabelRect>, right: ReadonlyMap<string, LabelRect>) {
  return JSON.stringify([...left.entries()]) === JSON.stringify([...right.entries()]);
}

const arms: Arm[] = ["current-fresh", "current-previous", "hysteresis-ablation", "bounded-recovery", "drag-active", "drag-finalized"];
const rows = FIXTURE_IDS.map((fixtureId) => {
  const fixture = sourceArtifact.rows.find((row) => row.fixture === fixtureId)!;
  const priorRow = sourceArtifact.rows.find((row) => row.fixture === fixtureId) as any;
  const { graph, presentation } = baselineFor(fixture);
  const perturbed = perturbedRelationLabels(presentation);
  const priorProductDerived = deriveDiagnosticNodeLabels(fixture, graph, { ...presentation, relationLabels: new Map(perturbed) }, new Map(), { recovery: false });
  const previousPlacements = priorRow?.arms?.["current-previous"]?.nodeLabels
    ? new Map(Object.entries(priorRow.arms["current-previous"].nodeLabels)) as Map<string, LabelRect>
    : priorProductDerived.labels;
  const evaluations = {
    "current-fresh": deriveDiagnosticNodeLabels(fixture, graph, presentation, new Map(), { recovery: false }),
    "current-previous": deriveDiagnosticNodeLabels(fixture, graph, presentation, previousPlacements, { recovery: false }),
    "hysteresis-ablation": deriveDiagnosticNodeLabels(fixture, graph, presentation, previousPlacements, { recovery: false, ignoreMovementCost: true }),
    "bounded-recovery": deriveDiagnosticNodeLabels(fixture, graph, presentation, previousPlacements, { recovery: true }),
    "drag-active": deriveDiagnosticNodeLabels(fixture, graph, presentation, previousPlacements, { recovery: false, activelyDraggedNodeId: graph.nodes[0]?.id }),
    "drag-finalized": deriveDiagnosticNodeLabels(fixture, graph, presentation, previousPlacements, { recovery: true }),
  } satisfies Record<Arm, ReturnType<typeof deriveDiagnosticNodeLabels>>;
  const fresh = evaluations["current-fresh"];
  const changedFromFresh = (evaluation: ReturnType<typeof deriveDiagnosticNodeLabels>) => graph.nodes.reduce((count, node) => count + Number(!equalLabels(new Map([[node.id, fresh.labels.get(node.id)!]]), new Map([[node.id, evaluation.labels.get(node.id)!]]))), 0);
  const recoveryTriggeredCount = evaluations["bounded-recovery"].decisions.filter(({ recoveryTriggered }) => recoveryTriggered).length;
  const recoveryRepeat = deriveDiagnosticNodeLabels(fixture, graph, presentation, evaluations["bounded-recovery"].labels, { recovery: true });
  const recoveryStable = equalLabels(evaluations["bounded-recovery"].labels, recoveryRepeat.labels);
  return {
    fixture: fixture.fixture,
    family: fixture.family,
    dataset: fixture.dataset,
    positions: fixture.positions,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    relationPresentation: {
      routeIds: presentation.routedEdges.map(({ id }) => id),
      relationLabels: Object.fromEntries(presentation.relationLabels),
      perturbedRelationLabels: Object.fromEntries(perturbed),
      routeGeometryStable: true,
      perturbation: "one fixed Relation-label rectangle shifted by (+18,+28); routes and Node positions unchanged",
    },
    productDerivedPrevious: Object.fromEntries(previousPlacements),
    priorPresentation: priorRow?.arms?.["current-previous"]?.nodeLabels
      ? "previous snapshot is the prior checkpoint's Product scorer output for current-previous; the fixed Relation-label perturbation remains a negative control and fallback"
      : "current Product Node-label scorer evaluated against a fixed perturbed Relation-label snapshot; this is a source-derived lifecycle reproduction, not a new Relation-label policy",
    arms: Object.fromEntries(arms.map((arm) => {
      const evaluation = evaluations[arm];
      return [arm, {
        labels: Object.fromEntries(evaluation.labels),
        decisions: evaluation.decisions,
        metrics: { ...metrics(fixture, graph, presentation, evaluation.labels), changedFromFresh: changedFromFresh(evaluation) },
        input: {
          previousPlacementProvided: arm !== "current-fresh",
          previousPlacementIgnored: arm === "hysteresis-ablation" || arm === "drag-active" && graph.nodes[0]?.id !== undefined,
          activeDraggedNodeId: arm === "drag-active" ? graph.nodes[0]?.id ?? null : null,
          recoveryMode: arm === "bounded-recovery" || arm === "drag-finalized",
        },
      }];
    })),
    recovery: {
      triggeredCount: recoveryTriggeredCount,
      stableOnRepeatedDerivation: recoveryStable,
      oscillationPattern: recoveryStable ? "none in repeated identical-input derivation" : "observed; requires stop",
    },
    fixedRelationPresentation: true,
    structuralPlacement: "unchanged",
    routingAuthority: "unchanged; routes are fixed during Node-label comparison",
    selfLoopPolicy: "unchanged; control only",
  };
});

const artifact = {
  contract: "LIAISONSCAPE-PRODUCT-NODE-LABEL-HYSTERESIS-RECOVERY-ATTRIBUTION-v1",
  diagnosticOnly: true,
  candidateIdentity: "product-node-label-hysteresis-recovery-attribution1",
  sourceGrounding: {
    movementCost: "existing placementMovementCost(candidate, previous) = Euclidean label-center distance * 4",
    activeDrag: "existing activelyDraggedNodeId suppresses previous placement for the actively dragged Node",
    lifecycle: "App stores the last displayed Product nodeLabels map in previousNodeLabelPlacements after each presentation effect; finalizing drag clears active state before the bounded final presentation",
    feedback: "bounded first pass may be followed by one feedback pass; no unbounded recovery loop is introduced",
  },
  arms,
  recoveryContract: {
    freshBest: "minimum existing candidate score with movementCost removed",
    continuitySelected: "existing selected candidate including movementCost",
    hardSafe: "no occupied-label area, other-Node pressure, route hard pressure, or yielding-route hard pressure",
    trigger: "retain continuity unless fresh-best is hard-safe and either previous-selected is not hard-safe or fresh-best strictly reduces the existing non-movement presentation score",
    arbitraryWeightRetune: "not used",
    productionAdoption: "not proposed; recovery is diagnostic-only",
  },
  fixtureSource: "experimental/product-node-label-relation-presentation-first-angular-escape1/result-summary.json",
  rows,
  standing: { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN", adaptiveCascade: "NOT ENTERED" },
};
const target = path.join(process.cwd(), "experimental", "product-node-label-hysteresis-recovery-attribution1", "result-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map((row) => ({ fixture: row.fixture, recovery: row.recovery, arms: Object.fromEntries(arms.map((arm) => [arm, row.arms[arm].metrics])) })), null, 2));
