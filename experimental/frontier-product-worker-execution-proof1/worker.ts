import { computeFrontierProductProposals, DEFAULT_FRONTIER_WORKER_CONFIG, validateFrontierProductResult, type FrontierWorkerConfig, type WorkerGraph } from "./core.ts";

type Job = {
  kind: "frontier-product";
  operationId: string;
  generation: number;
  snapshotIdentity: string;
  graph: WorkerGraph;
  config?: FrontierWorkerConfig;
};

const workerScope = self as DedicatedWorkerGlobalScope;

function envelope(job: Job, status: string, extra: Record<string, unknown> = {}) {
  return { kind: "frontier-product-result", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, status, ...extra };
}

function yieldWorkerTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

workerScope.onmessage = async (event: MessageEvent<Job>) => {
  const job = event.data;
  const startedAt = performance.now();
  try {
    if (!job || job.kind !== "frontier-product") throw new Error("Unsupported Frontier/Product worker job");
    workerScope.postMessage(envelope(job, "started"));
    let candidateGenerationMs = 0;
    let productPresentationMs = 0;
    const result = computeFrontierProductProposals(job.graph, job.config ?? DEFAULT_FRONTIER_WORKER_CONFIG, {
      onCandidateGeneration: (elapsedMs) => { candidateGenerationMs = elapsedMs; },
      onProductEvaluation: (elapsedMs) => { productPresentationMs = elapsedMs; },
    });
    if (result.candidateSet.status !== "completed") {
      workerScope.postMessage(envelope(job, "failed", { failure: result.candidateSet.failure ?? { code: "GENERATOR_FAILURE", message: "Frontier candidate generation failed" }, workerComputeMs: performance.now() - startedAt }));
      return;
    }
    workerScope.postMessage(envelope(job, "progress", { phase: "candidates-ready", candidateCount: result.candidates.length, candidateGenerationMs }));
    // The computation above is the same source-faithful batch used by the direct
    // reference. The yield gives the diagnostic harness a real cancellation seam
    // before the final proposal is published; no partial result is posted.
    await yieldWorkerTurn();
    const validation = validateFrontierProductResult(result);
    if (!validation.ok) {
      workerScope.postMessage(envelope(job, "failed", { failure: { code: validation.code, message: validation.message }, candidateGenerationMs, productPresentationMs, workerComputeMs: performance.now() - startedAt }));
      return;
    }
    workerScope.postMessage(envelope(job, "completed", {
      candidateSet: result.candidateSet,
      candidates: result.candidates,
      proposals: result.proposals,
      selected: result.selected,
      selectedPositionFingerprint: result.selectedPositionFingerprint,
      candidateGenerationMs,
      productPresentationMs,
      workerComputeMs: performance.now() - startedAt,
    }));
  } catch (error) {
    workerScope.postMessage(envelope(job, "failed", { failure: { code: "TECHNICAL_FAILURE", message: error instanceof Error ? error.message : String(error) }, workerComputeMs: performance.now() - startedAt }));
  }
};
