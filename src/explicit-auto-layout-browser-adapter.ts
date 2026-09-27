import type { ExplicitAutoLayoutOutcome, ExplicitAutoLayoutSnapshot } from "./explicit-auto-layout-operation.ts";
import type { ExplicitAutoLayoutWorkerJob, ExplicitAutoLayoutWorkerMessage } from "./explicit-auto-layout-worker.ts";

const workerDiagnosticsEnabled = Boolean(import.meta.env?.DEV);

function readErrorField(value: unknown, field: "name" | "message" | "stack"): string | null {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

export type ExplicitAutoLayoutWorker = {
  onmessage: ((event: MessageEvent<ExplicitAutoLayoutWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
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
  private readonly diagnosticsEnabled: boolean;

  constructor(createWorker: () => ExplicitAutoLayoutWorker = createBrowserExplicitAutoLayoutWorker, diagnosticsEnabled = workerDiagnosticsEnabled) {
    this.createWorker = createWorker;
    this.diagnosticsEnabled = diagnosticsEnabled;
  }

  start(snapshot: ExplicitAutoLayoutSnapshot, diagnosticFailureProbe = false): Promise<ExplicitAutoLayoutOutcome> {
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
          this.finish({ status: "failed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason: message.result.failure.code, failure: message.result.failure, ...(message.diagnostic ? { workerDiagnostic: message.diagnostic } : {}) });
        } else {
          this.finish({ status: "completed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, preview: message.result.preview });
        }
      };
      worker.onerror = (event) => {
        if (!this.diagnosticsEnabled) {
          this.finish(this.terminal(snapshot, "failed", "worker-error"));
          return;
        }
        this.finish(this.workerFailure(snapshot, event.message || "worker-error", {
          source: "worker-error-event", message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno,
          errorType: event.error === null ? "null" : typeof event.error,
          errorName: readErrorField(event.error, "name"),
          errorMessage: readErrorField(event.error, "message"),
          errorStack: readErrorField(event.error, "stack"),
          eventType: event.type, timeStamp: event.timeStamp, isTrusted: event.isTrusted,
          cancelable: event.cancelable, defaultPrevented: event.defaultPrevented,
        }));
      };
      worker.onmessageerror = (event) => {
        if (!this.diagnosticsEnabled) {
          this.finish(this.terminal(snapshot, "failed", "worker-messageerror"));
          return;
        }
        this.finish(this.workerFailure(snapshot, "worker-messageerror", {
          source: "worker-messageerror-event",
          dataType: event.data === null ? "null" : typeof event.data,
          origin: event.origin,
          lastEventId: event.lastEventId,
        }));
      };
      try {
        worker.postMessage({ kind: "explicit-auto-layout", snapshot, ...(this.diagnosticsEnabled && diagnosticFailureProbe ? { diagnosticFailureProbe: "worker-operation" as const } : {}) });
      } catch (error) {
        if (!this.diagnosticsEnabled) {
          this.finish(this.terminal(snapshot, "failed", "worker-postmessage-throw"));
        } else {
          const value = error instanceof Error ? error : new Error(String(error));
          this.finish(this.workerFailure(snapshot, "worker-postmessage-throw", { source: "main-to-worker-postmessage-throw", name: value.name, message: value.message, stack: value.stack ?? null }));
        }
      }
    });
  }

  cancel(reason = "user-cancelled"): void { if (this.active) this.finish(this.terminal(this.active.snapshot, "cancelled", reason)); }
  invalidate(reason = "input-changed"): void { if (this.active) this.finish(this.terminal(this.active.snapshot, "stale", reason)); }
  dispose(): void { this.disposed = true; this.cancel("adapter-disposed"); }

  private terminal(snapshot: ExplicitAutoLayoutSnapshot, status: "cancelled" | "stale" | "failed", reason: string): ExplicitAutoLayoutOutcome {
    return { status, operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason };
  }

  private workerFailure(snapshot: ExplicitAutoLayoutSnapshot, reason: string, workerDiagnostic: Readonly<Record<string, unknown>>): ExplicitAutoLayoutOutcome & { status: "failed" } {
    return { status: "failed", operationId: snapshot.operationId, generation: snapshot.generation, snapshotIdentity: snapshot.snapshotIdentity, reason, workerDiagnostic };
  }

  private finish(outcome: ExplicitAutoLayoutOutcome): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.worker.onmessage = null;
    active.worker.onerror = null;
    if (active.worker.onmessageerror) active.worker.onmessageerror = null;
    active.worker.terminate();
    active.settle(outcome);
  }
}
