import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG, validateFrontierProductResult } from "../experimental/frontier-product-worker-execution-proof1/core.ts";

const root = process.cwd();

function graph() {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), description: "", x: 0, y: 0 }));
  const edges = [
    { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "ab" },
    { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "bc" },
    { id: "cd", sourceId: "c", targetId: "d", parallelIndex: 0, parallelCount: 1, label: "cd" },
    { id: "da", sourceId: "d", targetId: "a", parallelIndex: 0, parallelCount: 1, label: "da" },
  ];
  return { nodes, edges };
}

test("Frontier/Product worker core is finite, deterministic, and serializable", () => {
  const input = graph();
  const first = computeFrontierProductProposals(input, DEFAULT_FRONTIER_WORKER_CONFIG);
  const second = computeFrontierProductProposals(input, DEFAULT_FRONTIER_WORKER_CONFIG);
  assert.deepEqual(first.candidateSet, second.candidateSet);
  assert.deepEqual(first.selected, second.selected);
  assert.equal(validateFrontierProductResult(first).ok, true);
  assert.doesNotThrow(() => structuredClone(first));
});

test("Worker proof harness uses actual shared source and keeps App unwired", () => {
  const worker = fs.readFileSync(path.join(root, "experimental/frontier-product-worker-execution-proof1/worker.ts"), "utf8");
  const main = fs.readFileSync(path.join(root, "experimental/frontier-product-worker-execution-proof1/main.ts"), "utf8");
  assert.match(worker, /computeFrontierProductProposals/);
  assert.match(worker, /postMessage\(envelope\(job, "started"\)\)/);
  assert.match(main, /new Worker\(new URL\("\.\/worker\.ts"/);
  assert.match(main, /appWiring: false/);
  assert.doesNotMatch(main, /createRoot|<App/);
});
