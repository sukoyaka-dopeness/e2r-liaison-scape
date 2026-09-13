export type IncidentPressure = {
  labelReservationDeficitPx: number;
  outerGuardDeficitPx: number;
  obstacleConflictCount: number;
  portConflictCount: number;
};

export type IncidentAllocationCandidate = {
  id: string;
  hardFailures: readonly string[];
  requiredHalfSectorDegrees: number;
  availableHalfSectorDegrees: number;
  bundleWidthPx: number;
  bundleRelationIds: readonly string[];
  conflictingRelationIds: readonly string[];
  pressure: IncidentPressure;
  qualityCost: number;
  detourCost: number;
};

export type IncidentCapacityShortage = {
  endpointIds: readonly string[];
  requiredHalfSectorDegrees: number;
  availableHalfSectorDegrees: number;
  shortageDegrees: number;
  bundleWidthPx: number;
  bundleRelationIds: readonly string[];
  conflictingRelationIds: readonly string[];
  hardFailures: readonly string[];
  pressure: IncidentPressure;
};

export type IncidentAllocationDecision =
  | { status: "feasible"; selectedCandidateId: string }
  | { status: "capacity-shortage"; shortage: IncidentCapacityShortage };

export type IncidentAllocationResult = {
  decision: IncidentAllocationDecision;
  /** Rendering-only evidence. This is never an accepted allocation. */
  diagnosticFallbackCandidateId?: string;
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;

function compareCandidates(left: IncidentAllocationCandidate, right: IncidentAllocationCandidate) {
  return left.qualityCost - right.qualityCost
    || left.detourCost - right.detourCost
    || left.id.localeCompare(right.id);
}

/**
 * Resolves an already-generated complete-incident candidate set.
 *
 * The contract deliberately separates an accepted feasible allocation from a
 * diagnostic rendering fallback. A fallback must never be committed as a safe
 * routing result by a future Product caller.
 */
export function decideIncidentAllocation(
  endpointIds: readonly string[],
  candidates: readonly IncidentAllocationCandidate[],
): IncidentAllocationResult {
  if (candidates.length === 0) {
    return {
      decision: {
        status: "capacity-shortage",
        shortage: {
          endpointIds: [...endpointIds].sort(), requiredHalfSectorDegrees: 0,
          availableHalfSectorDegrees: 0, shortageDegrees: 0, bundleWidthPx: 0,
          bundleRelationIds: [], conflictingRelationIds: [], hardFailures: ["no-candidate"],
          pressure: { labelReservationDeficitPx: 0, outerGuardDeficitPx: 0, obstacleConflictCount: 0, portConflictCount: 0 },
        },
      },
    };
  }

  const ordered = [...candidates].sort(compareCandidates);
  const feasible = ordered.filter(({ hardFailures }) => hardFailures.length === 0);
  if (feasible.length > 0) {
    return { decision: { status: "feasible", selectedCandidateId: feasible[0].id } };
  }

  const fallback = ordered[0];
  const leastRequired = [...candidates].sort((left, right) =>
    (left.requiredHalfSectorDegrees - left.availableHalfSectorDegrees)
      - (right.requiredHalfSectorDegrees - right.availableHalfSectorDegrees)
    || compareCandidates(left, right))[0];
  const required = finite(leastRequired.requiredHalfSectorDegrees);
  const available = finite(leastRequired.availableHalfSectorDegrees);
  return {
    decision: {
      status: "capacity-shortage",
      shortage: {
        endpointIds: [...endpointIds].sort(),
        requiredHalfSectorDegrees: required,
        availableHalfSectorDegrees: available,
        shortageDegrees: Math.max(0, required - available),
        bundleWidthPx: finite(leastRequired.bundleWidthPx),
        bundleRelationIds: [...new Set(candidates.flatMap(({ bundleRelationIds }) => bundleRelationIds))].sort(),
        conflictingRelationIds: [...new Set(candidates.flatMap(({ conflictingRelationIds }) => conflictingRelationIds))].sort(),
        hardFailures: [...new Set(candidates.flatMap(({ hardFailures }) => hardFailures))].sort(),
        pressure: {
          labelReservationDeficitPx: Math.max(...candidates.map(({ pressure }) => finite(pressure.labelReservationDeficitPx))),
          outerGuardDeficitPx: Math.max(...candidates.map(({ pressure }) => finite(pressure.outerGuardDeficitPx))),
          obstacleConflictCount: Math.max(...candidates.map(({ pressure }) => pressure.obstacleConflictCount), 0),
          portConflictCount: Math.max(...candidates.map(({ pressure }) => pressure.portConflictCount), 0),
        },
      },
    },
    diagnosticFallbackCandidateId: fallback.id,
  };
}
