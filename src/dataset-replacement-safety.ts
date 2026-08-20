export type PendingUserWorkSources = {
  unsavedCoordinates: boolean;
  manualRelationRoute: boolean;
  manualRelationLabel: boolean;
  manualNodeLabel: boolean;
  meaningfulCreationDraft: boolean;
  meaningfulEntityDetailDraft: boolean;
  meaningfulRelationDetailDraft: boolean;
};

export type ReplacementSafetyState = {
  datasetModified: boolean;
  pendingUserWork: boolean;
  recoverableSessionState: boolean;
  replacementConfirmationRequired: boolean;
  replacementCase: "clean" | "modified-only" | "pending-only" | "modified-and-pending";
};

function contentEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => contentEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && contentEqual(leftRecord[key], rightRecord[key]));
}

export function isDatasetModified(cleanBaseline: unknown, currentDataset: unknown): boolean {
  return !contentEqual(cleanBaseline, currentDataset);
}

export function hasPendingUserWork(sources: PendingUserWorkSources): boolean {
  return Object.values(sources).some(Boolean);
}

export function deriveReplacementSafetyState({
  cleanBaseline,
  currentDataset,
  pendingUserWork,
  recoverableSessionState = false,
}: {
  cleanBaseline: unknown;
  currentDataset: unknown;
  pendingUserWork: boolean;
  recoverableSessionState?: boolean;
}): ReplacementSafetyState {
  const datasetModified = isDatasetModified(cleanBaseline, currentDataset);
  const replacementCase = datasetModified
    ? pendingUserWork ? "modified-and-pending" : "modified-only"
    : pendingUserWork ? "pending-only" : "clean";
  return {
    datasetModified,
    pendingUserWork,
    recoverableSessionState,
    replacementConfirmationRequired: datasetModified || pendingUserWork,
    replacementCase,
  };
}

export function preservePendingCoordinates<T>({
  positions,
  coordinatesDirty,
  storedPositions,
}: {
  positions: T;
  coordinatesDirty: boolean;
  storedPositions: T;
}): { positions: T; coordinatesDirty: boolean } {
  return coordinatesDirty
    ? { positions, coordinatesDirty: true }
    : { positions: storedPositions, coordinatesDirty: false };
}

export function resetManualRelationRoute<T>(
  routes: Record<string, T>,
  relationId: string,
): Record<string, T> {
  const next = { ...routes };
  delete next[relationId];
  return next;
}

export function applyEntityCreationPlacement<T>({
  positions,
  entityId,
  explicitPlacement,
  automaticPlacement,
  coordinatesDirty,
}: {
  positions: Record<string, T>;
  entityId: string;
  explicitPlacement: T | null;
  automaticPlacement: T;
  coordinatesDirty: boolean;
}): { positions: Record<string, T>; coordinatesDirty: boolean } {
  return {
    positions: { ...positions, [entityId]: explicitPlacement ?? automaticPlacement },
    coordinatesDirty: coordinatesDirty || explicitPlacement !== null,
  };
}

export function candidateFromLoadResult<T extends { dataset: unknown | null }>(result: T): T["dataset"] {
  return result.dataset;
}

export function decideDatasetReplacement<T>({
  candidate,
  datasetModified,
  pendingUserWork,
}: {
  candidate: T;
  datasetModified: boolean;
  pendingUserWork: boolean;
}): { action: "accept" | "stage"; candidate: T; refreshBaseline: boolean } {
  return {
    action: datasetModified || pendingUserWork ? "stage" : "accept",
    candidate,
    refreshBaseline: !(datasetModified || pendingUserWork),
  };
}

export function cancelStagedDatasetReplacement<T>(_stagedCandidate: T): { stagedCandidate: null; refreshBaseline: false } {
  return { stagedCandidate: null, refreshBaseline: false };
}

export function discardAndContinueStagedDatasetReplacement<T>(stagedCandidate: T): { candidate: T; stagedCandidate: null; refreshBaseline: true } {
  return { candidate: stagedCandidate, stagedCandidate: null, refreshBaseline: true };
}
