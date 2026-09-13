export type GeometryDemand = {
  projectedLabelWidth: number;
  chordLength: number;
  parallelCount: number;
  incidentOrdinaryCount: number;
  availableHalfSectorDegrees: number;
};

export type GeometryCandidateFamily = {
  gaps: readonly number[];
  centers: readonly number[];
  ordinaryPolicies: readonly string[];
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Derive a small family from geometry demand before routing/presentation evaluation. */
export function deriveGeometryCandidateFamily(demand: GeometryDemand): GeometryCandidateFamily {
  const labelGap = clamp(roundTo(demand.projectedLabelWidth * 0.55 + 24, 8), 40, 176);
  const laneGap = clamp(roundTo(24 + Math.max(0, demand.parallelCount - 2) * 8, 8), 40, 96);
  const demandGap = clamp(Math.max(labelGap, laneGap), 40, 176);
  const labelDemandGap = clamp(roundTo(demand.projectedLabelWidth + 16, 8), 40, 176);
  const gaps = [...new Set([40, demandGap, labelDemandGap])].sort((left, right) => left - right);
  // A label-width-derived symmetric relief supplies a small side portfolio
  // even when ordinary-angle capacity is generous. The planner still rejects
  // it when outer/obstacle/presentation constraints make it unsafe.
  const centerMagnitude = clamp(roundTo(demand.projectedLabelWidth / 2, 16), 0, 96);
  const centers = [...new Set([0, centerMagnitude, -centerMagnitude])].sort((left, right) => left - right);
  const ordinaryPolicies = demand.incidentOrdinaryCount > 0
    ? ["preserve-unaffected", "reroute-all"]
    : ["preserve-unaffected"];
  return { gaps, centers, ordinaryPolicies };
}
