import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  createFrontierAutomaticDisplaySnapshot,
  FrontierAutomaticDisplayAdapter,
  type FrontierAutomaticDisplayWorker,
  type FrontierAutomaticDisplayWorkerJob,
  type FrontierAutomaticDisplayWorkerMessage,
} from "../src/frontier-automatic-display-adapter.ts";
import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG } from "../experimental/frontier-product-worker-execution-proof1/core.ts";

function graph() {
  return {
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id, description: "", x: 0, y: 0 })),
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1, label: "ab" },
      { id: "bc", sourceId: "b", targetId: "c", parallelIndex: 0, parallelCount: 1, label: "bc" },
    ],
  };
}

class FakeWorker implements FrontierAutomaticDisplayWorker {
  onmessage: ((event: MessageEvent<FrontierAutomaticDisplayWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  lateMessage: (() => void) | null = null;
  private readonly mode: "complete" | "fail" | "pending";
  constructor(mode: "complete" | "fail" | "pending") {
    this.mode = mode;
  }
  postMessage(job: FrontierAutomaticDisplayWorkerJob): void {
    this.onmessage?.({ data: { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status: "started" } } as MessageEvent<FrontierAutomaticDisplayWorkerMessage>);
    if (this.mode === "pending") {
      this.lateMessage = () => this.onmessage?.({ data: { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status: "completed" } } as MessageEvent<FrontierAutomaticDisplayWorkerMessage>);
      return;
    }
    if (this.mode === "fail") {
      this.onmessage?.({ data: { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status: "failed", failure: { code: "TEST_FAILURE", message: "test failure" } } } as MessageEvent<FrontierAutomaticDisplayWorkerMessage>);
      return;
    }
    const result = computeFrontierProductProposals(job.graph, job.config);
    this.onmessage?.({ data: { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status: "completed", ...result } } as MessageEvent<FrontierAutomaticDisplayWorkerMessage>);
  }
  terminate(): void {
    this.terminated = true;
  }
}

function snapshot(generation = 1) {
  const result = createFrontierAutomaticDisplaySnapshot({
    operationId: "test-operation-" + generation,
    generation,
    snapshotIdentity: "dataset:test:" + generation,
    graph: graph(),
    storedPositionCount: 0,
    config: DEFAULT_FRONTIER_WORKER_CONFIG,
  });
  assert.ok(result.snapshot);
  return result.snapshot;
}

test("coordinate authority gate excludes stored and mixed datasets", () => {
  const input = graph();
  assert.equal(createFrontierAutomaticDisplaySnapshot({ operationId: "stored", generation: 1, snapshotIdentity: "stored", graph: input, storedPositionCount: input.nodes.length }).reason, "stored-coordinates");
  assert.equal(createFrontierAutomaticDisplaySnapshot({ operationId: "mixed", generation: 1, snapshotIdentity: "mixed", graph: input, storedPositionCount: 1 }).reason, "mixed-coordinates");
});

test("adapter validates a current result and keeps adoption operation-local", async () => {
  let worker: FakeWorker | undefined;
  const adapter = new FrontierAutomaticDisplayAdapter({ createWorker: () => worker = new FakeWorker("complete") });
  const result = await adapter.start(snapshot());
  assert.equal(result.status, "success");
  assert.ok(result.status === "success" && Object.keys(result.positions).length === 3);
  assert.equal(worker?.terminated, true);
  adapter.dispose();
});

test("invalidation terminates the operation and ignores a late completion", async () => {
  let worker: FakeWorker | undefined;
  const adapter = new FrontierAutomaticDisplayAdapter({ createWorker: () => worker = new FakeWorker("pending") });
  const pending = adapter.start(snapshot());
  adapter.invalidate("dataset-replacement");
  worker?.lateMessage?.();
  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(worker?.terminated, true);
  adapter.dispose();
});

test("worker failure returns bounded fallback without exposing partial output", async () => {
  const worker = new FakeWorker("fail");
  const adapter = new FrontierAutomaticDisplayAdapter({ createWorker: () => worker });
  const result = await adapter.start(snapshot());
  assert.deepEqual(result.status, "fallback");
  assert.equal(worker.terminated, true);
  adapter.dispose();
});

test("worker creation failure returns bounded fallback", async () => {
  const states: string[] = [];
  const adapter = new FrontierAutomaticDisplayAdapter({
    createWorker: () => { throw new Error("Worker unavailable"); },
    onState: (state) => states.push(state),
  });
  const result = await adapter.start(snapshot());
  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "worker-create-error:Worker unavailable");
  assert.deepEqual(states, ["fallback"]);
  adapter.dispose();
});

test("cancel wins before completion and publishes no result", async () => {
  let worker: FakeWorker | undefined;
  const adapter = new FrontierAutomaticDisplayAdapter({ createWorker: () => worker = new FakeWorker("pending") });
  const pending = adapter.start(snapshot());
  adapter.cancel("user-cancelled");
  worker?.lateMessage?.();
  const result = await pending;
  assert.equal(result.status, "cancelled");
  assert.equal(worker?.terminated, true);
  adapter.dispose();
});

test("App enables the production async policy while retaining the DEV seam and fallback", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  const initialLayout = fs.readFileSync(path.join(process.cwd(), "src/actual-product-initial-layout.ts"), "utf8");
  const styles = fs.readFileSync(path.join(process.cwd(), "src/styles.css"), "utf8");
  const i18n = fs.readFileSync(path.join(process.cwd(), "src/i18n.ts"), "utf8");
  assert.match(app, /initialLayoutParam === "frontier-12-worker"/);
  assert.match(app, /frontierAsyncProductionEnabled = true/);
  assert.match(app, /frontierAsyncStagingEnabled = import\.meta\.env\.DEV/);
  assert.match(app, /frontierAsyncEnabled = frontierAsyncProductionEnabled \|\| frontierAsyncStagingEnabled/);
  assert.match(app, /if \(frontierAsyncEnabled && !diagnosticOverride/);
  assert.match(app, /frontier-async-status/);
  assert.match(app, /cancelFrontierAutomaticDisplay/);
  assert.ok(app.indexOf('className={"frontier-async-status"') < app.indexOf('<section className="graph-section"'), "pending status stays outside the graph section so the viewport toolbar cannot overlap it");
  assert.match(app, /setFrontierAsyncState\("idle"\)/);
  assert.match(app, /deriveActualProductInitialLayout/);
  assert.match(initialLayout, /settleInitialPlacement/);
  assert.match(app, /setCoordinatesDirty\(false\)/);
  assert.match(styles, /graph--frontier-provisional/);
  assert.match(i18n, /automaticPlacementPending/);
  assert.match(i18n, /cancelAutomaticPlacement/);
});
