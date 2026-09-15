import { relationLabelDisplayWidth } from "./viewport.ts";
import type { DerivedAutomaticRoute } from "./graph-presentation.ts";

export type ProductOrientationAwareLabelCapacity = Readonly<{
  relationId: string;
  bundleKey: string;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  orientation: "horizontal" | "vertical" | "diagonal";
  labelWidth: number;
  labelHeight: number;
  tangentialFootprint: number;
  normalFootprint: number;
  routeLength: number;
  usableOwnerRouteSpan: number;
  spanDeficit: number;
  verticalWeight: number;
  staggerOffset: number;
}>;

export type ProductOrientationAwareLabelPolicy = Readonly<{
  staggerByRelationId: Readonly<Record<string, number>>;
  rows: readonly ProductOrientationAwareLabelCapacity[];
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lengthOfRoute(route: DerivedAutomaticRoute) {
  return route.samples.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.samples[index]!.x, point.y - route.samples[index]!.y), 0);
}

function routeTangent(route: DerivedAutomaticRoute) {
  const midpoint = Math.min(route.samples.length - 1, Math.max(0, 20));
  const previous = route.samples[Math.max(0, midpoint - 1)] ?? route.samples[0]!;
  const next = route.samples[Math.min(route.samples.length - 1, midpoint + 1)] ?? route.samples.at(-1)!;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / distance, y: dy / distance };
}

function orientation(verticalWeight: number, horizontalWeight: number): ProductOrientationAwareLabelCapacity["orientation"] {
  if (verticalWeight > 0.35 && horizontalWeight > 0.35 && Math.max(verticalWeight, horizontalWeight) < 0.95) return "diagonal";
  return verticalWeight > horizontalWeight ? "vertical" : "horizontal";
}

/**
 * Diagnostic-only one-line label capacity model. It reports rectangle
 * projections and proposes arc-length offsets; it does not change Dataset
 * strings, manual anchors, or the authority of final Product placement.
 */
export function deriveProductOrientationAwareLabelPolicy(
  routes: readonly DerivedAutomaticRoute[],
): ProductOrientationAwareLabelPolicy {
  const groups = new Map<string, DerivedAutomaticRoute[]>();
  for (const route of routes) {
    if (route.parallelCount <= 1 || route.sourceId === route.targetId) continue;
    const key = [route.sourceId, route.targetId].sort().join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  const rows: ProductOrientationAwareLabelCapacity[] = [];
  for (const [bundleKey, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
    const base = ordered.map((route) => {
      const tangent = routeTangent(route);
      const normal = { x: -tangent.y, y: tangent.x };
      const labelWidth = relationLabelDisplayWidth(route.label);
      const labelHeight = 22;
      const tangentialFootprint = labelWidth * Math.abs(tangent.x) + labelHeight * Math.abs(tangent.y);
      const normalFootprint = labelWidth * Math.abs(tangent.y) + labelHeight * Math.abs(tangent.x);
      const routeLength = lengthOfRoute(route);
      const usableOwnerRouteSpan = Math.max(0, routeLength - 120);
      const spanDeficit = Math.max(0, tangentialFootprint - usableOwnerRouteSpan);
      const verticalWeight = Math.abs(tangent.y);
      const horizontalWeight = Math.abs(tangent.x);
      return { route, tangent, normal, labelWidth, labelHeight, tangentialFootprint, normalFootprint, routeLength, usableOwnerRouteSpan, spanDeficit, verticalWeight, horizontalWeight };
    });
    const representative = base.reduce((left, right) => left.normalFootprint >= right.normalFootprint ? left : right);
    const staggerStep = clamp(
      representative.verticalWeight * representative.normalFootprint * 0.8
        + (1 - representative.verticalWeight) * Math.min(24, representative.spanDeficit * 0.4),
      0,
      48,
    );
    for (const [index, item] of base.entries()) {
      const centered = ordered.length <= 1 ? 0 : index - (ordered.length - 1) / 2;
      const canonicalSign = item.route.sourceId.localeCompare(item.route.targetId) <= 0 ? 1 : -1;
      rows.push({
        relationId: item.route.id,
        bundleKey,
        tangent: item.tangent,
        normal: item.normal,
        orientation: orientation(item.verticalWeight, item.horizontalWeight),
        labelWidth: item.labelWidth,
        labelHeight: item.labelHeight,
        tangentialFootprint: item.tangentialFootprint,
        normalFootprint: item.normalFootprint,
        routeLength: item.routeLength,
        usableOwnerRouteSpan: item.usableOwnerRouteSpan,
        spanDeficit: item.spanDeficit,
        verticalWeight: item.verticalWeight,
        staggerOffset: canonicalSign * centered * staggerStep,
      });
    }
  }
  return {
    staggerByRelationId: Object.fromEntries(rows.map((row) => [row.relationId, row.staggerOffset])),
    rows,
  };
}
