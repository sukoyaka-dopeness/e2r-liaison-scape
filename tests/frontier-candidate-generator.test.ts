import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEntityGraph } from "../src/dataset.ts";
import { generateFrontierCandidateSet } from "../src/frontier-candidate-generator.ts";

const fixture = "../e2r-spec/examples/apollo-11-mission.en.e2r.json";

function inputFromFixture() {
  const graph = buildEntityGraph(JSON.parse(readFileSync(fixture, "utf8")));
  return {
    nodes: graph.nodes.map(({ id }) => ({ id })),
    edges: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
  };
}

function candidateSetDigest(result: ReturnType<typeof generateFrontierCandidateSet>) {
  const signature = result.poolCandidates.map(({ family, identity, structuralCrossings, cheapScore, minNodeSeparation, meanNodeSeparation, medianEdge, maxEdge, width, height, aspect, featureVector, topologyFeatureVector, positions }) => ({
    family,
    identity,
    structuralCrossings,
    cheapScore,
    minNodeSeparation,
    meanNodeSeparation,
    medianEdge,
    maxEdge,
    width,
    height,
    aspect,
    featureVector,
    topologyFeatureVector,
    positions,
  }));
  return createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

test("Frontier candidate generator is deterministic and preserves the reviewed candidate gate", () => {
  const input = inputFromFixture();
  const first = generateFrontierCandidateSet(input);
  const repeated = generateFrontierCandidateSet(input);
  assert.equal(first.status, "completed");
  assert.equal(repeated.status, "completed");
  assert.deepEqual(repeated, first);
  assert.equal(first.poolCandidates.length, 60);
  assert.equal(first.frontierCandidates.length, 5);
  assert.equal(first.representatives.length, 12);
  assert.equal(candidateSetDigest(first), "578a2d12abb94a8d4f73ef181ed010ce4b5adea9f1a70486ac8f14aeddb1286b");
});

test("Frontier candidate generator returns structured failures for invalid input", () => {
  const result = generateFrontierCandidateSet({ nodes: [{ id: "a" }, { id: "a" }], edges: [] });
  assert.equal(result.status, "failed");
  assert.equal(result.failure?.code, "INVALID_INPUT");
  assert.deepEqual(result.representatives, []);
  assert.deepEqual(result.poolCandidates, []);
});
