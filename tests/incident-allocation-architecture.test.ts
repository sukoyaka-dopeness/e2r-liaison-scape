import assert from "node:assert/strict";
import test from "node:test";
import { decideIncidentAllocation, type IncidentAllocationCandidate } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/incident-allocation.ts";

const candidate = (overrides: Partial<IncidentAllocationCandidate> = {}): IncidentAllocationCandidate => ({
  id: "candidate-a", hardFailures: [], requiredHalfSectorDegrees: 20,
  availableHalfSectorDegrees: 24, bundleWidthPx: 64,
  bundleRelationIds: ["parallel-a", "parallel-b"], conflictingRelationIds: ["ordinary"],
  pressure: { labelReservationDeficitPx: 0, outerGuardDeficitPx: 0, obstacleConflictCount: 0, portConflictCount: 0 },
  qualityCost: 1, detourCost: 1, ...overrides,
});

test("incident allocation selects only a hard-feasible candidate", () => {
  const result = decideIncidentAllocation(["b", "a"], [
    candidate({ id: "unsafe", hardFailures: ["outer-clearance"], qualityCost: 0 }),
    candidate({ id: "safe", qualityCost: 2 }),
  ]);
  assert.deepEqual(result, { decision: { status: "feasible", selectedCandidateId: "safe" } });
});

test("capacity shortage is distinct from diagnostic fallback rendering", () => {
  const result = decideIncidentAllocation(["b", "a"], [
    candidate({ id: "outer", hardFailures: ["outer-clearance"], requiredHalfSectorDegrees: 31, availableHalfSectorDegrees: 18, pressure: { labelReservationDeficitPx: 0, outerGuardDeficitPx: 3, obstacleConflictCount: 0, portConflictCount: 1 } }),
    candidate({ id: "label", hardFailures: ["label-clearance"], requiredHalfSectorDegrees: 35, availableHalfSectorDegrees: 18, qualityCost: 2, pressure: { labelReservationDeficitPx: 7, outerGuardDeficitPx: 0, obstacleConflictCount: 0, portConflictCount: 1 } }),
  ]);
  assert.equal(result.decision.status, "capacity-shortage");
  assert.equal(result.diagnosticFallbackCandidateId, "outer");
  if (result.decision.status !== "capacity-shortage") return;
  assert.deepEqual(result.decision.shortage.endpointIds, ["a", "b"]);
  assert.equal(result.decision.shortage.shortageDegrees, 13);
  assert.deepEqual(result.decision.shortage.hardFailures, ["label-clearance", "outer-clearance"]);
  assert.equal(result.decision.shortage.pressure.labelReservationDeficitPx, 7);
});

test("incident allocation decision is deterministic across input order", () => {
  const candidates = [candidate({ id: "z" }), candidate({ id: "a" })];
  assert.deepEqual(decideIncidentAllocation(["a", "b"], candidates), decideIncidentAllocation(["a", "b"], candidates.toReversed()));
});
