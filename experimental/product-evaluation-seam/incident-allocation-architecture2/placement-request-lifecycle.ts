export type PlacementRequestPhase = "initial-open" | "idle" | "dragging" | "dataset-replacing" | "navigating";

export type PlacementRequestContext = {
  phase: PlacementRequestPhase;
  requestToken: string;
  currentToken: string;
  hasAuthoredCoordinates: boolean;
  hasManualRouteOrLabel: boolean;
};

export type PlacementRequestDecision =
  | { action: "apply"; reason: "initial-open" | "idle-capacity-negotiation" }
  | { action: "defer"; reason: "active-drag" | "dataset-transition" | "manual-authority" }
  | { action: "discard"; reason: "stale-request" | "cancelled" | "no-request" };

/** Pure advisory lifecycle gate; it never mutates coordinates or dirty state. */
export function decidePlacementRequestLifecycle(
  context: PlacementRequestContext | null,
  cancelled = false,
): PlacementRequestDecision {
  if (!context) return { action: "discard", reason: "no-request" };
  if (cancelled) return { action: "discard", reason: "cancelled" };
  if (context.requestToken !== context.currentToken) return { action: "discard", reason: "stale-request" };
  if (context.phase === "dragging") return { action: "defer", reason: "active-drag" };
  if (context.phase === "dataset-replacing" || context.phase === "navigating") return { action: "defer", reason: "dataset-transition" };
  if (context.hasAuthoredCoordinates || context.hasManualRouteOrLabel) return { action: "defer", reason: "manual-authority" };
  return { action: "apply", reason: context.phase === "initial-open" ? "initial-open" : "idle-capacity-negotiation" };
}
