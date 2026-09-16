import {
  DEFAULT_FRONTIER_WORKER_CONFIG,
  validateFrontierProductResult,
  type FrontierProductResult,
  type FrontierWorkerConfig,
  type Point,
  type WorkerGraph,
} from "../experimental/frontier-product-worker-execution-proof1/core.ts";

export type FrontierAutomaticDisplayWorker = {
  onmessage: ((event: MessageEvent<FrontierAutomaticDisplayWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: FrontierAutomaticDisplayWorkerJob): void;
  terminate(): void;
};

export type FrontierAutomaticDisplayWorkerJob = {
  kind: "frontier-product";
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  graph: WorkerGraph;
  config: FrontierWorkerConfig;
};

export type FrontierAutomaticDisplayWorkerMessage = {
  kind: "frontier-product-result";
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  status: "started" | "progress" | "completed" | "failed";
  failure?: { code: string; message: string };
  selected?: FrontierProductResult["selected"];
  candidateSet?: FrontierProductResult["candidateSet"];
  candidates?: FrontierProductResult["candidates"];
  proposals?: FrontierProductResult["proposals"];
  selectedPositionFingerprint?: string | null;
};

export type FrontierAutomaticDisplaySnapshot = {
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  graph: WorkerGraph;
  config: FrontierWorkerConfig;
};

export type FrontierAutomaticDisplaySnapshotRejection =
  | "stored-coordinates"
  | "mixed-coordinates"
  | "empty-graph";

export type FrontierAutomaticDisplayOutcome =
  | {
    status: "success";
    operationId: string;
    generation: number;
    snapshotIdentity: string;
    positions: Record<string, Point>;
    result: FrontierProductResult;
  }
  | {
    status: "fallback" | "cancelled" | "stale";
    operationId: string;
    generation: number;
    snapshotIdentity: string;
    reason: string;
  };

export type FrontierAutomaticDisplayAdapterOptions = {
  createWorker: () => FrontierAutomaticDisplayWorker;
  onState?: (state: "started" | "completed" | "fallback" | "cancelled" | "stale") => void;
};

export function createFrontierAutomaticDisplaySnapshot({
  operationId,
  generation,
  snapshotIdentity,
  graph,
  storedPositionCount,
  config = DEFAULT_FRONTIER_WORKER_CONFIG,
}: {
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  graph: WorkerGraph;
  storedPositionCount: number;
  config?: FrontierWorkerConfig;
}): { snapshot: FrontierAutomaticDisplaySnapshot } | { snapshot: null; reason: FrontierAutomaticDisplaySnapshotRejection } {
  if (storedPositionCount >= graph.nodes.length && graph.nodes.length > 0) return { snapshot: null, reason: "stored-coordinates" };
  if (storedPositionCount > 0) return { snapshot: null, reason: "mixed-coordinates" };
  if (graph.nodes.length === 0) return { snapshot: null, reason: "empty-graph" };
  const immutableGraph: WorkerGraph = {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
  return {
    snapshot: {
      operationId,
      generation,
      snapshotIdentity,
      graph: immutableGraph,
      config: { ...config },
    },
  };
}

export function createBrowserFrontierAutomaticDisplayWorker(): FrontierAutomaticDisplayWorker {
  return new Worker(new URL("../experimental/frontier-product-worker-execution-proof1/worker.ts", import.meta.url), { type: "module" });
}

function validateCompleteDerivedPositions(result: FrontierProductResult, graph: WorkerGraph): { ok: true } | { ok: false; code: string } {
  if (!result.selected) return { ok: false, code: "MISSING_SELECTION" };
  const positions = result.selected.positions;
  if (Object.keys(positions).length !== graph.nodes.length) return { ok: false, code: "INCOMPLETE_POSITIONS" };
  if (!graph.nodes.every(({ id }) => Number.isFinite(positions[id]?.x) && Number.isFinite(positions[id]?.y))) return { ok: false, code: "NON_FINITE_POSITIONS" };
  return { ok: true };
}

export class FrontierAutomaticDisplayAdapter {
  private readonly options: FrontierAutomaticDisplayAdapterOptions;
  private active: { snapshot: FrontierAutomaticDisplaySnapshot; worker: FrontierAutomaticDisplayWorker; settle: (outcome: FrontierAutomaticDisplayOutcome) => void } | null = null;
  private disposed = false;

  constructor(options: FrontierAutomaticDisplayAdapterOptions) {
    this.options = options;
  }

  start(snapshot: FrontierAutomaticDisplaySnapshot): Promise<FrontierAutomaticDisplayOutcome> {
    this.invalidate("replaced-by-new-operation");
    if (this.disposed) {
      return Promise.resolve({ status: "cancelled", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: "adapter-disposed" });
    }
    let worker: FrontierAutomaticDisplayWorker;
    try {
      worker = this.options.createWorker();
    } catch (error) {
      const outcome: FrontierAutomaticDisplayOutcome = {
        status: "fallback",
        operationId: snapshot.operationId,
        generation: snapshot.generation,
        snapshotIdentity: snapshot.snapshotIdentity,
        reason: "worker-create-error:" + (error instanceof Error ? error.message : "unknown"),
      };
      this.options.onState?.("fallback");
      return Promise.resolve(outcome);
    }
    const job: FrontierAutomaticDisplayWorkerJob = {
      kind: "frontier-product",
      operationId: snapshot.operationId,
      generation: snapshot.generation,
      snapshotIdentity: snapshot.snapshotIdentity,
      graph: snapshot.graph,
      config: snapshot.config,
    };
    return new Promise<FrontierAutomaticDisplayOutcome>((resolve) => {
      this.active = { snapshot, worker, settle: resolve };
      worker.onmessage = (event) => this.handleMessage(snapshot, worker, event.data);
      worker.onerror = (event) => this.finish(snapshot, worker, { status: "fallback", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: "worker-error:" + (event.message || "unknown") });
      this.options.onState?.("started");
      worker.postMessage(job);
    });
  }

  invalidate(reason: string): void {
    const active = this.active;
    if (!active) return;
    this.finish(active.snapshot, active.worker, { status: "stale", operationId: active.snapshot.operationId, generation: active.snapshot.generation, snapshotIdentity: active.snapshot.snapshotIdentity, reason });
  }

  cancel(reason = "cancel-requested"): void {
    const active = this.active;
    if (!active) return;
    this.finish(active.snapshot, active.worker, { status: "cancelled", operationId: active.snapshot.operationId, generation: active.snapshot.generation, snapshotIdentity: active.snapshot.snapshotIdentity, reason });
  }

  dispose(): void {
    this.disposed = true;
    const active = this.active;
    if (!active) return;
    const settle = active.settle;
    this.active = null;
    active.worker.onmessage = null;
    active.worker.onerror = null;
    active.worker.terminate();
    settle({
      status: "cancelled",
      operationId: active.snapshot.operationId,
      generation: active.snapshot.generation,
      snapshotIdentity: active.snapshot.snapshotIdentity,
      reason: "adapter-disposed",
    });
  }

  private handleMessage(snapshot: FrontierAutomaticDisplaySnapshot, worker: FrontierAutomaticDisplayWorker, message: FrontierAutomaticDisplayWorkerMessage): void {
    if (this.active?.worker !== worker || this.active.snapshot !== snapshot) return;
    if (message.operationId !== snapshot.operationId || message.generation !== snapshot.generation || message.snapshotIdentity !== snapshot.snapshotIdentity) {
      this.finish(snapshot, worker, { status: "stale", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: "operation-generation-snapshot-mismatch" });
      return;
    }
    if (message.status === "started" || message.status === "progress") return;
    if (message.status === "failed") {
      this.finish(snapshot, worker, { status: "fallback", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: message.failure?.code ?? "worker-failure" });
      return;
    }
    if (!message.candidateSet || !message.candidates || !message.proposals || !message.selected) {
      this.finish(snapshot, worker, { status: "fallback", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: "INCOMPLETE_RESULT" });
      return;
    }
    const result = message as unknown as FrontierProductResult;
    const validation = validateFrontierProductResult(result);
    if (!validation.ok) {
      this.finish(snapshot, worker, { status: "fallback", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: validation.code });
      return;
    }
    const positionValidation = validateCompleteDerivedPositions(result, snapshot.graph);
    if (!positionValidation.ok) {
      this.finish(snapshot, worker, { status: "fallback", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: positionValidation.code });
      return;
    }
    this.finish(snapshot, worker, {
      status: "success",
      operationId: snapshot.operationId,
      generation: snapshot.generation,
      snapshotIdentity: snapshot.snapshotIdentity,
      positions: Object.fromEntries(Object.entries(result.selected!.positions).map(([id, point]) => [id, { x: point.x, y: point.y }])),
      result,
    });
  }

  private finish(snapshot: FrontierAutomaticDisplaySnapshot, worker: FrontierAutomaticDisplayWorker, outcome: FrontierAutomaticDisplayOutcome): void {
    if (this.active?.worker !== worker || this.active.snapshot !== snapshot) return;
    const settle = this.active.settle;
    this.active = null;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    this.options.onState?.(outcome.status === "success" ? "completed" : outcome.status);
    settle(outcome);
  }
}
