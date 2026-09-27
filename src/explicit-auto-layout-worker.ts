import { runExplicitAutoLayoutOperation, type ExplicitAutoLayoutCalculationResult, type ExplicitAutoLayoutDiagnosticPhase, type ExplicitAutoLayoutSnapshot } from "./explicit-auto-layout-operation.ts";

export type ExplicitAutoLayoutWorkerDiagnostic = Readonly<{
  source: "worker-computation-exception" | "worker-result-postmessage-throw";
  phase: ExplicitAutoLayoutDiagnosticPhase | "result-transport";
  name: string;
  message: string;
  stack: string | null;
}>;

export type ExplicitAutoLayoutWorkerJob = Readonly<{
  kind: "explicit-auto-layout";
  snapshot: ExplicitAutoLayoutSnapshot;
  diagnosticFailureProbe?: "worker-operation";
}>;

export type ExplicitAutoLayoutWorkerMessage = Readonly<{
  kind: "explicit-auto-layout-result";
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  result: ExplicitAutoLayoutCalculationResult;
  diagnostic?: ExplicitAutoLayoutWorkerDiagnostic;
}>;

self.onmessage = (event: MessageEvent<ExplicitAutoLayoutWorkerJob>) => {
  const { snapshot } = event.data;
  let result: ExplicitAutoLayoutCalculationResult;
  let diagnostic: ExplicitAutoLayoutWorkerDiagnostic | undefined;
  if (import.meta.env.DEV) {
    let phase: ExplicitAutoLayoutDiagnosticPhase = "candidate-generation";
    try {
      if (event.data.diagnosticFailureProbe === "worker-operation") {
        throw new Error("Development diagnostic probe: intentional Auto Layout Worker failure");
      }
      result = runExplicitAutoLayoutOperation(snapshot, undefined, (current) => { phase = current; });
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      result = { status: "failed", failure: { code: "EXECUTION_ERROR", message: value.message || "Explicit Auto Layout Worker computation threw" } };
      diagnostic = { source: "worker-computation-exception", phase, name: value.name, message: value.message, stack: value.stack ?? null };
    }
  } else {
    result = runExplicitAutoLayoutOperation(snapshot);
  }
  const message: ExplicitAutoLayoutWorkerMessage = {
    kind: "explicit-auto-layout-result",
    operationId: snapshot.operationId,
    generation: snapshot.generation,
    snapshotIdentity: snapshot.snapshotIdentity,
    result,
    ...(diagnostic ? { diagnostic } : {}),
  };
  try {
    self.postMessage(message);
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    const value = error instanceof Error ? error : new Error(String(error));
    const transportFailure: ExplicitAutoLayoutWorkerMessage = {
      kind: "explicit-auto-layout-result",
      operationId: snapshot.operationId,
      generation: snapshot.generation,
      snapshotIdentity: snapshot.snapshotIdentity,
      result: { status: "failed", failure: { code: "EXECUTION_ERROR", message: value.message || "Explicit Auto Layout Worker result transport threw" } },
      diagnostic: { source: "worker-result-postmessage-throw", phase: "result-transport", name: value.name, message: value.message, stack: value.stack ?? null },
    };
    self.postMessage(transportFailure);
  }
};
