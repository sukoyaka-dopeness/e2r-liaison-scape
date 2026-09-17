import type { ExplicitAutoLayoutFailure } from "./explicit-auto-layout-operation.ts";

export type ExplicitAutoLayoutFailureStage =
  | "snapshot-capture"
  | "candidate-generation"
  | "product-evaluation"
  | "result-validation"
  | "worker-execution";

export type ExplicitAutoLayoutFailureDiagnostic = Readonly<{
  stage: ExplicitAutoLayoutFailureStage;
  reasonCode: string;
  operationId: string;
  snapshotIdentity: string | null;
  graphFingerprint: string;
  entityCount: number;
  effectivePinCount: number;
  pinDiagnosticCodes: readonly string[];
  workerStatus: "not-started" | "failed";
  candidateGenerationReached: boolean | null;
  productEvaluationReached: boolean | null;
  validationReached: boolean | null;
}>;

type DiagnosticInput = Readonly<{
  failure: ExplicitAutoLayoutFailure | Readonly<{ code: string }>;
  operationId: string;
  snapshotIdentity?: string | null;
  graphFingerprint: string;
  entityCount: number;
  effectivePinCount: number;
  pinDiagnosticCodes?: readonly string[];
  workerStarted: boolean;
}>;

function stageFor(code: string, workerStarted: boolean): ExplicitAutoLayoutFailureStage {
  if (!workerStarted || code === "INVALID_SNAPSHOT" || code === "PIN_RESOLUTION_FAILED") return "snapshot-capture";
  if (code === "GENERATOR_FAILURE") return "candidate-generation";
  if (code === "INCOMPLETE_RESULT") return "product-evaluation";
  if (code === "NON_FINITE_RESULT" || code === "PIN_VIOLATION") return "result-validation";
  return "worker-execution";
}

export function createExplicitAutoLayoutFailureDiagnostic(input: DiagnosticInput): ExplicitAutoLayoutFailureDiagnostic {
  const stage = stageFor(input.failure.code, input.workerStarted);
  return Object.freeze({
    stage,
    reasonCode: input.failure.code,
    operationId: input.operationId,
    snapshotIdentity: input.snapshotIdentity ?? null,
    graphFingerprint: input.graphFingerprint,
    entityCount: input.entityCount,
    effectivePinCount: input.effectivePinCount,
    pinDiagnosticCodes: Object.freeze([...(input.pinDiagnosticCodes ?? [])]),
    workerStatus: input.workerStarted ? "failed" : "not-started",
    candidateGenerationReached: stage === "snapshot-capture" ? false : stage === "candidate-generation" ? true : stage === "worker-execution" ? null : true,
    productEvaluationReached: stage === "snapshot-capture" || stage === "candidate-generation" ? false : stage === "worker-execution" ? null : true,
    validationReached: stage === "result-validation" ? true : stage === "worker-execution" ? null : false,
  });
}

export function shouldExposeExplicitAutoLayoutFailureDiagnostic(
  development: boolean,
  diagnostic: ExplicitAutoLayoutFailureDiagnostic | null,
): diagnostic is ExplicitAutoLayoutFailureDiagnostic {
  return development && diagnostic !== null;
}
