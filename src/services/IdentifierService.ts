import type { Dataset, IdCandidateGenerator } from "../dataset";
export function isCoreObjectIdTaken(dataset: Dataset, id: string): boolean { return [...dataset.entities, ...dataset.events, ...dataset.relations].some((object) => object.id === id); }
export function createCoreObjectId(dataset: Dataset, nextCandidate: IdCandidateGenerator = () => globalThis.crypto?.randomUUID?.() ?? `object-${Date.now()}-${Math.random().toString(36).slice(2)}`): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) { const candidate = nextCandidate(); if (typeof candidate === "string" && candidate.trim() && !isCoreObjectIdTaken(dataset, candidate)) return candidate; }
  throw new Error("Unable to generate a unique Core Object ID");
}
