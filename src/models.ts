export type E2RObject = Record<string, unknown> & { id: string };
export type Dataset = { version: string; entities: E2RObject[]; events: E2RObject[]; relations: E2RObject[]; [key: string]: unknown };
export type Diagnostic = { severity: "error" | "warning"; code: string; path: string; relatedIds?: string[] };
export type LoadResult = { dataset: Dataset | null; raw: string; diagnostics: Diagnostic[]; parseError?: string };
export type CoreObjectDraft = { name?: string; description?: string };
export type IdCandidateGenerator = () => string;
export type RelationCreationResult = { dataset: Dataset; relationId: string } | { dataset: Dataset; refusal: string };
export type DeletionAssessment = { ready: true } | { ready: false; reason: string; incidentRelationCount?: number };
export type DeletionResult = { dataset: Dataset; deleted: true; deletedId: string } | { dataset: Dataset; deleted: false; reason: string };
