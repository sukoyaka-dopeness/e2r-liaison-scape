export type EndpointSectorReservation = {
  endpointId: string;
  centerAngleDegrees: number;
  halfWidthDegrees: number;
};

export type EndpointPlanCandidate = {
  id: string;
  groupId: string;
  hardFailures: readonly string[];
  reservations: readonly EndpointSectorReservation[];
  changedOrdinaryRelationIds: readonly string[];
  qualityCost: number;
};

export type EndpointPlanGroup = {
  id: string;
  candidates: readonly EndpointPlanCandidate[];
  capacityRequest?: EndpointGroupCapacityRequest;
};

export type EndpointGroupCapacityRequest = {
  endpointIds: readonly string[];
  requiredHalfSectorDegrees: number;
  availableHalfSectorDegrees: number;
  shortageDegrees: number;
  bundleWidthPx: number;
  bundleRelationIds: readonly string[];
  conflictingRelationIds: readonly string[];
  hardFailures: readonly string[];
  labelReservationDeficitPx: number;
  outerGuardDeficitPx: number;
  obstacleConflictCount: number;
  portConflictCount: number;
};

export type EndpointPlanShortage = {
  reason: "no-group-candidate" | "sector-conflict" | "ordinary-claim-conflict" | "combined-presentation" | "search-budget";
  conflictingGroupIds: readonly string[];
  conflictingEndpointIds: readonly string[];
  requiredCombinedSectorDegrees: number;
  availableSeparationDegrees: number;
  shortageDegrees: number;
  groupCapacityRequests: readonly EndpointGroupCapacityRequest[];
  exploredStates: number;
  maxStates: number;
};

export type EndpointPlanResult = {
  decision:
    | { status: "feasible"; selectedCandidateIds: readonly string[]; exploredStates: number }
    | { status: "capacity-shortage"; shortage: EndpointPlanShortage };
  diagnosticFallbackCandidateIds: readonly string[];
};

const normalizedAngle = (angle: number) => ((angle % 360) + 360) % 360;
const angularDistance = (left: number, right: number) => {
  const delta = Math.abs(normalizedAngle(left) - normalizedAngle(right));
  return Math.min(delta, 360 - delta);
};

function candidateOrder(left: EndpointPlanCandidate, right: EndpointPlanCandidate) {
  return left.qualityCost - right.qualityCost || left.id.localeCompare(right.id);
}

type Conflict = { reason: EndpointPlanShortage["reason"]; groupIds: string[]; endpointIds: string[]; required: number; available: number };

function conflictBetween(left: EndpointPlanCandidate, right: EndpointPlanCandidate): Conflict | null {
  const sharedClaims = left.changedOrdinaryRelationIds.filter((id) => right.changedOrdinaryRelationIds.includes(id));
  if (sharedClaims.length > 0) {
    return { reason: "ordinary-claim-conflict", groupIds: [left.groupId, right.groupId], endpointIds: [], required: sharedClaims.length, available: 0 };
  }
  for (const first of left.reservations) for (const second of right.reservations) {
    if (first.endpointId !== second.endpointId) continue;
    const required = first.halfWidthDegrees + second.halfWidthDegrees;
    const available = angularDistance(first.centerAngleDegrees, second.centerAngleDegrees);
    if (available + 1e-9 < required) {
      return { reason: "sector-conflict", groupIds: [left.groupId, right.groupId], endpointIds: [first.endpointId], required, available };
    }
  }
  return null;
}

/** Bounded deterministic joint allocation across every bundle at shared endpoints. */
export function planEndpointAllocations(
  groups: readonly EndpointPlanGroup[],
  maxStates = 512,
  validateCombinedPlan?: (selected: readonly EndpointPlanCandidate[]) => readonly string[],
): EndpointPlanResult {
  const orderedGroups = [...groups].sort((left, right) => left.id.localeCompare(right.id));
  const fallback = orderedGroups.flatMap(({ candidates }) => [...candidates].sort(candidateOrder).slice(0, 1).map(({ id }) => id));
  const empty = orderedGroups.find(({ candidates }) => !candidates.some(({ hardFailures }) => hardFailures.length === 0));
  if (empty) {
    return {
      decision: { status: "capacity-shortage", shortage: {
        reason: "no-group-candidate", conflictingGroupIds: [empty.id],
        conflictingEndpointIds: empty.capacityRequest?.endpointIds ?? [],
        requiredCombinedSectorDegrees: empty.capacityRequest?.requiredHalfSectorDegrees ?? 0,
        availableSeparationDegrees: empty.capacityRequest?.availableHalfSectorDegrees ?? 0,
        shortageDegrees: empty.capacityRequest?.shortageDegrees ?? 0,
        groupCapacityRequests: orderedGroups.flatMap(({ capacityRequest }) => capacityRequest ? [capacityRequest] : []),
        exploredStates: 0, maxStates,
      } },
      diagnosticFallbackCandidateIds: fallback,
    };
  }

  let exploredStates = 0;
  let best: EndpointPlanCandidate[] | null = null;
  let bestCost = Infinity;
  let closestConflict: Conflict | null = null;
  const visit = (index: number, selected: EndpointPlanCandidate[], cost: number) => {
    if (exploredStates >= maxStates || cost >= bestCost) return;
    exploredStates += 1;
    if (index === orderedGroups.length) {
      const combinedFailures = validateCombinedPlan?.(selected) ?? [];
      if (combinedFailures.length > 0) {
        const conflict: Conflict = { reason: "combined-presentation", groupIds: selected.map(({ groupId }) => groupId), endpointIds: [], required: combinedFailures.length, available: 0 };
        if (!closestConflict || conflict.required - conflict.available < closestConflict.required - closestConflict.available) closestConflict = conflict;
        return;
      }
      best = [...selected]; bestCost = cost; return;
    }
    const feasible = orderedGroups[index].candidates.filter(({ hardFailures }) => hardFailures.length === 0).sort(candidateOrder);
    for (const candidate of feasible) {
      const conflict = selected.map((prior) => conflictBetween(prior, candidate)).find(Boolean);
      if (conflict) {
        if (!closestConflict || conflict.required - conflict.available < closestConflict.required - closestConflict.available) closestConflict = conflict;
        continue;
      }
      visit(index + 1, [...selected, candidate], cost + candidate.qualityCost);
    }
  };
  visit(0, [], 0);

  const selectedBest = best as EndpointPlanCandidate[] | null;
  if (selectedBest) return { decision: { status: "feasible", selectedCandidateIds: selectedBest.map(({ id }) => id), exploredStates }, diagnosticFallbackCandidateIds: [] };
  const budgetExhausted = exploredStates >= maxStates;
  const conflict = closestConflict as Conflict | null;
  const required = conflict?.required ?? 0;
  const available = conflict?.available ?? 0;
  return {
    decision: {
      status: "capacity-shortage",
      shortage: {
        reason: budgetExhausted ? "search-budget" : conflict?.reason ?? "sector-conflict",
        conflictingGroupIds: conflict?.groupIds.sort() ?? orderedGroups.map(({ id }) => id),
        conflictingEndpointIds: conflict?.endpointIds.sort() ?? [],
        requiredCombinedSectorDegrees: required,
        availableSeparationDegrees: available,
        shortageDegrees: Math.max(0, required - available),
        groupCapacityRequests: orderedGroups.flatMap(({ capacityRequest }) => capacityRequest ? [capacityRequest] : []),
        exploredStates, maxStates,
      },
    },
    diagnosticFallbackCandidateIds: fallback,
  };
}
