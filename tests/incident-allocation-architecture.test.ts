import assert from "node:assert/strict";
import test from "node:test";
import { decideIncidentAllocation, type IncidentAllocationCandidate } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/incident-allocation.ts";
import { planEndpointAllocations, type EndpointPlanCandidate } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/endpoint-plan.ts";
import { compressIncidentCandidates } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/candidate-compression.ts";
import { deriveGeometryCandidateFamily } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/geometry-derived-candidates.ts";
import { decidePlacementRequestLifecycle } from "../experimental/product-evaluation-seam/incident-allocation-architecture2/placement-request-lifecycle.ts";
import { applyCapacityNegotiatedPlacement } from "../experimental/product-evaluation-seam/structural-placement/capacity-negotiated-placement.ts";

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

const planCandidate = (id: string, groupId: string, angle: number, halfWidth = 12, changes: string[] = []): EndpointPlanCandidate => ({
  id, groupId, hardFailures: [], qualityCost: 1,
  reservations: [{ endpointId: "hub", centerAngleDegrees: angle, halfWidthDegrees: halfWidth }],
  changedOrdinaryRelationIds: changes,
});

test("endpoint plan backtracks across bundles instead of committing the first local winner", () => {
  const result = planEndpointAllocations([
    { id: "a", candidates: [planCandidate("a-local", "a", 10), planCandidate("a-joint", "a", 40)] },
    { id: "b", candidates: [planCandidate("b-only", "b", 0)] },
  ]);
  assert.equal(result.decision.status, "feasible");
  if (result.decision.status === "feasible") assert.deepEqual(result.decision.selectedCandidateIds, ["a-joint", "b-only"]);
});

test("endpoint plan reports sector shortage without accepting diagnostic fallback", () => {
  const result = planEndpointAllocations([
    { id: "a", candidates: [planCandidate("a", "a", 0, 20)] },
    { id: "b", candidates: [planCandidate("b", "b", 25, 20)] },
  ]);
  assert.equal(result.decision.status, "capacity-shortage");
  assert.deepEqual(result.diagnosticFallbackCandidateIds, ["a", "b"]);
  if (result.decision.status === "capacity-shortage") {
    assert.equal(result.decision.shortage.reason, "sector-conflict");
    assert.equal(result.decision.shortage.shortageDegrees, 15);
  }
});

test("endpoint plan rejects two bundles claiming the same ordinary Relation", () => {
  const result = planEndpointAllocations([
    { id: "a", candidates: [planCandidate("a", "a", 0, 10, ["ordinary"])] },
    { id: "b", candidates: [planCandidate("b", "b", 90, 10, ["ordinary"])] },
  ]);
  assert.equal(result.decision.status, "capacity-shortage");
  if (result.decision.status === "capacity-shortage") assert.equal(result.decision.shortage.reason, "ordinary-claim-conflict");
});

test("endpoint plan backtracks when authoritative combined presentation rejects a combination", () => {
  const result = planEndpointAllocations([
    { id: "a", candidates: [planCandidate("a-first", "a", 0, 5), planCandidate("a-safe", "a", 30, 5)] },
    { id: "b", candidates: [planCandidate("b", "b", 90, 5)] },
  ], 32, (selected) => selected.some(({ id }) => id === "a-first") ? ["crossing"] : []);
  assert.equal(result.decision.status, "feasible");
  if (result.decision.status === "feasible") assert.deepEqual(result.decision.selectedCandidateIds, ["a-safe", "b"]);
});

test("candidate compression keeps representative gap/center families deterministically", () => {
  const input = Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, gap: [40, 56, 72, 88, 176][index % 5], center: [-96, -64, -32, 0, 32, 64, 96][index % 7], ordinaryPolicy: index % 2 ? "reroute-all" : "preserve-unaffected", hardFailures: [], score: index }));
  const compressed = compressIncidentCandidates(input, 30);
  assert.ok(compressed.length <= 30);
  assert.deepEqual(compressed.map(({ id }) => id), compressIncidentCandidates(input.toReversed(), 30).map(({ id }) => id));
  assert.ok(compressed.some(({ gap }) => gap === 40));
  assert.ok(compressed.some(({ gap }) => gap === 176));
});

test("geometry-derived family is demand-sensitive, bounded, and deterministic", () => {
  const demand = { projectedLabelWidth: 168, chordLength: 360, parallelCount: 3, incidentOrdinaryCount: 2, availableHalfSectorDegrees: 14 };
  const family = deriveGeometryCandidateFamily(demand);
  assert.ok(family.gaps.length <= 3);
  assert.ok(family.centers.length <= 3);
  assert.deepEqual(family, deriveGeometryCandidateFamily(demand));
  assert.ok(family.gaps.some((gap) => gap > 40));
  assert.deepEqual(family.ordinaryPolicies, ["preserve-unaffected", "reroute-all"]);
});

test("placement request lifecycle applies only at a safe ownership boundary", () => {
  const base = { phase: "idle" as const, requestToken: "r1", currentToken: "r1", hasAuthoredCoordinates: false, hasManualRouteOrLabel: false };
  assert.deepEqual(decidePlacementRequestLifecycle({ ...base, phase: "initial-open" }), { action: "apply", reason: "initial-open" });
  assert.deepEqual(decidePlacementRequestLifecycle({ ...base, phase: "dragging" }), { action: "defer", reason: "active-drag" });
  assert.deepEqual(decidePlacementRequestLifecycle({ ...base, hasAuthoredCoordinates: true }), { action: "defer", reason: "manual-authority" });
  assert.deepEqual(decidePlacementRequestLifecycle({ ...base, requestToken: "old" }), { action: "discard", reason: "stale-request" });
  assert.deepEqual(decidePlacementRequestLifecycle(base, true), { action: "discard", reason: "cancelled" });
});

test("capacity-negotiated placement uses the request and fails closed on graph-wide safety", () => {
  const positions = { hub: { x: 0, y: 0 }, near: { x: 80, y: 0 }, remote: { x: 80, y: 1 } };
  const request = { endpointId: "hub", bundleAngleRadians: 0, requiredHalfSectorDegrees: 30, incidentNeighbors: [{ id: "near", angleRadians: 0.05, radius: 80 }] };
  const result = applyCapacityNegotiatedPlacement(positions, request);
  assert.equal(result.status, "applied");
  assert.deepEqual(result.movedNeighborIds, ["near"]);
  assert.notDeepEqual(result.positions, positions);
  assert.ok(result.afterMinimumSeparation >= result.beforeMinimumSeparation * 0.88);
  assert.ok(result.afterExtent <= result.beforeExtent * 1.25);
  const unsafe = applyCapacityNegotiatedPlacement(positions, request, { maxNodeSeparationLossRatio: 0, maxExtentGrowthRatio: 0 });
  assert.equal(unsafe.status, "rejected");
});

test("capacity negotiation preserves incident angular ordering instead of collapsing neighbors", () => {
  const positions = {
    hub: { x: 0, y: 0 },
    near: { x: 80, y: 2 },
    nearer: { x: 80, y: 4 },
    remote: { x: -120, y: 0 },
  };
  const result = applyCapacityNegotiatedPlacement(positions, {
    endpointId: "hub", bundleAngleRadians: 0, requiredHalfSectorDegrees: 24,
    minimumAngularSeparationDegrees: 6,
    incidentNeighbors: [
      { id: "near", angleRadians: Math.atan2(2, 80), radius: Math.hypot(80, 2) },
      { id: "nearer", angleRadians: Math.atan2(4, 80), radius: Math.hypot(80, 4) },
    ],
  });
  assert.equal(result.status, "applied");
  assert.ok(result.positions.nearer.y > result.positions.near.y);
  assert.equal(result.maxMovedNeighborDisplacement > 0, true);
});

test("capacity negotiation rejects a correction that would materially reduce viewport fit", () => {
  const positions = { hub: { x: 0, y: 0 }, near: { x: 80, y: 0 }, far: { x: 84, y: 0 } };
  const result = applyCapacityNegotiatedPlacement(positions, {
    endpointId: "hub", bundleAngleRadians: 0, requiredHalfSectorDegrees: 120,
    incidentNeighbors: [{ id: "near", angleRadians: 0, radius: 80 }],
  }, {
    maxNodeSeparationLossRatio: 0.2, maxExtentGrowthRatio: 10,
    maxFitScaleLossRatio: 0.01, viewport: { width: 100, height: 100, padding: 10 },
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "unsafe-fit-scale");
  assert.deepEqual(result.positions, positions);
});
