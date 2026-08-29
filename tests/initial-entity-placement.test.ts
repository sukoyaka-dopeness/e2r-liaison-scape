import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_ENTITY_CLEARANCE, INITIAL_ENTITY_MAX_RING, placeInitialEntity } from "../src/initial-entity-placement.ts";

test("empty and free desired positions are returned unchanged", () => {
  const desired = { x: 400, y: 250 };
  assert.deepEqual(placeInitialEntity(desired, []), desired);
  assert.deepEqual(placeInitialEntity(desired, [{ x: 100, y: 100 }]), desired);
});

test("occupied desired position chooses the first deterministic free candidate", () => {
  const desired = { x: 400, y: 250 };
  assert.deepEqual(placeInitialEntity(desired, [desired]), { x: 400 + INITIAL_ENTITY_CLEARANCE, y: 250 });
});

test("multiple blockers use deterministic ring and direction order", () => {
  const desired = { x: 400, y: 250 };
  const blockers = [
    desired,
    { x: desired.x + INITIAL_ENTITY_CLEARANCE, y: desired.y },
    { x: desired.x + INITIAL_ENTITY_CLEARANCE, y: desired.y + INITIAL_ENTITY_CLEARANCE },
  ];
  assert.deepEqual(placeInitialEntity(desired, blockers), { x: desired.x, y: desired.y + INITIAL_ENTITY_CLEARANCE });
});

test("does not mutate occupied input and repeats identically", () => {
  const occupied = [{ x: 400, y: 250 }];
  const before = structuredClone(occupied);
  const first = placeInitialEntity({ x: 400, y: 250 }, occupied);
  const second = placeInitialEntity({ x: 400, y: 250 }, occupied);
  assert.deepEqual(first, second);
  assert.deepEqual(occupied, before);
});

test("visible bounds reject candidates outside the graph-space viewport", () => {
  const desired = { x: 400, y: 250 };
  const bounds = { left: 300, right: 444, top: 150, bottom: 380 };
  assert.deepEqual(placeInitialEntity(desired, [desired], bounds), { x: 400, y: 250 + INITIAL_ENTITY_CLEARANCE });
});

test("bounded search falls back deterministically when every candidate is occupied", () => {
  const desired = { x: 0, y: 0 };
  const blockers = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= INITIAL_ENTITY_MAX_RING; ring += 1) {
    const distance = INITIAL_ENTITY_CLEARANCE * ring;
    for (const direction of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
      blockers.push({ x: direction[0] * distance, y: direction[1] * distance });
    }
  }
  assert.deepEqual(placeInitialEntity(desired, blockers), desired);
});

test("invalid geometry fails closed without inventing a position", () => {
  const desired = { x: Number.NaN, y: 1 };
  assert.deepEqual(placeInitialEntity(desired, []), desired);
});
