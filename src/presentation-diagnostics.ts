import type { GraphNode } from "./dataset.ts";
import type { AutomaticNodeLabelRecoveryTrace, AutomaticPresentationProfiler, AutomaticRouteDecision, DerivedAutomaticRoute, RoutingGraphEdge, SelfLoopOverride } from "./graph-presentation.ts";
import type { LabelRect, Point } from "./viewport.ts";

/**
 * Opt-in development seam for observing the exact Product presentation
 * snapshots that have already been derived by App. Production callers do not
 * install a sink, so this has no Product UI or persistence behavior.
 */
export type PresentationDiagnosticSnapshot = {
  /**
   * Render-phase state from the actual Product. This is development-only
   * observation metadata: it is neither persisted nor consumed by routing.
   */
  phase: "idle" | "node-drag-active" | "node-drag-finalizing";
  /**
   * Phase at which the displayed routes and labels were derived. This can
   * intentionally differ from `phase` when a drag-state-only render reuses a
   * safe existing presentation.
   */
  derivationPhase: "idle" | "node-drag-active" | "node-drag-finalizing";
  draggedNodeId?: string;
  liveDragPosition: { id: string; position: Point } | null;
  presentationRevision: number;
  feedbackApplied: boolean;
  routeDecisions: readonly AutomaticRouteDecision[];
  nodes: readonly GraphNode[];
  edges: readonly RoutingGraphEdge[];
  positions: Readonly<Record<string, Point>>;
  edgeCurveOffsets: Readonly<Record<string, number>>;
  selfLoopOverrides: Readonly<Record<string, SelfLoopOverride>>;
  provisionalNodeLabels: readonly LabelRect[];
  routedEdges: readonly DerivedAutomaticRoute[];
  relationLabels: readonly [string, LabelRect][];
  nodeLabels: readonly [string, LabelRect][];
};

export type PresentationTimingSample = {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  presentationInputId: number;
  presentationRevision: number;
  activeNodeDrag: boolean;
  feedbackApplied: boolean;
  profiler?: AutomaticPresentationProfiler;
};

export type NodeLabelLifecycleDiagnostic = {
  phase: "idle" | "node-drag-active" | "node-drag-finalizing";
  derivationPhase: "idle" | "node-drag-active" | "node-drag-finalizing";
  presentationRevision: number;
  draggedNodeId?: string;
  activeNodeDrag: boolean;
  feedbackApplied: boolean;
  previousSnapshotSize: number;
  previousSnapshotSource: "normal-effect-ref" | "diagnostic-provided" | "diagnostic-ablation-empty";
  nextSnapshotSize: number;
  recoveryTraces: readonly AutomaticNodeLabelRecoveryTrace[];
};

export type DragPointerProcessingSample = {
  nodeId: string;
  eventTimeStamp: number;
  processedAt: number;
  clientX: number;
  clientY: number;
};

export type DatasetOpenTimingSample = {
  phase: "open-start" | "raw-available" | "parsed" | "accepted" | "graph-prepared" | "presentation-derived" | "graph-stable";
  source: "handoff" | "local" | "sample" | "new";
  at: number;
  nodeCount?: number;
  edgeCount?: number;
  durations?: Readonly<Record<string, number>>;
  initialLayout?: {
    authority: "stored" | "mixed-completion" | "current" | "bounded-provider" | "diagnostic-candidate";
    provider: string;
    strategy?: string;
    status?: string;
    reason?: string;
  };
};

declare global {
  interface Window {
    __liaisonScapePresentationDiagnosticSink?: (snapshot: PresentationDiagnosticSnapshot) => void;
    __liaisonScapePresentationTimingSink?: (sample: PresentationTimingSample) => void;
    __liaisonScapeNodeLabelLifecycleSink?: (sample: NodeLabelLifecycleDiagnostic) => void;
    __liaisonScapeNodeLabelLifecycleEvents?: NodeLabelLifecycleDiagnostic[];
    __liaisonScapeDragPointerProcessingSink?: (sample: DragPointerProcessingSample) => void;
    __liaisonScapeDatasetOpenTimingSink?: (sample: DatasetOpenTimingSample) => void;
    __liaisonScapeDatasetOpenTimingEvents?: DatasetOpenTimingSample[];
  }
}

export function publishPresentationDiagnostic(snapshot: PresentationDiagnosticSnapshot): void {
  if (import.meta.env.DEV) window.__liaisonScapePresentationDiagnosticSink?.(snapshot);
}

export function publishPresentationTiming(sample: PresentationTimingSample): void {
  if (import.meta.env.DEV) window.__liaisonScapePresentationTimingSink?.(sample);
}

export function publishNodeLabelLifecycleDiagnostic(sample: NodeLabelLifecycleDiagnostic): void {
  if (import.meta.env.DEV) {
    (window.__liaisonScapeNodeLabelLifecycleEvents ??= []).push(sample);
    window.__liaisonScapeNodeLabelLifecycleSink?.(sample);
  }
}

export function publishDragPointerProcessing(sample: DragPointerProcessingSample): void {
  if (import.meta.env.DEV) window.__liaisonScapeDragPointerProcessingSink?.(sample);
}

export function publishDatasetOpenTiming(sample: DatasetOpenTimingSample): void {
  const timingDiagnostic = new URLSearchParams(window.location.search).get("diagnostic") === "timing";
  if (import.meta.env.DEV || timingDiagnostic) {
    if (timingDiagnostic) (window.__liaisonScapeDatasetOpenTimingEvents ??= []).push(sample);
    window.__liaisonScapeDatasetOpenTimingSink?.(sample);
  }
}
