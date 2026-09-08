import type { GraphNode } from "./dataset.ts";
import type { DerivedAutomaticRoute, RoutingGraphEdge, SelfLoopOverride } from "./graph-presentation.ts";
import type { LabelRect, Point } from "./viewport.ts";

/**
 * Opt-in development seam for observing the exact Product presentation
 * snapshots that have already been derived by App. Production callers do not
 * install a sink, so this has no Product UI or persistence behavior.
 */
export type PresentationDiagnosticSnapshot = {
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

declare global {
  interface Window {
    __liaisonScapePresentationDiagnosticSink?: (snapshot: PresentationDiagnosticSnapshot) => void;
  }
}

export function publishPresentationDiagnostic(snapshot: PresentationDiagnosticSnapshot): void {
  if (import.meta.env.DEV) window.__liaisonScapePresentationDiagnosticSink?.(snapshot);
}
