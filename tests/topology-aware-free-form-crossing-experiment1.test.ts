import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildEntityGraph } from "../src/dataset.ts";
import { deriveTopologyAwareFreeFormCandidates } from "../src/topology-aware-free-form-placement.ts";

const artifact = JSON.parse(fs.readFileSync("experimental/topology-aware-free-form-crossing-experiment1/result-summary.json", "utf8"));

test("topology-aware free-form candidates are bounded, deterministic, and not grid/circle finalization", () => {
  const dataset = {
    version: "1.0",
    entities: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id })),
    events: [],
    relations: [
      { id: "a-b", sourceId: "a", targetId: "b", name: "ab" },
      { id: "a-c", sourceId: "a", targetId: "c", name: "ac" },
      { id: "b-d", sourceId: "b", targetId: "d", name: "bd" },
      { id: "c-e", sourceId: "c", targetId: "e", name: "ce" },
    ],
  };
  const graph = buildEntityGraph(dataset);
  const first = deriveTopologyAwareFreeFormCandidates(graph.nodes, graph.edges, 6);
  const second = deriveTopologyAwareFreeFormCandidates(graph.nodes, graph.edges, 6);
  assert.equal(first.length, 6);
  assert.deepEqual(first, second);
  assert.equal(first.every((candidate) => candidate.topology.componentCount === 1), true);
  assert.equal(first.every((candidate) => candidate.positions.a && candidate.positions.e), true);
  assert.equal(first.every((candidate) => candidate.family.includes("free-form")), true);
  assert.equal(first.some((candidate) => Object.values(candidate.positions).some((point) => !Number.isInteger(point.x) || !Number.isInteger(point.y))), true);
  assert.equal(first.every((candidate) => candidate.cheapMetrics.overlapPairs === 0), true);
});

test("free-form experiment artifact remains diagnostic and preserves standing holds", () => {
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.productAuthoritiesChanged, false);
  assert.equal(artifact.rows.length, 7);
  assert.equal(artifact.rows.every((row: { candidateCount: number; productEvaluationCount: number; deterministic: boolean; selected: { positions?: unknown } }) => row.candidateCount === 6 && row.productEvaluationCount === 6 && row.deterministic === true), true);
  assert.equal(artifact.interpretationPending, true);
  assert.equal(artifact.readiness.humanReview, "NOT READY");
  assert.equal(artifact.readiness.qualitySolver, "HOLD / NOT ESTABLISHED");
  assert.equal(artifact.readiness.productionProvider, "NOT ESTABLISHED");
  assert.equal(artifact.readiness.productIntegration, "HOLD");
  assert.equal(artifact.readiness.initialLayoutReleaseBlocker, "OPEN");
});
