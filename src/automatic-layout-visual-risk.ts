import type { BoundedAutomaticPresentation } from "./graph-presentation.ts";
import { fitGraphView, type LabelRect } from "./viewport.ts";

type Point = Readonly<{ x: number; y: number }>;

export type AutomaticLayoutVisualRiskMetrics = Readonly<{
  fitScale: number;
  effectiveFontScale: number;
  labelScreenOccupancy: number;
  nodeNodeOverlapPairs: number;
  nodeRelationOverlapPairs: number;
  relationRelationOverlapPairs: number;
  totalLabelOverlapPairs: number;
  foreignRouteRelationLabelHits: number;
  relationLabelsWithForeignRouteHit: number;
  ownershipAmbiguityCount: number;
}>;

function overlaps(left: LabelRect, right: LabelRect): boolean {
  return Math.abs(left.x - right.x) < (left.width + right.width) / 2
    && Math.abs(left.y - right.y) < (left.height + right.height) / 2;
}

function distanceToRect(point: Point, rect: LabelRect): number {
  return Math.hypot(
    Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0),
    Math.max(Math.abs(point.y - rect.y) - rect.height / 2, 0),
  );
}

function routeDistance(samples: readonly Point[], label: LabelRect): number {
  return Math.min(...samples.map((point) => distanceToRect(point, label)), Infinity);
}

/** Diagnostic-only visual-risk decomposition over current Product presentation output. */
export function deriveAutomaticLayoutVisualRiskMetrics(input: Readonly<{
  positions: Readonly<Record<string, Point>>;
  presentation: BoundedAutomaticPresentation;
  viewportWidth?: number;
  viewportHeight?: number;
}>): AutomaticLayoutVisualRiskMetrics {
  const viewportWidth = input.viewportWidth ?? 800;
  const viewportHeight = input.viewportHeight ?? 500;
  const fitScale = fitGraphView(Object.values(input.positions), viewportWidth, viewportHeight).scale;
  const nodeLabels = [...input.presentation.nodeLabels.values()];
  const relationLabels = [...input.presentation.relationLabels.entries()];
  let nodeNodeOverlapPairs = 0;
  let nodeRelationOverlapPairs = 0;
  let relationRelationOverlapPairs = 0;
  for (let left = 0; left < nodeLabels.length; left += 1) for (let right = left + 1; right < nodeLabels.length; right += 1) if (overlaps(nodeLabels[left]!, nodeLabels[right]!)) nodeNodeOverlapPairs += 1;
  for (const nodeLabel of nodeLabels) for (const [, relationLabel] of relationLabels) if (overlaps(nodeLabel, relationLabel)) nodeRelationOverlapPairs += 1;
  for (let left = 0; left < relationLabels.length; left += 1) for (let right = left + 1; right < relationLabels.length; right += 1) if (overlaps(relationLabels[left]![1], relationLabels[right]![1])) relationRelationOverlapPairs += 1;

  let foreignRouteRelationLabelHits = 0;
  let relationLabelsWithForeignRouteHit = 0;
  let ownershipAmbiguityCount = 0;
  for (const [relationId, label] of relationLabels) {
    const owner = input.presentation.routedEdges.find(({ id }) => id === relationId);
    const ownerDistance = owner ? routeDistance(owner.samples, label) : Infinity;
    let hasForeignHit = false;
    let nearestForeign = Infinity;
    for (const route of input.presentation.routedEdges) {
      if (route.id === relationId) continue;
      const distance = routeDistance(route.samples, label);
      nearestForeign = Math.min(nearestForeign, distance);
      if (distance === 0) { foreignRouteRelationLabelHits += 1; hasForeignHit = true; }
    }
    if (hasForeignHit) relationLabelsWithForeignRouteHit += 1;
    if (nearestForeign <= ownerDistance + 4) ownershipAmbiguityCount += 1;
  }

  const totalLabelOverlapPairs = nodeNodeOverlapPairs + nodeRelationOverlapPairs + relationRelationOverlapPairs;
  const labelArea = [...nodeLabels, ...relationLabels.map(([, label]) => label)].reduce((sum, label) => sum + label.width * label.height * fitScale * fitScale, 0);
  const labelScreenOccupancy = labelArea / (viewportWidth * viewportHeight);
  const effectiveFontScale = fitScale;
  return { fitScale, effectiveFontScale, labelScreenOccupancy, nodeNodeOverlapPairs, nodeRelationOverlapPairs, relationRelationOverlapPairs, totalLabelOverlapPairs, foreignRouteRelationLabelHits, relationLabelsWithForeignRouteHit, ownershipAmbiguityCount };
}
