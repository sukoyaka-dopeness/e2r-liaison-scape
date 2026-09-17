import type { ExplicitAutoLayoutOutcome, ExplicitAutoLayoutSnapshot } from "./explicit-auto-layout-operation.ts";
import type { ExplicitAutoLayoutWorkerJob, ExplicitAutoLayoutWorkerMessage } from "./explicit-auto-layout-worker.ts";

export type ExplicitAutoLayoutWorker = {
  onmessage: ((event: MessageEvent<ExplicitAutoLayoutWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ExplicitAutoLayoutWorkerJob): void;
  terminate(): void;
};

export function createBrowserExplicitAutoLayoutWorker(): ExplicitAutoLayoutWorker {
  return new Worker(new URL("./explicit-auto-layout-worker.ts", import.meta.url), { type: "module" });
}

export class ExplicitAutoLayoutBrowserAdapter {
  private active: { snapshot: ExplicitAutoLayoutSnapshot; worker: ExplicitAutoLayoutWorker; settle: (outcome: ExplicitAutoLayoutOutcome) => void } | null = null;
  private disposed = false;
  private readonly createWorker: () => ExplicitAutoLayoutWorker;

  constructor(createWorker: () => ExplicitAutoLayoutWorker = createBrowserExplicitAutoLayoutWorker) { this.createWorker = createWorker; }

  start(snapshot: ExplicitAutoLayoutSnapshot): Promise<ExplicitAutoLayoutOutcome> {
    this.invalidate("replaced-by-new-operation");
    if (this.disposed) return Promise.resolve(this.terminal(snapshot, "cancelled", "adapter-disposed"));
    let worker: ExplicitAutoLayoutWorker;
    try { worker = this.createWorker(); }
    catch (error) { return Promise.resolve(this.terminal(snapshot, "failed", error instanceof Error ? error.message : "worker-construction-failed")); }
    return new Promise((resolve) => {
      this.active = { snapshot, worker, settle: resolve };
      worker.onmessage = (event) => {
        if (this.active?.worker !== worker) return;
        const message = event.data;
        if (message.operationId !== snapshot.operationId || message.generation !== snapshot.generation || message.snapshotIdentity !== snapshot.snapshotIdentity) {
          this.finish(this.terminal(snapshot, "stale", "operation-identity-mismatch"));
        } else if (message.result.status === "failed") {
          this.finish({ status: "failed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: message.result.failure.code, failure: message.result.failure });
        } else {
          this.finish({ status: "completed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, preview: message.result.preview });
        }
      };
      worker.onerror = (event) => this.finish(this.terminal(snapshot, "failed", event.message || "worker-error"));
      worker.postMessage({ kind: "explicit-auto-layout", snapshot });
    });
  }

  cancel(reason = "user-cancelled"): void { if (this.active) this.finish(this.terminal(this.active.snapshot, "cancelled", reason)); }
  invalidate(reason = "input-changed"): void { if (this.active) this.finish(this.terminal(this.active.snapshot, "stale", reason)); }
  dispose(): void { this.disposed = true; this.cancel("adapter-disposed"); }

  private terminal(snapshot: ExplicitAutoLayoutSnapshot, status: "cancelled" | "stale" | "failed", reason: string): ExplicitAutoLayoutOutcome {
    return { status, operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason };
  }

  private finish(outcome: ExplicitAutoLayoutOutcome): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.worker.onmessage = null;
    active.worker.onerror = null;
    active.worker.terminate();
    active.settle(outcome);
  }
}
