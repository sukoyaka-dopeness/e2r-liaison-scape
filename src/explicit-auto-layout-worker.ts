import { runExplicitAutoLayoutOperation, type ExplicitAutoLayoutCalculationResult, type ExplicitAutoLayoutSnapshot } from "./explicit-auto-layout-operation.ts";

export type ExplicitAutoLayoutWorkerJob = Readonly<{
  kind: "explicit-auto-layout";
  snapshot: ExplicitAutoLayoutSnapshot;
}>;

export type ExplicitAutoLayoutWorkerMessage = Readonly<{
  kind: "explicit-auto-layout-result";
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  result: ExplicitAutoLayoutCalculationResult;
}>;

self.onmessage = (event: MessageEvent<ExplicitAutoLayoutWorkerJob>) => {
  const { snapshot } = event.data;
  const message: ExplicitAutoLayoutWorkerMessage = {
    kind: "explicit-auto-layout-result",
    operationId: snapshot.operationId,
    generation: snapshot.generation,
    snapshotIdentity: snapshot.snapshotIdentity,
    result: runExplicitAutoLayoutOperation(snapshot),
  };
  self.postMessage(message);
};
