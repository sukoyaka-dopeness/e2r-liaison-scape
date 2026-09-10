import type {
  AutomaticRouteDecision,
  DerivedAutomaticRoute,
} from "./graph-presentation.ts";
import type { LabelRect, RouteYieldPath } from "./viewport.ts";

/** Read-only output of the sequential route-selection authority for one pass. */
export type RouteSelectionSnapshot = Readonly<{
  pass: AutomaticRouteDecision["pass"];
  routes: readonly DerivedAutomaticRoute[];
}>;

/** Read-only output of the ordered Relation-label placement stage. */
export type RelationLabelSnapshot = Readonly<{
  labels: ReadonlyMap<string, LabelRect>;
}>;

/** Read-only output of the ordered Node-label placement stage. */
export type NodeLabelSnapshot = Readonly<{
  labels: ReadonlyMap<string, LabelRect>;
  yieldingRoutes: readonly RouteYieldPath[];
}>;

/** Complete derived presentation state for one route/label pass. */
export type PresentationPassSnapshot = Readonly<{
  route: RouteSelectionSnapshot;
  relationLabel: RelationLabelSnapshot;
  nodeLabel: NodeLabelSnapshot;
}>;

/** Explicit input boundary for the bounded feedback pass. */
export type FeedbackStageInput = Readonly<{
  labelFree: RouteSelectionSnapshot;
  first: PresentationPassSnapshot;
  finalRouteLabels: readonly LabelRect[];
  shouldRun: boolean;
}>;

export function createRouteSelectionSnapshot(
  pass: AutomaticRouteDecision["pass"],
  routes: readonly DerivedAutomaticRoute[],
): RouteSelectionSnapshot {
  return Object.freeze({ pass, routes: Object.freeze([...routes]) });
}

export function createRelationLabelSnapshot(
  labels: ReadonlyMap<string, LabelRect>,
): RelationLabelSnapshot {
  return Object.freeze({ labels: new Map(labels) });
}

export function createNodeLabelSnapshot(
  labels: ReadonlyMap<string, LabelRect>,
  yieldingRoutes: readonly RouteYieldPath[],
): NodeLabelSnapshot {
  return Object.freeze({ labels: new Map(labels), yieldingRoutes: Object.freeze([...yieldingRoutes]) });
}

export function createPresentationPassSnapshot(
  route: RouteSelectionSnapshot,
  relationLabel: ReadonlyMap<string, LabelRect>,
  nodeLabel: ReadonlyMap<string, LabelRect>,
  yieldingRoutes: readonly RouteYieldPath[],
): PresentationPassSnapshot {
  return Object.freeze({
    route,
    relationLabel: createRelationLabelSnapshot(relationLabel),
    nodeLabel: createNodeLabelSnapshot(nodeLabel, yieldingRoutes),
  });
}

export function createFeedbackStageInput(
  labelFree: RouteSelectionSnapshot,
  first: PresentationPassSnapshot,
  finalRouteLabels: readonly LabelRect[],
  shouldRun: boolean,
): FeedbackStageInput {
  return Object.freeze({
    labelFree,
    first,
    finalRouteLabels: Object.freeze([...finalRouteLabels]),
    shouldRun,
  });
}
