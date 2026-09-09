import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import type { AutomaticRouteDecision } from "../../../src/graph-presentation";
import type { DragPointerProcessingSample, PresentationDiagnosticSnapshot, PresentationTimingSample } from "../../../src/presentation-diagnostics";
import type { RouteCandidateDiagnostic } from "../../../src/viewport";
import "../../../src/styles.css";
import "./actual-inspection.css";
import { diagnoseRoute } from "./routing-diagnostics";

const diagnosticDatasetUrl = "https://diagnostic.liaisonscape.invalid/apollo-11-product-inspection.en.e2r.json";
const spacingVariant = new URL(window.location.href).searchParams.get("spacing") ?? "control";
const strictModeOff = new URL(window.location.href).searchParams.get("strictMode") === "off";
const allowedSpacingVariants = new Set(["low-density", "control", "108", "120", "132", "144", "160", "180", "200", "220"]);
const selectedSpacingVariant = allowedSpacingVariants.has(spacingVariant) ? spacingVariant : "control";
const localDatasetUrl = `${import.meta.env.BASE_URL}experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-${selectedSpacingVariant}.en.e2r.json`;
const originalFetch = window.fetch.bind(window);
const diagnosticEvent = "liaisonscape:presentation-diagnostic";
let latestDiagnosticSnapshot: PresentationDiagnosticSnapshot | null = null;
type RouteTransitionReport = {
  nodeId: string;
  stage: "entry" | "pointer-up" | "post-idle";
  fromPhase: PresentationDiagnosticSnapshot["phase"];
  toPhase: PresentationDiagnosticSnapshot["phase"];
  fromDerivationPhase: PresentationDiagnosticSnapshot["derivationPhase"];
  toDerivationPhase: PresentationDiagnosticSnapshot["derivationPhase"];
  sameNodeGeometry: boolean;
  changedRouteIds: string[];
  changedNonIncidentRouteIds: string[];
  changedNonIncidentRouteIdsDuringActiveDrag: string[];
  changedNodeLabelIds: string[];
  changedRelationLabelIds: string[];
  relationLabelComparisons: Array<{
    routeId: string;
    from: { x: number; y: number; width: number; height: number } | null;
    to: { x: number; y: number; width: number; height: number } | null;
  }>;
  routeShapeComparisons: Array<{
    routeId: string;
    incident: boolean;
    from: { curved: boolean; length: number; controlPoint: { x: number; y: number } | null };
    to: { curved: boolean; length: number; controlPoint: { x: number; y: number } | null };
    fromCandidates: readonly RouteCandidateDiagnostic[];
    toCandidates: readonly RouteCandidateDiagnostic[];
  }>;
  remoteRouteOutcomes: Array<{
    routeId: string;
    classification: "transient" | "persistent";
    active: {
      changedFromDragStart: boolean;
      shape: ReturnType<typeof routeShape>;
      selectedCandidate: RouteCandidateDiagnostic | null;
      continuity: AutomaticRouteDecision["continuity"] | null;
    };
    final: {
      changedFromDragStart: boolean;
      shape: ReturnType<typeof routeShape>;
      selectedCandidate: RouteCandidateDiagnostic | null;
      continuity: AutomaticRouteDecision["continuity"] | null;
    };
  }>;
  continuityBlocks: Array<{ routeId: string; pass: string; processingIndex: number; usedPreviousRoute: boolean; reasons: string[]; blockers: { nodes: string[]; occupiedRoutes: string[]; nodeLabels: string[] } }>;
  dragState: {
    activeRoutingPosition: { x: number; y: number } | null;
    activeLivePosition: { x: number; y: number } | null;
    finalRoutingPosition: { x: number; y: number } | null;
  };
};
let latestDragPresentationSnapshot: PresentationDiagnosticSnapshot | null = null;
let dragEntryBaselineSnapshot: PresentationDiagnosticSnapshot | null = null;
let dragStartPresentationSnapshot: PresentationDiagnosticSnapshot | null = null;
let changedNonIncidentRouteIdsDuringActiveDrag = new Set<string>();
let pendingDragEndSnapshot: PresentationDiagnosticSnapshot | null = null;
let pendingActiveDragRemoteChanges: string[] = [];
let activeRemoteRouteSnapshots = new Map<string, PresentationDiagnosticSnapshot>();
let latestRouteTransitionReport: RouteTransitionReport | null = null;
let pendingPostIdleSnapshot: PresentationDiagnosticSnapshot | null = null;
let latestDragEntryReport: RouteTransitionReport | null = null;
let latestPostIdleReport: RouteTransitionReport | null = null;

type ActiveDragRemoteTransition = {
  step: number;
  routingPosition: { x: number; y: number } | null;
  routeId: string;
  pass: string | null;
  usedPreviousRoute: boolean | null;
  reasons: string[];
  blockers: { nodes: string[]; occupiedRoutes: string[]; nodeLabels: string[] };
};
let activeDragRemoteTransitions: ActiveDragRemoteTransition[] = [];

type DragTimingReport = {
  nodeId: string;
  pointerMoves: number;
  presentationComputations: number;
  uniquePresentationInputs: number;
  duplicatePresentationComputations: number;
  feedbackPassComputations: number;
  presentationDurationMs: { median: number; p95: number; max: number } | null;
  renderSamples: number;
  pointerToRenderMs: { median: number; p95: number; max: number } | null;
  processedToRenderMs: { median: number; p95: number; max: number } | null;
  pointerToNodeLagPx: { median: number; p95: number; max: number } | null;
  eventAgeMs: { median: number; p95: number; max: number } | null;
  processingAgeMs: { median: number; p95: number; max: number } | null;
  latestVsProcessedPointerPx: { median: number; p95: number; max: number } | null;
  coalescedEvents: number;
  longTaskDurationsMs: number[];
  nodeLagDuringLongTaskPx: { median: number; p95: number; max: number } | null;
  nodeLagOutsideLongTaskPx: { median: number; p95: number; max: number } | null;
  durationMs: number;
  remoteTransitions: ActiveDragRemoteTransition[];
};

type ActiveDragTiming = {
  pointerId: number;
  nodeId: string;
  startedAt: number;
  pointerMoves: number;
  computationDurations: number[];
  presentationInputIds: number[];
  feedbackPassComputations: number;
  renderLatencies: number[];
  processedRenderLatencies: number[];
  nodeLagPixels: number[];
  nodeLagSamples: Array<{ at: number; lag: number }>;
  eventAges: number[];
  processingAges: number[];
  latestVsProcessedPointerPixels: number[];
  coalescedEvents: number;
  longTaskDurationsMs: number[];
  longTaskWindows: Array<{ start: number; end: number }>;
  latestPointer: { x: number; y: number };
  latestPointerAt: number;
  latestProcessedAt: number;
  grabOffset: { x: number; y: number };
  framePending: boolean;
};

let activeDragTiming: ActiveDragTiming | null = null;
let latestDragTimingReport: DragTimingReport | null = null;
const timingEvent = "liaisonscape:presentation-timing";
const routeTransitionEvent = "liaisonscape:route-transition-diagnostic";
const dragEntryEvent = "liaisonscape:drag-entry-diagnostic";
const postIdleEvent = "liaisonscape:post-idle-diagnostic";

function sameNodeGeometry(left: PresentationDiagnosticSnapshot, right: PresentationDiagnosticSnapshot): boolean {
  return left.nodes.every((node) => {
    const leftPosition = left.positions[node.id] ?? node;
    const rightNode = right.nodes.find(({ id }) => id === node.id);
    const rightPosition = right.positions[node.id] ?? rightNode;
    return rightPosition !== undefined && leftPosition.x === rightPosition.x && leftPosition.y === rightPosition.y;
  });
}

function changedRouteIds(left: PresentationDiagnosticSnapshot, right: PresentationDiagnosticSnapshot): string[] {
  const rightById = new Map(right.routedEdges.map((route) => [route.id, route]));
  return left.routedEdges
    .filter((route) => rightById.get(route.id)?.path !== route.path)
    .map((route) => route.id);
}

function changedLabelIds(left: readonly [string, { x: number; y: number; width: number; height: number }][], right: readonly [string, { x: number; y: number; width: number; height: number }][]): string[] {
  const rightById = new Map(right);
  return left.filter(([id, label]) => {
    const candidate = rightById.get(id);
    return !candidate || candidate.x !== label.x || candidate.y !== label.y || candidate.width !== label.width || candidate.height !== label.height;
  }).map(([id]) => id);
}

function routeLength(samples: readonly { x: number; y: number }[]): number {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - samples[index]!.x, point.y - samples[index]!.y), 0);
}

function routeShape(route: PresentationDiagnosticSnapshot["routedEdges"][number]) {
  return {
    curved: route.path.includes(" Q ") || route.path.includes(" A "),
    length: routeLength(route.samples),
    controlPoint: route.controlPoint ? { x: route.controlPoint.x, y: route.controlPoint.y } : null,
  };
}

function labelShape(label: { x: number; y: number; width: number; height: number } | undefined) {
  return label ? { x: label.x, y: label.y, width: label.width, height: label.height } : null;
}

function routeDecisionFor(snapshot: PresentationDiagnosticSnapshot, routeId: string) {
  return [...snapshot.routeDecisions].reverse().find((candidate) =>
    candidate.edgeId === routeId && (candidate.pass === "feedback" || candidate.pass === "first"),
  );
}

function selectedCandidateFor(snapshot: PresentationDiagnosticSnapshot, routeId: string): RouteCandidateDiagnostic | null {
  return routeDecisionFor(snapshot, routeId)?.candidateDiagnostics.find((candidate) => candidate.selected) ?? null;
}

function remoteRouteOutcomes(
  start: PresentationDiagnosticSnapshot | null,
  final: PresentationDiagnosticSnapshot,
  activeSnapshots: ReadonlyMap<string, PresentationDiagnosticSnapshot>,
): RouteTransitionReport["remoteRouteOutcomes"] {
  if (!start) return [];
  const startRoutes = new Map(start.routedEdges.map((route) => [route.id, route]));
  const finalRoutes = new Map(final.routedEdges.map((route) => [route.id, route]));
  return [...activeSnapshots.entries()].flatMap(([routeId, active]) => {
    const startRoute = startRoutes.get(routeId);
    const activeRoute = active.routedEdges.find((route) => route.id === routeId);
    const finalRoute = finalRoutes.get(routeId);
    if (!startRoute || !activeRoute || !finalRoute) return [];
    const activeChangedFromDragStart = startRoute.path !== activeRoute.path;
    const finalChangedFromDragStart = startRoute.path !== finalRoute.path;
    return [{
      routeId,
      classification: finalChangedFromDragStart ? "persistent" : "transient",
      active: {
        changedFromDragStart: activeChangedFromDragStart,
        shape: routeShape(activeRoute),
        selectedCandidate: selectedCandidateFor(active, routeId),
        continuity: routeDecisionFor(active, routeId)?.continuity ?? null,
      },
      final: {
        changedFromDragStart: finalChangedFromDragStart,
        shape: routeShape(finalRoute),
        selectedCandidate: selectedCandidateFor(final, routeId),
        continuity: routeDecisionFor(final, routeId)?.continuity ?? null,
      },
    }];
  });
}

function candidateSummary(candidates: readonly RouteCandidateDiagnostic[]): string {
  const selected = candidates.find((candidate) => candidate.selected);
  if (!selected) return "none";
  return `offset ${selected.offset.toFixed(1)}, score ${selected.score.toFixed(1)}, node ${selected.nodeOverlapScore.toFixed(1)}, occupied ${selected.occupiedPathConflict ? "yes" : "no"}, label ${selected.labelPressure.toFixed(1)}`;
}

function continuitySummary(continuity: AutomaticRouteDecision["continuity"] | null): string {
  if (!continuity) return "n/a";
  const blockers = [
    continuity.blockingNodeIds.length ? `node ${continuity.blockingNodeIds.join(",")}` : "",
    continuity.blockingOccupiedRouteIds.length ? `route ${continuity.blockingOccupiedRouteIds.join(",")}` : "",
    continuity.blockingNodeLabelIds.length ? `label ${continuity.blockingNodeLabelIds.join(",")}` : "",
  ].filter(Boolean);
  return `${continuity.usedPreviousRoute ? "reused" : "rerouted"}${blockers.length ? ` (${blockers.join("; ")})` : ""}`;
}

function remoteOutcomeSummary(outcome: RouteTransitionReport["remoteRouteOutcomes"][number]): string {
  return `${outcome.routeId} ${outcome.classification}: active ${outcome.active.shape.curved ? "curved" : "straight"} [${candidateSummary(outcome.active.selectedCandidate ? [outcome.active.selectedCandidate] : [])}; ${continuitySummary(outcome.active.continuity)}] → final ${outcome.final.shape.curved ? "curved" : "straight"} [${candidateSummary(outcome.final.selectedCandidate ? [outcome.final.selectedCandidate] : [])}; ${continuitySummary(outcome.final.continuity)}]`;
}

function positionFor(snapshot: PresentationDiagnosticSnapshot, nodeId: string): { x: number; y: number } | null {
  const node = snapshot.nodes.find(({ id }) => id === nodeId);
  return node ? snapshot.positions[nodeId] ?? node : null;
}

function routeTransitionReport(stage: RouteTransitionReport["stage"], from: PresentationDiagnosticSnapshot, to: PresentationDiagnosticSnapshot, nodeId: string, changedNonIncidentRouteIdsDuringActiveDrag: string[], dragStart: PresentationDiagnosticSnapshot | null = null, activeSnapshots: ReadonlyMap<string, PresentationDiagnosticSnapshot> = new Map()): RouteTransitionReport {
  const changed = changedRouteIds(from, to);
  const edgesById = new Map(to.edges.map((edge) => [edge.id, edge]));
  const fromRoutes = new Map(from.routedEdges.map((route) => [route.id, route]));
  const toRoutes = new Map(to.routedEdges.map((route) => [route.id, route]));
  const fromRelationLabels = new Map(from.relationLabels);
  const toRelationLabels = new Map(to.relationLabels);
  return {
    nodeId,
    stage,
    fromPhase: from.phase,
    toPhase: to.phase,
    fromDerivationPhase: from.derivationPhase,
    toDerivationPhase: to.derivationPhase,
    sameNodeGeometry: sameNodeGeometry(from, to),
    changedRouteIds: changed,
    changedNonIncidentRouteIds: changed.filter((id) => {
      const edge = edgesById.get(id);
      return edge !== undefined && edge.sourceId !== nodeId && edge.targetId !== nodeId;
    }),
    changedNonIncidentRouteIdsDuringActiveDrag,
    changedNodeLabelIds: changedLabelIds(from.nodeLabels, to.nodeLabels),
    changedRelationLabelIds: changedLabelIds(from.relationLabels, to.relationLabels),
    routeShapeComparisons: changed.flatMap((routeId) => {
      const before = fromRoutes.get(routeId);
      const after = toRoutes.get(routeId);
      const edge = edgesById.get(routeId);
      const beforeDecision = routeDecisionFor(from, routeId);
      const afterDecision = routeDecisionFor(to, routeId);
      return before && after && edge ? [{
        routeId,
        incident: edge.sourceId === nodeId || edge.targetId === nodeId,
        from: routeShape(before),
        to: routeShape(after),
        fromCandidates: beforeDecision?.candidateDiagnostics ?? [],
        toCandidates: afterDecision?.candidateDiagnostics ?? [],
      }] : [];
    }),
    remoteRouteOutcomes: remoteRouteOutcomes(dragStart, to, activeSnapshots),
    relationLabelComparisons: changed.flatMap((routeId) => {
      const before = fromRelationLabels.get(routeId);
      const after = toRelationLabels.get(routeId);
      return before || after ? [{ routeId, from: labelShape(before), to: labelShape(after) }] : [];
    }),
    continuityBlocks: changed.filter((id) => {
      const edge = edgesById.get(id);
      return edge !== undefined && edge.sourceId !== nodeId && edge.targetId !== nodeId;
    }).flatMap((routeId) => {
      const decision = [...to.routeDecisions].reverse().find((candidate) =>
        candidate.edgeId === routeId && (candidate.pass === "feedback" || candidate.pass === "first"),
      );
      if (!decision) return [];
      const { continuity } = decision;
      const reasons = [
        !continuity.previousRoutePresent ? "no previous route" : "",
        !continuity.draggedNodePresent ? "no drag identity" : "",
        continuity.isIncident ? "incident" : "",
        !continuity.isEligibleShape ? "ineligible shape" : "",
        continuity.priorRouteHasNodeInfluence ? "node influence" : "",
        continuity.priorRouteHasOccupiedPathConflict ? "occupied-path conflict" : "",
        continuity.priorRouteHasLabelCollision ? "label collision" : "",
      ].filter(Boolean);
      return [{
        routeId,
        pass: decision.pass,
        processingIndex: decision.processingIndex,
        usedPreviousRoute: decision.usedPreviousRoute,
        reasons,
        blockers: {
          nodes: [...decision.continuity.blockingNodeIds],
          occupiedRoutes: [...decision.continuity.blockingOccupiedRouteIds],
          nodeLabels: [...decision.continuity.blockingNodeLabelIds],
        },
      }];
    }),
    dragState: {
      activeRoutingPosition: positionFor(from, nodeId),
      activeLivePosition: from.liveDragPosition?.id === nodeId ? from.liveDragPosition.position : null,
      finalRoutingPosition: positionFor(to, nodeId),
    },
  };
}

function activeDragRemoteTransition(snapshot: PresentationDiagnosticSnapshot, routeId: string, nodeId: string, step: number): ActiveDragRemoteTransition {
  const decision = [...snapshot.routeDecisions].reverse().find((candidate) =>
    candidate.edgeId === routeId && (candidate.pass === "feedback" || candidate.pass === "first"),
  );
  const continuity = decision?.continuity;
  const reasons = continuity === undefined ? ["no active routing decision"] : [
    !continuity.previousRoutePresent ? "no previous route" : "",
    !continuity.draggedNodePresent ? "no drag identity" : "",
    continuity.isIncident ? "incident" : "",
    !continuity.isEligibleShape ? "ineligible shape" : "",
    continuity.priorRouteHasNodeInfluence ? "node influence" : "",
    continuity.priorRouteHasOccupiedPathConflict ? "occupied-path conflict" : "",
    continuity.priorRouteHasLabelCollision ? "label collision" : "",
  ].filter(Boolean);
  return {
    step,
    routingPosition: positionFor(snapshot, nodeId),
    routeId,
    pass: decision?.pass ?? null,
    usedPreviousRoute: decision?.usedPreviousRoute ?? null,
    reasons,
    blockers: {
      nodes: continuity ? [...continuity.blockingNodeIds] : [],
      occupiedRoutes: continuity ? [...continuity.blockingOccupiedRouteIds] : [],
      nodeLabels: continuity ? [...continuity.blockingNodeLabelIds] : [],
    },
  };
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!;
}

function summary(values: number[]): { median: number; p95: number; max: number } | null {
  if (!values.length) return null;
  return { median: percentile(values, 0.5)!, p95: percentile(values, 0.95)!, max: Math.max(...values) };
}

function performanceTimeStamp(timeStamp: number): number | null {
  if (!Number.isFinite(timeStamp)) return null;
  const now = performance.now();
  const relative = Math.abs(now - timeStamp) < 86400000 ? timeStamp : timeStamp - performance.timeOrigin;
  return Number.isFinite(relative) ? relative : null;
}

function nodeCenter(nodeId: string): { x: number; y: number } | null {
  const element = document.querySelector<SVGGElement>(`g[data-entity-id="${CSS.escape(nodeId)}"]`);
  if (!element) return null;
  const rect = element.querySelector<SVGRectElement>(".entity-body")?.getBoundingClientRect();
  if (!rect) return null;
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

function sampleRenderedDrag(): void {
  const drag = activeDragTiming;
  if (!drag) return;
  drag.framePending = false;
  const center = nodeCenter(drag.nodeId);
  if (center) {
    const expected = { x: drag.latestPointer.x + drag.grabOffset.x, y: drag.latestPointer.y + drag.grabOffset.y };
    const lag = Math.hypot(center.x - expected.x, center.y - expected.y);
    drag.nodeLagPixels.push(lag);
    drag.nodeLagSamples.push({ at: performance.now(), lag });
    drag.renderLatencies.push(performance.now() - drag.latestPointerAt);
    drag.processedRenderLatencies.push(performance.now() - drag.latestProcessedAt);
  }
}

function scheduleRenderedDragSample(): void {
  const drag = activeDragTiming;
  if (!drag || drag.framePending) return;
  drag.framePending = true;
  window.requestAnimationFrame(() => window.requestAnimationFrame(sampleRenderedDrag));
}

function finishDragTiming(): void {
  const drag = activeDragTiming;
  if (!drag) return;
  pendingDragEndSnapshot = latestDragPresentationSnapshot;
  pendingActiveDragRemoteChanges = [...changedNonIncidentRouteIdsDuringActiveDrag];
  const lagDuringLongTask = drag.nodeLagSamples
    .filter(({ at }) => drag.longTaskWindows.some(({ start, end }) => at >= start && at <= end))
    .map(({ lag }) => lag);
  const lagOutsideLongTask = drag.nodeLagSamples
    .filter(({ at }) => !drag.longTaskWindows.some(({ start, end }) => at >= start && at <= end))
    .map(({ lag }) => lag);
  const uniquePresentationInputs = new Set(drag.presentationInputIds).size;
  activeDragTiming = null;
  latestDragTimingReport = {
    nodeId: drag.nodeId,
    pointerMoves: drag.pointerMoves,
    presentationComputations: drag.computationDurations.length,
    uniquePresentationInputs,
    duplicatePresentationComputations: drag.computationDurations.length - uniquePresentationInputs,
    feedbackPassComputations: drag.feedbackPassComputations,
    presentationDurationMs: summary(drag.computationDurations),
    renderSamples: drag.renderLatencies.length,
    pointerToRenderMs: summary(drag.renderLatencies),
    processedToRenderMs: summary(drag.processedRenderLatencies),
    pointerToNodeLagPx: summary(drag.nodeLagPixels),
    eventAgeMs: summary(drag.eventAges),
    processingAgeMs: summary(drag.processingAges),
    latestVsProcessedPointerPx: summary(drag.latestVsProcessedPointerPixels),
    coalescedEvents: drag.coalescedEvents,
    longTaskDurationsMs: drag.longTaskDurationsMs,
    nodeLagDuringLongTaskPx: summary(lagDuringLongTask),
    nodeLagOutsideLongTaskPx: summary(lagOutsideLongTask),
    durationMs: performance.now() - drag.startedAt,
    remoteTransitions: activeDragRemoteTransitions,
  };
  window.dispatchEvent(new CustomEvent<DragTimingReport>(timingEvent, { detail: latestDragTimingReport }));
}

window.__liaisonScapePresentationTimingSink = (sample: PresentationTimingSample) => {
  if (!activeDragTiming) return;
  activeDragTiming.computationDurations.push(sample.durationMs);
  activeDragTiming.presentationInputIds.push(sample.presentationInputId);
  if (sample.feedbackApplied) activeDragTiming.feedbackPassComputations += 1;
};

window.__liaisonScapeDragPointerProcessingSink = (sample: DragPointerProcessingSample) => {
  const drag = activeDragTiming;
  if (!drag || drag.nodeId !== sample.nodeId) return;
  drag.latestProcessedAt = sample.processedAt;
  const eventAt = performanceTimeStamp(sample.eventTimeStamp);
  if (eventAt !== null) drag.processingAges.push(sample.processedAt - eventAt);
  drag.latestVsProcessedPointerPixels.push(Math.hypot(drag.latestPointer.x - sample.clientX, drag.latestPointer.y - sample.clientY));
};

const longTaskObserver = typeof PerformanceObserver === "undefined" ? null : new PerformanceObserver((list) => {
  if (!activeDragTiming) return;
  for (const entry of list.getEntries()) {
    activeDragTiming.longTaskDurationsMs.push(entry.duration);
    activeDragTiming.longTaskWindows.push({ start: entry.startTime, end: entry.startTime + entry.duration });
  }
});
try { longTaskObserver?.observe({ type: "longtask", buffered: false }); } catch { /* unsupported in this browser */ }

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const node = (event.target as Element | null)?.closest<SVGGElement>("g[data-entity-id]");
  if (!node) return;
  const nodeId = node.dataset.entityId;
  const center = nodeId ? nodeCenter(nodeId) : null;
  if (!nodeId || !center) return;
  latestDragPresentationSnapshot = null;
  activeDragRemoteTransitions = [];
  dragStartPresentationSnapshot = latestDiagnosticSnapshot;
  activeRemoteRouteSnapshots = new Map();
  dragEntryBaselineSnapshot = latestDiagnosticSnapshot;
  changedNonIncidentRouteIdsDuringActiveDrag = new Set();
  pendingDragEndSnapshot = null;
  pendingActiveDragRemoteChanges = [];
  activeDragTiming = {
    pointerId: event.pointerId,
    nodeId,
    startedAt: performance.now(),
    pointerMoves: 0,
    computationDurations: [],
    presentationInputIds: [],
    feedbackPassComputations: 0,
    renderLatencies: [],
    processedRenderLatencies: [],
    nodeLagPixels: [],
    nodeLagSamples: [],
    eventAges: [],
    processingAges: [],
    latestVsProcessedPointerPixels: [],
    coalescedEvents: 0,
    longTaskDurationsMs: [],
    longTaskWindows: [],
    latestPointer: { x: event.clientX, y: event.clientY },
    latestPointerAt: performance.now(),
    latestProcessedAt: performance.now(),
    grabOffset: { x: center.x - event.clientX, y: center.y - event.clientY },
    framePending: false,
  };
}, true);

document.addEventListener("pointermove", (event) => {
  const drag = activeDragTiming;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.pointerMoves += 1;
  const eventAt = performanceTimeStamp(event.timeStamp);
  if (eventAt !== null) drag.eventAges.push(performance.now() - eventAt);
  drag.coalescedEvents += typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents().length : 1;
  drag.latestPointer = { x: event.clientX, y: event.clientY };
  drag.latestPointerAt = performance.now();
  scheduleRenderedDragSample();
}, true);

document.addEventListener("pointerup", (event) => { if (activeDragTiming?.pointerId === event.pointerId) finishDragTiming(); }, true);
document.addEventListener("pointercancel", (event) => { if (activeDragTiming?.pointerId === event.pointerId) finishDragTiming(); }, true);

window.__liaisonScapePresentationDiagnosticSink = (snapshot) => {
  latestDiagnosticSnapshot = snapshot;
  if (activeDragTiming && snapshot.phase === "node-drag-active") {
    if (dragEntryBaselineSnapshot) {
      latestDragEntryReport = routeTransitionReport("entry", dragEntryBaselineSnapshot, snapshot, activeDragTiming.nodeId, []);
      window.dispatchEvent(new CustomEvent<RouteTransitionReport>(dragEntryEvent, { detail: latestDragEntryReport }));
      const entryChangedRoutes = changedRouteIds(dragEntryBaselineSnapshot, snapshot);
      const edgesById = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
      for (const routeId of entryChangedRoutes) {
        const edge = edgesById.get(routeId);
        if (edge && edge.sourceId !== activeDragTiming.nodeId && edge.targetId !== activeDragTiming.nodeId) activeRemoteRouteSnapshots.set(routeId, snapshot);
      }
      dragEntryBaselineSnapshot = null;
    }
    if (latestDragPresentationSnapshot) {
      const edgesById = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
      const changedRoutes = changedRouteIds(latestDragPresentationSnapshot, snapshot);
      for (const routeId of changedRoutes) {
        const edge = edgesById.get(routeId);
        if (edge && edge.sourceId !== activeDragTiming.nodeId && edge.targetId !== activeDragTiming.nodeId) {
          changedNonIncidentRouteIdsDuringActiveDrag.add(routeId);
          activeRemoteRouteSnapshots.set(routeId, snapshot);
          activeDragRemoteTransitions.push(activeDragRemoteTransition(snapshot, routeId, activeDragTiming.nodeId, activeDragRemoteTransitions.length + 1));
        }
      }
    }
    latestDragPresentationSnapshot = snapshot;
  }
  else if (pendingDragEndSnapshot && snapshot.phase !== "node-drag-active") {
    latestRouteTransitionReport = routeTransitionReport("pointer-up", pendingDragEndSnapshot, snapshot, latestDragTimingReport?.nodeId ?? "unknown", pendingActiveDragRemoteChanges, dragStartPresentationSnapshot, activeRemoteRouteSnapshots);
    window.dispatchEvent(new CustomEvent<RouteTransitionReport>(routeTransitionEvent, { detail: latestRouteTransitionReport }));
    pendingDragEndSnapshot = null;
    pendingPostIdleSnapshot = snapshot.phase === "node-drag-finalizing" ? snapshot : null;
  }
  else if (pendingPostIdleSnapshot && snapshot.phase === "idle") {
    latestPostIdleReport = routeTransitionReport("post-idle", pendingPostIdleSnapshot, snapshot, latestDragTimingReport?.nodeId ?? "unknown", []);
    window.dispatchEvent(new CustomEvent<RouteTransitionReport>(postIdleEvent, { detail: latestPostIdleReport }));
    pendingPostIdleSnapshot = null;
  }
  window.dispatchEvent(new CustomEvent<PresentationDiagnosticSnapshot>(diagnosticEvent, { detail: snapshot }));
};

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (requestedUrl === diagnosticDatasetUrl) return originalFetch(localDatasetUrl, init);
  return originalFetch(input, init);
}) as typeof window.fetch;

if (!window.location.hash.includes("datasetUrl=")) {
  window.location.hash = `datasetUrl=${encodeURIComponent(diagnosticDatasetUrl)}`;
}

function distance(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : value.toFixed(1);
}

function DiagnosticMap({ snapshot, routeId }: { snapshot: PresentationDiagnosticSnapshot; routeId: string }) {
  const diagnostic = diagnoseRoute(snapshot, routeId);
  if (!diagnostic) return null;
  const current = diagnostic.variants.find(({ name }) => name === "current")!;
  const straight = diagnostic.variants.find(({ name }) => name === "straight")!;
  const labels = [...snapshot.provisionalNodeLabels, ...snapshot.nodeLabels.map(([, label]) => label)];
  const xValues = [...snapshot.nodes.map((node) => (snapshot.positions[node.id] ?? node).x), ...labels.flatMap((label) => [label.x - label.width / 2, label.x + label.width / 2])];
  const yValues = [...snapshot.nodes.map((node) => (snapshot.positions[node.id] ?? node).y), ...labels.flatMap((label) => [label.y - label.height / 2, label.y + label.height / 2])];
  const minX = Math.min(...xValues) - 48;
  const minY = Math.min(...yValues) - 48;
  const width = Math.max(1, Math.max(...xValues) - minX + 48);
  const height = Math.max(1, Math.max(...yValues) - minY + 48);
  return <svg className="actual-inspection-diagnostic-map" viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label="Derived routing diagnostic map">
    {snapshot.provisionalNodeLabels.map((label, index) => <rect key={`provisional-${snapshot.nodes[index]!.id}`} className="actual-inspection-provisional-label" x={label.x - label.width / 2} y={label.y - label.height / 2} width={label.width} height={label.height} />)}
    {snapshot.nodeLabels.map(([id, label]) => <rect key={`final-${id}`} className="actual-inspection-final-label" x={label.x - label.width / 2} y={label.y - label.height / 2} width={label.width} height={label.height} />)}
    <path className="actual-inspection-straight-route" d={straight.geometry.path} />
    <path className="actual-inspection-current-route" d={current.geometry.path} />
    {diagnostic.crossings.map(({ relationId, point }) => <circle key={relationId} className="actual-inspection-crossing" cx={point.x} cy={point.y} r="5" />)}
    {snapshot.nodes.map((node) => { const position = snapshot.positions[node.id] ?? node; return <g key={node.id}><circle className="actual-inspection-node" cx={position.x} cy={position.y} r="16" /><text className="actual-inspection-node-text" x={position.x} y={position.y - 22}>{node.label}</text></g>; })}
  </svg>;
}

function PresentationDiagnostics() {
  const [snapshot, setSnapshot] = useState<PresentationDiagnosticSnapshot | null>(latestDiagnosticSnapshot);
  const [routeId, setRouteId] = useState("entity-10");
  useEffect(() => {
    const receive = (event: Event) => setSnapshot((event as CustomEvent<PresentationDiagnosticSnapshot>).detail);
    window.addEventListener(diagnosticEvent, receive);
    if (latestDiagnosticSnapshot) setSnapshot(latestDiagnosticSnapshot);
    return () => window.removeEventListener(diagnosticEvent, receive);
  }, []);
  useEffect(() => {
    if (snapshot && !snapshot.edges.some((edge) => edge.id === routeId)) setRouteId(snapshot.edges[0]?.id ?? "");
  }, [routeId, snapshot]);
  useEffect(() => {
    for (const element of document.querySelectorAll(".edge-group.dev-route-diagnostic-selected")) element.classList.remove("dev-route-diagnostic-selected");
    if (!routeId) return;
    document.querySelector(`.edge-group[data-relation-id="${CSS.escape(routeId)}"]`)?.classList.add("dev-route-diagnostic-selected");
  }, [routeId, snapshot]);
  const diagnostic = useMemo(() => snapshot && routeId ? diagnoseRoute(snapshot, routeId) : null, [routeId, snapshot]);
  if (!snapshot || !diagnostic) return <p className="actual-inspection-diagnostic-loading">Loading exact Product presentation snapshot…</p>;
  const current = diagnostic.variants.find(({ name }) => name === "current")!;
  const straight = diagnostic.variants.find(({ name }) => name === "straight")!;
  const decision = routeDecisionFor(snapshot, routeId);
  const activeRecovery = decision?.activeRecovery;
  return <details className="actual-inspection-diagnostics" open>
    <summary>Routing / label diagnostic — derived from the current actual Product state</summary>
    <p className="actual-inspection-diagnostic-note">Dev-only explanation. Orange = provisional node-label bounds used by routing; cyan = final node-label bounds; solid red = current Product route; dotted graphite = straight counterfactual.</p>
    <label>Inspect route <select value={routeId} onChange={(event) => setRouteId(event.target.value)} aria-label="Route diagnostic target">
      {snapshot.edges.map((edge) => {
        const source = snapshot.nodes.find(({ id }) => id === edge.sourceId)?.label ?? edge.sourceId;
        const target = snapshot.nodes.find(({ id }) => id === edge.targetId)?.label ?? edge.targetId;
        return <option key={edge.id} value={edge.id}>{source} → {target} — {edge.label || edge.id}</option>;
      })}
    </select></label>
    <div className="actual-inspection-diagnostic-grid">
      <DiagnosticMap snapshot={snapshot} routeId={routeId} />
      <div>
        <p><strong>{diagnostic.sourceLabel} → {diagnostic.targetLabel}</strong></p>
        <p>Current offset {distance(current.offset)}; straight length {straight.length.toFixed(1)}; current length {current.length.toFixed(1)}.</p>
        <ul>
          {diagnostic.variants.map((variant) => <li key={variant.name}><code>{variant.name}</code>: offset {distance(variant.offset)}, length {variant.length.toFixed(1)}, nearest provisional {variant.nearestProvisionalLabel ? `${variant.nearestProvisionalLabel.id} / ${variant.nearestProvisionalLabel.distance.toFixed(1)}` : "none"}, {variant.matchesCurrent ? "same as current" : "different geometry"}</li>)}
        </ul>
        {activeRecovery && <p>Active recovery: prior direct-obstacle marker {activeRecovery.previousRouteObstacleId ?? "none"}; matches active drag {activeRecovery.provenanceMatchesActiveDrag ? "yes" : "no"}; fresh route safe {activeRecovery.freshRouteIsSafe ? "yes" : "no"} (node {activeRecovery.freshRouteHasNodeInfluence ? "blocked" : "clear"}, occupied path {activeRecovery.freshRouteHasOccupiedPathConflict ? "blocked" : "clear"}, label {activeRecovery.freshRouteHasLabelCollision ? "blocked" : "clear"}); selected fresh recovery {decision?.recoveredCurrentRoute ? "yes" : "no"}.</p>}
        <p>Final labels that moved after routing: {diagnostic.provisionalFinalMoves.slice(0, 4).map(({ id, distance: moved }) => `${id} ${moved.toFixed(1)}`).join(", ") || "none"}.</p>
        <p>Non-adjacent sampled crossings on this route: {diagnostic.crossings.map(({ relationId }) => relationId).join(", ") || "none"}.</p>
        <ul>{diagnostic.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>
    </div>
  </details>;
}

function DragTimingDiagnostics() {
  const [report, setReport] = useState<DragTimingReport | null>(latestDragTimingReport);
  const [routeTransition, setRouteTransition] = useState<RouteTransitionReport | null>(latestRouteTransitionReport);
  const [entryTransition, setEntryTransition] = useState<RouteTransitionReport | null>(latestDragEntryReport);
  const [postIdleTransition, setPostIdleTransition] = useState<RouteTransitionReport | null>(latestPostIdleReport);
  useEffect(() => {
    const receive = (event: Event) => setReport((event as CustomEvent<DragTimingReport>).detail);
    window.addEventListener(timingEvent, receive);
    return () => window.removeEventListener(timingEvent, receive);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => setRouteTransition((event as CustomEvent<RouteTransitionReport>).detail);
    window.addEventListener(routeTransitionEvent, receive);
    return () => window.removeEventListener(routeTransitionEvent, receive);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => setEntryTransition((event as CustomEvent<RouteTransitionReport>).detail);
    window.addEventListener(dragEntryEvent, receive);
    return () => window.removeEventListener(dragEntryEvent, receive);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => setPostIdleTransition((event as CustomEvent<RouteTransitionReport>).detail);
    window.addEventListener(postIdleEvent, receive);
    return () => window.removeEventListener(postIdleEvent, receive);
  }, []);
  const format = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? "n/a" : value.toFixed(digits);
  return <details className="actual-inspection-drag-timing" open>
    <summary>Dev-only drag timing diagnostic</summary>
    {report ? <p><strong>{report.nodeId}</strong>: {report.pointerMoves} pointermoves, {report.presentationComputations} presentation computations, {report.renderSamples} render samples, duration {format(report.durationMs)} ms.</p> : <p>No completed node drag measured yet.</p>}
    {report && <ul>
      <li>presentation duration median / p95 / max: {format(report.presentationDurationMs?.median)} / {format(report.presentationDurationMs?.p95)} / {format(report.presentationDurationMs?.max)} ms</li>
      <li>presentation inputs / duplicate computations / feedback passes: {report.uniquePresentationInputs} / {report.duplicatePresentationComputations} / {report.feedbackPassComputations}</li>
      <li>pointer→render median / p95 / max: {format(report.pointerToRenderMs?.median)} / {format(report.pointerToRenderMs?.p95)} / {format(report.pointerToRenderMs?.max)} ms</li>
      <li>processed pointer→render median / p95 / max: {format(report.processedToRenderMs?.median)} / {format(report.processedToRenderMs?.p95)} / {format(report.processedToRenderMs?.max)} ms</li>
      <li>pointer→node lag median / p95 / max: {format(report.pointerToNodeLagPx?.median)} / {format(report.pointerToNodeLagPx?.p95)} / {format(report.pointerToNodeLagPx?.max)} px</li>
      <li>node lag during / outside Long Tasks (median / p95 / max): {format(report.nodeLagDuringLongTaskPx?.median)} / {format(report.nodeLagDuringLongTaskPx?.p95)} / {format(report.nodeLagDuringLongTaskPx?.max)} px; {format(report.nodeLagOutsideLongTaskPx?.median)} / {format(report.nodeLagOutsideLongTaskPx?.p95)} / {format(report.nodeLagOutsideLongTaskPx?.max)} px</li>
      <li>event age / processing age median: {format(report.eventAgeMs?.median)} / {format(report.processingAgeMs?.median)} ms; latest-vs-processed pointer max: {format(report.latestVsProcessedPointerPx?.max)} px; coalesced samples: {report.coalescedEvents}</li>
      <li>Long Tasks during drag: {report.longTaskDurationsMs.length ? report.longTaskDurationsMs.map((duration) => `${duration.toFixed(1)} ms`).join(", ") : "none observed"}</li>
    </ul>}
    {routeTransition && <p>drag-time → pointer-up route transition: same node geometry {routeTransition.sameNodeGeometry ? "YES" : "NO"}; changed routes {routeTransition.changedRouteIds.join(", ") || "none"}.</p>}
    {routeTransition && <ul>
      <li>transition phase: {routeTransition.fromPhase} → {routeTransition.toPhase}; derived as {routeTransition.fromDerivationPhase} → {routeTransition.toDerivationPhase}; same routing geometry: {routeTransition.sameNodeGeometry ? "YES" : "NO"}</li>
      <li>drag-state positions: active routing {routeTransition.dragState.activeRoutingPosition ? `${format(routeTransition.dragState.activeRoutingPosition.x)}, ${format(routeTransition.dragState.activeRoutingPosition.y)}` : "n/a"}; active live {routeTransition.dragState.activeLivePosition ? `${format(routeTransition.dragState.activeLivePosition.x)}, ${format(routeTransition.dragState.activeLivePosition.y)}` : "n/a"}; final routing {routeTransition.dragState.finalRoutingPosition ? `${format(routeTransition.dragState.finalRoutingPosition.x)}, ${format(routeTransition.dragState.finalRoutingPosition.y)}` : "n/a"}</li>
      <li>non-incident changed routes: {routeTransition.changedNonIncidentRouteIds.join(", ") || "none"}</li>
      <li>non-incident changes during active drag: {routeTransition.changedNonIncidentRouteIdsDuringActiveDrag.join(", ") || "none"}</li>
      <li>non-incident continuity blocks: {routeTransition.continuityBlocks.map(({ routeId, pass, processingIndex, usedPreviousRoute, reasons }) => `${routeId} [${pass} #${processingIndex}; previous route ${usedPreviousRoute ? "used" : "not used"}: ${reasons.join(", ") || "no rejected continuity condition"}]`).join("; ") || "none"}</li>
      <li>changed node labels: {routeTransition.changedNodeLabelIds.join(", ") || "none"}; changed relation labels: {routeTransition.changedRelationLabelIds.join(", ") || "none"}</li>
      <li>route shape transitions: {routeTransition.routeShapeComparisons.map(({ routeId, incident, from, to }) => `${routeId} (${incident ? "incident" : "remote"}) ${from.curved ? "curved" : "straight"} ${format(from.length)} → ${to.curved ? "curved" : "straight"} ${format(to.length)}`).join("; ") || "none"}</li>
      <li>selected candidate scores: {routeTransition.routeShapeComparisons.map(({ routeId, fromCandidates, toCandidates }) => `${routeId} active [${candidateSummary(fromCandidates)}] → final [${candidateSummary(toCandidates)}]`).join("; ") || "none"}</li>
      <li>remote route outcomes: {routeTransition.remoteRouteOutcomes.map(remoteOutcomeSummary).join("; ") || "none"}</li>
      <li>relation-label transitions: {routeTransition.relationLabelComparisons.map(({ routeId, from, to }) => `${routeId} ${from ? `${format(from.x)}, ${format(from.y)}` : "none"} → ${to ? `${format(to.x)}, ${format(to.y)}` : "none"}`).join("; ") || "none"}</li>
    </ul>}
    {report?.remoteTransitions.length ? <details>
      <summary>active-drag remote route transitions ({report.remoteTransitions.length})</summary>
      <ul>{report.remoteTransitions.map((transition) => <li key={`${transition.step}-${transition.routeId}`}>#{transition.step} {transition.routeId} at {transition.routingPosition ? `${format(transition.routingPosition.x)}, ${format(transition.routingPosition.y)}` : "n/a"}: {transition.pass ?? "no pass"}, previous route {transition.usedPreviousRoute === null ? "n/a" : transition.usedPreviousRoute ? "used" : "not used"}; {transition.reasons.join(", ") || "no rejection"}; blockers node {transition.blockers.nodes.join(", ") || "none"}, route {transition.blockers.occupiedRoutes.join(", ") || "none"}, label {transition.blockers.nodeLabels.join(", ") || "none"}.</li>)}</ul>
    </details> : null}
    {entryTransition && <p>pointer-down / drag-entry transition: same node geometry {entryTransition.sameNodeGeometry ? "YES" : "NO"}; changed routes {entryTransition.changedRouteIds.join(", ") || "none"}; derived as {entryTransition.fromDerivationPhase} → {entryTransition.toDerivationPhase}.</p>}
    {postIdleTransition && <p>post-finalization idle transition: same node geometry {postIdleTransition.sameNodeGeometry ? "YES" : "NO"}; changed routes {postIdleTransition.changedRouteIds.join(", ") || "none"}; derived as {postIdleTransition.fromDerivationPhase} → {postIdleTransition.toDerivationPhase}.</p>}
  </details>;
}

function ActualProductInspection() {
  function changeSpacing(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    const params = new URLSearchParams(window.location.search);
    params.set("spacing", next);
    window.location.href = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  }

  return <>
    <div className="actual-inspection-seam" aria-label="Diagnostic fixture controls">
      <span>Actual Product diagnostic fixture · {strictModeOff ? "production-like / StrictMode off (Vite dev)" : "development / StrictMode on"}</span>
      <label>Spacing <select value={selectedSpacingVariant} onChange={changeSpacing} aria-label="Spacing candidate">
        <option value="low-density">low-density recovery control</option>
        <option value="control">control / 96</option>
        <option value="108">108</option>
        <option value="120">120</option>
        <option value="132">132</option>
        <option value="144">144</option>
        <option value="160">160</option>
        <option value="180">180</option>
        <option value="200">200</option>
        <option value="220">220</option>
      </select></label>
      <span className="actual-inspection-seam-note">Reloads the actual Product workspace with the selected diagnostic fixture.</span>
    </div>
    <PresentationDiagnostics />
    <DragTimingDiagnostics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(strictModeOff ? <ActualProductInspection /> : <StrictMode><ActualProductInspection /></StrictMode>);
