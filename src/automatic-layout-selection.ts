/**
 * Product-owned comparison for derived automatic-layout proposals.
 * This does not generate positions or perform routing/label placement; it only
 * keeps the existing hard-feasibility gate and deterministic proposal order in
 * one reusable pure boundary for research and execution diagnostics.
 */
export type AutomaticLayoutSelectionMetrics = Readonly<{
  crossings: number;
  overlapPairs: number;
  labelRouteHits: number;
  labelOverlap: number;
  labelNear20: number;
  score: number;
}>;

export type AutomaticLayoutProposalLike = Readonly<{
  eligible: boolean;
  family: string;
  metrics: Pick<AutomaticLayoutSelectionMetrics, "score">;
}>;

export function isAutomaticLayoutPresentationEligible(metrics: AutomaticLayoutSelectionMetrics): boolean {
  return metrics.crossings === 0
    && metrics.overlapPairs === 0
    && metrics.labelRouteHits === 0
    && metrics.labelOverlap === 0
    && metrics.labelNear20 === 0;
}

export function compareAutomaticLayoutProposals(left: AutomaticLayoutProposalLike, right: AutomaticLayoutProposalLike): number {
  return Number(right.eligible) - Number(left.eligible)
    || left.metrics.score - right.metrics.score
    || left.family.localeCompare(right.family);
}
