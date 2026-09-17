import { parentPort, workerData } from "node:worker_threads";
import { computePinnedFrontierProductProposals, validatePinnedFrontierResult } from "./core.ts";

if (!parentPort) throw new Error("Pinned Frontier feasibility worker requires a parent port");
const job = workerData;
parentPort.postMessage({ kind: "started", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity });
await new Promise((resolve) => setImmediate(resolve));
try {
  const result = computePinnedFrontierProductProposals(job.input, job.config);
  const validation = validatePinnedFrontierResult(result, job.input);
  if (!validation.ok) {
    parentPort.postMessage({ kind: "failed", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, failure: validation });
  } else {
    parentPort.postMessage({ kind: "completed", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, result });
  }
} catch (error) {
  parentPort.postMessage({ kind: "failed", operationId: job.operationId, generation: job.generation, snapshotIdentity: job.snapshotIdentity, failure: { code: "WORKER_EXCEPTION", message: error instanceof Error ? error.message : String(error) } });
}
